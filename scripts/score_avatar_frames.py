#!/usr/bin/env python3
"""Score extracted avatar frames for likeness quality and reference usefulness."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageFilter, ImageStat


REPO_ROOT = Path(__file__).resolve().parents[1]
REFERENCE_ROOT = REPO_ROOT / "avatars"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score extracted avatar frames.")
    parser.add_argument("--actor", choices=["jack", "julia", "all"], default="all")
    parser.add_argument("--min-sharpness", type=float, default=10.0)
    parser.add_argument("--min-contrast", type=float, default=20.0)
    return parser.parse_args()


def image_metrics(path: Path) -> dict[str, float]:
    with Image.open(path) as image:
        rgb = image.convert("RGB")
        grayscale = rgb.convert("L")
        edge_image = grayscale.filter(ImageFilter.FIND_EDGES)
        brightness = ImageStat.Stat(grayscale).mean[0]
        contrast = ImageStat.Stat(grayscale).stddev[0]
        sharpness = ImageStat.Stat(edge_image).mean[0]
        return {
            "brightness": round(float(brightness), 2),
            "contrast": round(float(contrast), 2),
            "sharpness": round(float(sharpness), 2),
        }


def score_actor(actor: str, min_sharpness: float, min_contrast: float) -> dict[str, object]:
    frame_dir = REFERENCE_ROOT / actor / "reference" / "frames"
    results = []
    for frame in sorted(frame_dir.glob("*.jpg")):
        metrics = image_metrics(frame)
        accepted = metrics["sharpness"] >= min_sharpness and metrics["contrast"] >= min_contrast
        results.append(
            {
                "frame": str(frame.relative_to(REPO_ROOT)),
                "accepted": accepted,
                **metrics,
            }
        )
    payload = {
        "actor": actor,
        "frame_count": len(results),
        "accepted_count": sum(1 for result in results if result["accepted"]),
        "results": results,
    }
    output = REFERENCE_ROOT / actor / "reference" / "frame-scores.json"
    output.write_text(json.dumps(payload, indent=2))
    return payload


def main() -> int:
    args = parse_args()
    actors = ["jack", "julia"] if args.actor == "all" else [args.actor]
    for actor in actors:
        payload = score_actor(actor, args.min_sharpness, args.min_contrast)
        print(f"Scored {payload['frame_count']} frames for {actor}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
