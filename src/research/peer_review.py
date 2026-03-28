"""
AGI-1 Auto-Scientist: Aegis Peer Review Board
Simulates a highly skeptical "Reviewer #2" that critiques the whitepaper
for methodological flaws, hallucinated citations, data inconsistencies,
and logical errors before the paper is finalized.
"""

import asyncio
import json
import logging
import os
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("agi1.research.peer_review")

GROQ_MODEL = "llama-3.3-70b-versatile"


def _get_groq_key() -> str:
    return os.environ.get("GROQ_API_KEY", os.environ.get("GROQ_LLAMA_KEY", ""))


async def _llm_call(prompt: str, temperature: float = 0.2, max_tokens: int = 3000) -> str:
    key = _get_groq_key()
    if not key:
        return '{"decision": "accept_with_revisions", "overall_score": 5, "summary": "LLM unavailable"}'

    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }).encode()

    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None, lambda: urllib.request.urlopen(req, timeout=60).read()
    )
    data = json.loads(response)
    return data.get("choices", [{}])[0].get("message", {}).get("content", "")


@dataclass
class ReviewVerdict:
    decision: str  # "accept", "accept_with_revisions", "reject"
    overall_score: float  # 0-10
    summary: str
    methodological_flaws: list[str] = field(default_factory=list)
    hallucinated_citations: list[str] = field(default_factory=list)
    data_inconsistencies: list[str] = field(default_factory=list)
    mathematical_errors: list[str] = field(default_factory=list)
    logical_gaps: list[str] = field(default_factory=list)
    strengths: list[str] = field(default_factory=list)
    other_issues: list[str] = field(default_factory=list)


class AegisReviewBoard:
    """
    Simulates a rigorous peer review panel.
    Acts as the notorious "Reviewer #2" — highly skeptical,
    detail-oriented, and unforgiving of sloppy methodology.
    """

    REVIEWER_PROMPT = """You are Reviewer #2 — the most feared, rigorous, and skeptical
peer reviewer in academia. You have been asked to review the following research paper.

Your job is to find EVERY flaw, inconsistency, and weakness. You are not here to be nice.
You are here to ensure scientific rigor.

PAPER TO REVIEW:
---
{paper_content}
---

Produce your review as a JSON object with this exact structure:
{{
    "decision": "accept" | "accept_with_revisions" | "reject",
    "overall_score": <number 0-10>,
    "summary": "<2-3 sentence overall assessment>",
    "methodological_flaws": ["<specific flaw 1>", "<specific flaw 2>", ...],
    "hallucinated_citations": ["<any citation that looks fabricated or doesn't match the references section>"],
    "data_inconsistencies": ["<any number that contradicts another number in the paper>", ...],
    "mathematical_errors": ["<any incorrect calculation, wrong formula, or statistical misuse>"],
    "logical_gaps": ["<any logical leap or unsupported conclusion>"],
    "strengths": ["<what the paper does well>"],
    "other_issues": ["<anything else problematic>"]
}}

SCORING GUIDE:
- 0-3: Reject (fatal flaws, fabricated data, meaningless results)
- 4-5: Major Revisions Required (significant methodological issues)
- 6-7: Minor Revisions (solid work with some gaps)
- 8-10: Accept (strong methodology, honest limitations, real contribution)

SPECIFIC THINGS TO CHECK:
1. Are the citations real? Do they match the references section exactly?
2. Are the statistics used correctly? (e.g., is a t-test appropriate for the data?)
3. Does the abstract accurately reflect the results?
4. Are there any numbers in the results that contradict other numbers?
5. Is the hypothesis actually testable? Was it actually tested?
6. Are the conclusions supported by the evidence presented?
7. Are limitations honestly acknowledged?

Return ONLY the JSON object, no other text."""

    async def review(self, whitepaper) -> ReviewVerdict:
        """Submit a whitepaper draft for rigorous peer review."""
        paper_content = whitepaper.content if hasattr(whitepaper, 'content') else str(whitepaper)

        # Truncate very long papers for the review prompt
        if len(paper_content) > 8000:
            paper_content = paper_content[:8000] + "\n\n[Paper truncated for review]"

        prompt = self.REVIEWER_PROMPT.format(paper_content=paper_content)

        response = await _llm_call(prompt, temperature=0.2)

        # Parse the JSON review
        try:
            # Find JSON in response
            start = response.index("{")
            end = response.rindex("}") + 1
            review_data = json.loads(response[start:end])

            return ReviewVerdict(
                decision=review_data.get("decision", "accept_with_revisions"),
                overall_score=float(review_data.get("overall_score", 5)),
                summary=review_data.get("summary", ""),
                methodological_flaws=review_data.get("methodological_flaws", []),
                hallucinated_citations=review_data.get("hallucinated_citations", []),
                data_inconsistencies=review_data.get("data_inconsistencies", []),
                mathematical_errors=review_data.get("mathematical_errors", []),
                logical_gaps=review_data.get("logical_gaps", []),
                strengths=review_data.get("strengths", []),
                other_issues=review_data.get("other_issues", []),
            )
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Failed to parse review JSON: %s", exc)
            # Return a moderate review as fallback
            return ReviewVerdict(
                decision="accept_with_revisions",
                overall_score=5.0,
                summary=f"Review parsing failed. Raw response: {response[:500]}",
                other_issues=["Peer review response could not be parsed as structured JSON"],
            )
