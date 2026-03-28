"""
CLI entry point for the Auto-Scientist pipeline.

Usage:
    python3 -m src.research --topic "Novel ways to optimize LLM routing latency"
    python3 -m src.research --topic "Trading strategy for S&P 500 based on weather patterns" --session-id custom-123
"""

import argparse
import asyncio
import json
import logging
import sys

from .director import ResearchDirector


def main():
    parser = argparse.ArgumentParser(description="AGI-1 Auto-Scientist Research Pipeline")
    parser.add_argument("--topic", required=True, help="Research topic to investigate")
    parser.add_argument("--session-id", help="Optional session ID for tracking")
    parser.add_argument("--lab-dir", default="/home/ubuntu/agi-research-lab", help="Simulation sandbox directory")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    parser.add_argument("--output", help="Output file for the final paper (default: stdout)")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    director = ResearchDirector(lab_dir=args.lab_dir)

    print(f"\n{'='*70}")
    print(f"  AGI-1 AUTO-SCIENTIST PIPELINE")
    print(f"  Topic: {args.topic}")
    print(f"  Lab Directory: {args.lab_dir}")
    print(f"{'='*70}\n")

    session = asyncio.run(director.run_research(args.topic, session_id=args.session_id))

    print(f"\n{'='*70}")
    print(f"  PIPELINE COMPLETE")
    print(f"  Phase: {session.phase.value}")
    print(f"  Hypotheses generated: {len(session.hypotheses)}")
    if session.selected_hypothesis:
        print(f"  Selected hypothesis: {session.selected_hypothesis.statement[:100]}")
    if session.simulation_result:
        print(f"  Simulation: {'SUCCESS' if session.simulation_result.success else 'FAILED'} ({session.simulation_result.retries_used} retries)")
    if session.review_verdict:
        print(f"  Peer review: {session.review_verdict.decision} (score: {session.review_verdict.overall_score}/10)")
    print(f"  Final paper: {len(session.final_paper)} chars ({len(session.final_paper.split())} words)")
    if session.error:
        print(f"  ERROR: {session.error}")
    print(f"{'='*70}\n")

    # Output the final paper
    if session.final_paper:
        if args.output:
            with open(args.output, "w") as f:
                f.write(session.final_paper)
            print(f"Paper written to: {args.output}")
        else:
            print("\n--- WHITEPAPER ---\n")
            print(session.final_paper)
            print("\n--- END ---\n")

    # Print logs
    print("\n--- PIPELINE LOG ---")
    for log_entry in session.logs:
        print(f"  {log_entry}")

    sys.exit(0 if session.phase.value == "complete" else 1)


if __name__ == "__main__":
    main()
