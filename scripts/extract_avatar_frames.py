#!/usr/bin/env python3
"""Extract curated avatar reference frames from Jack/Julia source videos.

This script uses ffmpeg when available and writes task-ready frame packs into:
  avatars/<actor>/reference/frames/

It is intentionally production-friendly:
- no silent dependency assumptions
- clear accepted/rejected logs
- stable filenames for later scoring and manifest generation
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_AVATAR_ROOT = REPO_ROOT / "frontend" / "public" / "avatars"
REFERENCE_ROOT = REPO_ROOT / "avatars"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract avatar reference frames from source videos.")
    parser.add_argument("--actor", choices=["jack", "julia", "all"], default="all")
    parser.add_argument("--fps", type=float, default=0.35, help="Extraction rate in frames per second.")
    parser.add_argument("--limit", type=int, default=24, help="Maximum frames per actor.")
    return parser.parse_args()


def require_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
      raise RuntimeError(
          "ffmpeg is required to extract avatar frames. Install it first, then rerun this script."
      )
    return ffmpeg


def actor_sources(actor: str) -> list[Path]:
    if actor == "jack":
        return [FRONTEND_AVATAR_ROOT / "jack-idle.mp4", FRONTEND_AVATAR_ROOT / "jack-speaking.mp4"]
    if actor == "julia":
        return [
            FRONTEND_AVATAR_ROOT / "julia-idle.mp4",
            FRONTEND_AVATAR_ROOT / "julia-speaking.mp4",
            FRONTEND_AVATAR_ROOT / "julia-alt.mp4",
        ]
    raise ValueError(f"Unsupported actor: {actor}")


def extract_actor_frames(ffmpeg: str, actor: str, fps: float, limit: int) -> dict[str, object]:
    output_dir = REFERENCE_ROOT / actor / "reference" / "frames"
    output_dir.mkdir(parents=True, exist_ok=True)

    accepted: list[str] = []
    rejected: list[str] = []

    for index, source in enumerate(actor_sources(actor)):
        if not source.exists():
            rejected.append(str(source))
            continue

        pattern = output_dir / f"{actor}-{index}-%04d.jpg"
        cmd = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-vf",
            f"fps={fps},scale=960:-1",
            "-frames:v",
            str(limit),
            str(pattern),
        ]
        subprocess.run(cmd, check=True)

    frames = sorted(output_dir.glob("*.jpg"))
    for frame in frames[:limit]:
        accepted.append(str(frame.relative_to(REPO_ROOT)))
    for frame in frames[limit:]:
        frame.unlink(missing_ok=True)
        rejected.append(str(frame.relative_to(REPO_ROOT)))

    return {
        "actor": actor,
        "accepted_frames": accepted,
        "rejected_frames": rejected,
        "output_dir": str(output_dir.relative_to(REPO_ROOT)),
    }


def write_log(actor: str, payload: dict[str, object]) -> None:
    log_dir = REFERENCE_ROOT / actor / "reference"
    log_dir.mkdir(parents=True, exist_ok=True)
    (log_dir / "frame-extraction-log.json").write_text(json.dumps(payload, indent=2))


def main() -> int:
    args = parse_args()
    try:
        ffmpeg = require_ffmpeg()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    actors = ["jack", "julia"] if args.actor == "all" else [args.actor]
    for actor in actors:
        payload = extract_actor_frames(ffmpeg, actor, args.fps, args.limit)
        write_log(actor, payload)
        print(f"Extracted frames for {actor}: {len(payload['accepted_frames'])} accepted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
