#!/usr/bin/env python3
"""Build avatar reference manifests from extracted/scored frames."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
REFERENCE_ROOT = REPO_ROOT / "avatars"


VISUAL_DNA = {
    "jack": {
        "primaryGlow": "#548CF3",
        "secondaryGlow": "#0077FF",
        "actionAccent": "#FF6A00",
        "baseObsidian": "#0C0A14",
        "frostHighlight": "#C0C7C7",
    },
    "julia": {
        "primaryGlow": "#EF2E6A",
        "secondaryGlow": "#548CF3",
        "actionAccent": "#FF6A00",
        "baseObsidian": "#0C0A14",
        "frostHighlight": "#F4E8F0",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build avatar reference manifests.")
    parser.add_argument("--actor", choices=["jack", "julia", "all"], default="all")
    parser.add_argument("--top", type=int, default=8, help="Top accepted frames to retain in the manifest.")
    return parser.parse_args()


def build_manifest(actor: str, top: int) -> dict[str, object]:
    reference_dir = REFERENCE_ROOT / actor / "reference"
    scores_path = reference_dir / "frame-scores.json"
    extraction_path = reference_dir / "frame-extraction-log.json"

    scores = json.loads(scores_path.read_text()) if scores_path.exists() else {"results": []}
    extraction = json.loads(extraction_path.read_text()) if extraction_path.exists() else {}

    accepted = [item for item in scores.get("results", []) if item.get("accepted")]
    accepted.sort(key=lambda item: (item.get("sharpness", 0), item.get("contrast", 0)), reverse=True)

    manifest = {
        "actor": actor,
        "visual_dna": VISUAL_DNA[actor],
        "reference_ready": bool(accepted),
        "selected_frames": accepted[:top],
        "accepted_frame_count": len(accepted),
        "extraction_log": extraction,
        "likeness_checklist": [
            "Face shape remains immediately recognizable against the production idle video.",
            "Eye line and brow geometry match the source identity.",
            "Lighting stays premium dark with blue/orange accents intact.",
            "Hair silhouette and wardrobe profile remain stable across fallback renders.",
        ],
    }
    output_path = reference_dir / "reference-manifest.json"
    output_path.write_text(json.dumps(manifest, indent=2))
    return manifest


def main() -> int:
    args = parse_args()
    actors = ["jack", "julia"] if args.actor == "all" else [args.actor]
    for actor in actors:
        manifest = build_manifest(actor, args.top)
        print(f"Built reference manifest for {actor}: {manifest['accepted_frame_count']} accepted frames")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
