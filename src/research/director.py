"""
AGI-1 Auto-Scientist: Research Director & Hypothesis Engine
Core orchestrator for the 5-step scientific method loop:
1. Literature Review -> 2. Hypothesis Generation -> 3. Simulation ->
4. Analysis & Drafting -> 5. Peer Review & Revision
"""

import asyncio
import json
import logging
import os
import time
import urllib.request
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .literature_rag import LiteratureReview, conduct_literature_review
from .lab_sandbox import execute_simulation, SimulationResult
from .analyst import analyze_results, draft_whitepaper, WhitepaperDraft
from .peer_review import AegisReviewBoard, ReviewVerdict

logger = logging.getLogger("agi1.research.director")

GROQ_API_KEY: Optional[str] = None
GROQ_MODEL = "llama-3.3-70b-versatile"


def _get_groq_key() -> str:
    global GROQ_API_KEY
    if GROQ_API_KEY is None:
        GROQ_API_KEY = os.environ.get("GROQ_API_KEY", os.environ.get("GROQ_LLAMA_KEY", ""))
    return GROQ_API_KEY


async def _llm_call(prompt: str, temperature: float = 0.5, max_tokens: int = 2048) -> str:
    key = _get_groq_key()
    if not key:
        raise RuntimeError("GROQ_API_KEY not configured")

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


class ResearchPhase(Enum):
    INITIALIZED = "initialized"
    LITERATURE_REVIEW = "literature_review"
    HYPOTHESIS_GENERATION = "hypothesis_generation"
    SIMULATION = "simulation"
    ANALYSIS = "analysis"
    PEER_REVIEW = "peer_review"
    REVISION = "revision"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class Hypothesis:
    statement: str
    rationale: str
    testability_score: float  # 0-1
    feasibility_score: float  # 0-1
    novelty_score: float  # 0-1
    simulation_approach: str
    rank: int = 0


@dataclass
class ResearchSession:
    session_id: str
    topic: str
    phase: ResearchPhase = ResearchPhase.INITIALIZED
    started_at: float = field(default_factory=time.time)
    literature_review: Optional[LiteratureReview] = None
    hypotheses: list[Hypothesis] = field(default_factory=list)
    selected_hypothesis: Optional[Hypothesis] = None
    simulation_code: str = ""
    simulation_result: Optional[SimulationResult] = None
    analysis_text: str = ""
    whitepaper: Optional[WhitepaperDraft] = None
    review_verdict: Optional[ReviewVerdict] = None
    final_paper: str = ""
    error: str = ""
    logs: list[str] = field(default_factory=list)

    def log(self, message: str):
        entry = f"[{time.strftime('%H:%M:%S')}] {message}"
        self.logs.append(entry)
        logger.info("[%s] %s", self.session_id, message)


class HypothesisGenerator:
    """Uses Tree-of-Thoughts prompting to generate, critique, and rank hypotheses."""

    async def generate(self, gap_analysis: str, topic: str) -> list[Hypothesis]:
        prompt = f"""You are a senior research scientist. You have conducted a literature review on: "{topic}"

Here is the gap analysis from the literature:

{gap_analysis}

Using Tree-of-Thoughts reasoning, generate exactly 3 distinct, novel, and TESTABLE hypotheses that address the identified research gaps.

For each hypothesis, provide:
1. STATEMENT: A clear, falsifiable hypothesis statement
2. RATIONALE: Why this hypothesis is worth testing (2-3 sentences)
3. TESTABILITY: How could this be tested with a Python simulation? (specific approach)
4. FEASIBILITY_SCORE: 0.0-1.0 (can we test this with code in <5 minutes?)
5. NOVELTY_SCORE: 0.0-1.0 (how novel is this compared to existing work?)

Format as JSON array:
[
  {{
    "statement": "...",
    "rationale": "...",
    "testability": "...",
    "feasibility_score": 0.8,
    "novelty_score": 0.7
  }}
]

Return ONLY the JSON array, no other text."""

        response = await _llm_call(prompt, temperature=0.7)

        # Parse JSON from response
        hypotheses = []
        try:
            # Find JSON array in response
            start = response.index("[")
            end = response.rindex("]") + 1
            raw = json.loads(response[start:end])

            for i, h in enumerate(raw[:3]):
                feasibility = float(h.get("feasibility_score", 0.5))
                novelty = float(h.get("novelty_score", 0.5))
                testability = (feasibility + novelty) / 2

                hypotheses.append(Hypothesis(
                    statement=h.get("statement", ""),
                    rationale=h.get("rationale", ""),
                    testability_score=testability,
                    feasibility_score=feasibility,
                    novelty_score=novelty,
                    simulation_approach=h.get("testability", ""),
                    rank=i + 1,
                ))
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Failed to parse hypotheses JSON: %s", exc)
            # Fallback: create a single hypothesis from the raw text
            hypotheses.append(Hypothesis(
                statement=f"Investigate: {topic}",
                rationale=response[:300],
                testability_score=0.5,
                feasibility_score=0.5,
                novelty_score=0.5,
                simulation_approach="General data analysis approach",
                rank=1,
            ))

        # Rank by combined score
        hypotheses.sort(
            key=lambda h: h.feasibility_score * 0.4 + h.novelty_score * 0.3 + h.testability_score * 0.3,
            reverse=True,
        )
        for i, h in enumerate(hypotheses):
            h.rank = i + 1

        return hypotheses


class ResearchDirector:
    """
    Core orchestrator for the Auto-Scientist pipeline.
    Takes a broad research prompt and runs the full scientific method loop.
    """

    def __init__(self, lab_dir: str = "/home/ubuntu/agi-research-lab"):
        self.lab_dir = lab_dir
        self.hypothesis_generator = HypothesisGenerator()
        self.review_board = AegisReviewBoard()
        self._active_sessions: dict[str, ResearchSession] = {}

    def get_session(self, session_id: str) -> Optional[ResearchSession]:
        return self._active_sessions.get(session_id)

    async def run_research(self, topic: str, session_id: Optional[str] = None) -> ResearchSession:
        """
        Execute the full 5-step research pipeline.
        This is designed to run as an async background task.
        """
        sid = session_id or f"research-{int(time.time())}"
        session = ResearchSession(session_id=sid, topic=topic)
        self._active_sessions[sid] = session

        try:
            # STEP 1: Literature Review
            session.phase = ResearchPhase.LITERATURE_REVIEW
            session.log(f"Starting literature review for: {topic}")
            session.literature_review = await conduct_literature_review(topic, max_results=10)
            session.log(f"Found {len(session.literature_review.papers)} papers")

            if not session.literature_review.gap_analysis:
                session.error = "Literature review produced no gap analysis"
                session.phase = ResearchPhase.FAILED
                return session

            # STEP 2: Hypothesis Generation
            session.phase = ResearchPhase.HYPOTHESIS_GENERATION
            session.log("Generating hypotheses via Tree-of-Thoughts")
            session.hypotheses = await self.hypothesis_generator.generate(
                session.literature_review.gap_analysis, topic
            )
            session.selected_hypothesis = session.hypotheses[0] if session.hypotheses else None
            session.log(f"Generated {len(session.hypotheses)} hypotheses, selected: {session.selected_hypothesis.statement[:80] if session.selected_hypothesis else 'None'}")

            if not session.selected_hypothesis:
                session.error = "No viable hypothesis generated"
                session.phase = ResearchPhase.FAILED
                return session

            # STEP 3: Simulation
            session.phase = ResearchPhase.SIMULATION
            session.log("Generating simulation code")
            session.simulation_code = await self._generate_simulation_code(session)
            session.log(f"Executing simulation ({len(session.simulation_code)} chars of code)")
            session.simulation_result = await execute_simulation(
                session.simulation_code,
                cwd=self.lab_dir,
                timeout=300,
                max_retries=5,
            )
            session.log(f"Simulation {'succeeded' if session.simulation_result.success else 'failed'}: exit_code={session.simulation_result.exit_code}")

            if not session.simulation_result.success:
                session.log(f"Simulation failed after retries: {session.simulation_result.stderr[:200]}")
                # Continue with whatever output we have

            # STEP 4: Analysis & Drafting
            session.phase = ResearchPhase.ANALYSIS
            session.log("Analyzing results and drafting whitepaper")
            session.analysis_text = await analyze_results(
                session.simulation_result,
                session.selected_hypothesis,
                topic,
            )
            session.whitepaper = await draft_whitepaper(
                topic=topic,
                literature_review=session.literature_review,
                hypothesis=session.selected_hypothesis,
                simulation_code=session.simulation_code,
                simulation_result=session.simulation_result,
                analysis=session.analysis_text,
            )
            session.log(f"Whitepaper draft complete: {len(session.whitepaper.content)} chars")

            # STEP 5: Peer Review
            session.phase = ResearchPhase.PEER_REVIEW
            session.log("Submitting to Aegis Peer Review Board")
            session.review_verdict = await self.review_board.review(session.whitepaper)
            session.log(f"Review verdict: {session.review_verdict.decision} (score: {session.review_verdict.overall_score})")

            if session.review_verdict.decision == "reject":
                # Revision loop
                session.phase = ResearchPhase.REVISION
                session.log("Paper rejected. Revising based on feedback...")
                session.final_paper = await self._revise_paper(session)
                session.log("Revision complete")
            else:
                session.final_paper = session.whitepaper.content

            session.phase = ResearchPhase.COMPLETE
            session.log("Research pipeline complete!")

        except Exception as exc:
            session.error = str(exc)
            session.phase = ResearchPhase.FAILED
            session.log(f"Pipeline failed: {exc}")
            logger.exception("Research pipeline failed for %s", topic)

        return session

    async def _generate_simulation_code(self, session: ResearchSession) -> str:
        """Generate Python simulation code to test the hypothesis."""
        hypothesis = session.selected_hypothesis
        if not hypothesis:
            return ""

        prompt = f"""You are a senior data scientist. Write a complete, self-contained Python script to test this hypothesis:

HYPOTHESIS: {hypothesis.statement}
APPROACH: {hypothesis.simulation_approach}
RATIONALE: {hypothesis.rationale}

Requirements:
- The script must be completely self-contained (no external data files needed)
- Use only standard library + numpy + pandas + scipy + matplotlib (if needed)
- Generate synthetic data if real data is not available
- Run statistical tests where appropriate
- Print clear results to stdout in a structured format
- Print "RESULT: SUPPORTED" or "RESULT: NOT SUPPORTED" as the final line
- Save any charts to files in the current directory
- The script must complete in under 5 minutes
- Handle errors gracefully

Return ONLY the Python code, no markdown fences, no explanations."""

        code = await _llm_call(prompt, temperature=0.3, max_tokens=4096)

        # Clean up markdown fences if present
        if code.startswith("```python"):
            code = code[len("```python"):].strip()
        if code.startswith("```"):
            code = code[3:].strip()
        if code.endswith("```"):
            code = code[:-3].strip()

        return code

    async def _revise_paper(self, session: ResearchSession) -> str:
        """Revise the whitepaper based on peer review feedback."""
        if not session.whitepaper or not session.review_verdict:
            return session.whitepaper.content if session.whitepaper else ""

        feedback = "\n".join([
            f"- {issue}" for issue in
            session.review_verdict.methodological_flaws +
            session.review_verdict.data_inconsistencies +
            session.review_verdict.hallucinated_citations +
            session.review_verdict.other_issues
        ])

        prompt = f"""You are a senior research scientist revising a paper based on peer review.

ORIGINAL PAPER:
{session.whitepaper.content[:6000]}

PEER REVIEW FEEDBACK:
{feedback}

REVIEWER SCORE: {session.review_verdict.overall_score}/10

Revise the paper to address ALL feedback points. Maintain the original structure but:
1. Fix any methodological flaws
2. Remove or correct any hallucinated citations
3. Resolve data inconsistencies
4. Strengthen weak arguments
5. Add appropriate caveats where needed

Return the complete revised paper in Markdown format."""

        return await _llm_call(prompt, temperature=0.3, max_tokens=4096)
