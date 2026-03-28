"""
AGI-1 Swarm Router: Auto-Scientist Integration
Routes research requests from Jack/Julia to the Auto-Scientist pipeline
as background tasks. Research runs asynchronously while the user continues
interacting with the avatar.
"""

import asyncio
import logging
import re
import time
from typing import Optional

from ..research.director import ResearchDirector, ResearchSession, ResearchPhase

logger = logging.getLogger("agi1.swarm.router")

# Singleton research director
_director: Optional[ResearchDirector] = None
_background_tasks: dict[str, asyncio.Task] = {}


def get_director(lab_dir: str = "/home/ubuntu/agi-research-lab") -> ResearchDirector:
    """Get or create the global ResearchDirector instance."""
    global _director
    if _director is None:
        _director = ResearchDirector(lab_dir=lab_dir)
    return _director


# Patterns that indicate a research request
RESEARCH_PATTERNS = [
    r"(?i)research\s+(?:about|on|into|how|why|whether|if|the)\s+",
    r"(?i)(?:figure out|investigate|analyze|study|explore)\s+",
    r"(?i)write\s+(?:a\s+)?(?:paper|whitepaper|report|analysis)\s+(?:on|about)\s+",
    r"(?i)(?:run|conduct|do)\s+(?:a\s+)?(?:research|study|experiment|simulation)\s+",
    r"(?i)(?:find|discover|determine)\s+(?:a\s+)?(?:new|novel|better)\s+(?:way|method|approach|strategy)\s+",
    r"(?i)backtest\s+",
    r"(?i)(?:hypothesis|hypothesize|theorize)\s+",
]


def is_research_request(message: str) -> bool:
    """Detect if a user message is asking for research."""
    return any(re.search(pattern, message) for pattern in RESEARCH_PATTERNS)


def extract_research_topic(message: str) -> str:
    """Extract the core research topic from a user message."""
    # Remove common prefixes
    topic = message.strip()
    for prefix in [
        "research ", "investigate ", "figure out ", "analyze ",
        "study ", "explore ", "write a paper on ", "write a whitepaper on ",
        "run a study on ", "conduct research on ", "do research on ",
        "can you research ", "please research ", "i want you to research ",
        "hey jack ", "hey julia ", "jack ", "julia ",
    ]:
        if topic.lower().startswith(prefix):
            topic = topic[len(prefix):]

    return topic.strip() or message.strip()


async def _run_research_background(session_id: str, topic: str):
    """Background task wrapper for research pipeline."""
    director = get_director()
    try:
        session = await director.run_research(topic, session_id=session_id)
        logger.info(
            "Research complete: %s phase=%s",
            session_id, session.phase.value,
        )
    except Exception as exc:
        logger.exception("Background research failed: %s", exc)


def start_research_task(topic: str, user_id: str = "default") -> str:
    """
    Launch a research task as an asyncio background task.
    Returns the session ID for status tracking.
    """
    session_id = f"research-{user_id}-{int(time.time())}"

    task = asyncio.create_task(
        _run_research_background(session_id, topic),
        name=f"auto-scientist:{session_id}",
    )
    _background_tasks[session_id] = task

    # Cleanup completed tasks
    completed = [sid for sid, t in _background_tasks.items() if t.done()]
    for sid in completed:
        del _background_tasks[sid]

    logger.info("Started research task %s for topic: %s", session_id, topic[:80])
    return session_id


def get_research_status(session_id: str) -> Optional[dict]:
    """Get the current status of a research session."""
    director = get_director()
    session = director.get_session(session_id)
    if not session:
        return None

    return {
        "session_id": session.session_id,
        "topic": session.topic,
        "phase": session.phase.value,
        "started_at": session.started_at,
        "error": session.error or None,
        "hypotheses_count": len(session.hypotheses),
        "selected_hypothesis": session.selected_hypothesis.statement[:200] if session.selected_hypothesis else None,
        "simulation_success": session.simulation_result.success if session.simulation_result else None,
        "review_score": session.review_verdict.overall_score if session.review_verdict else None,
        "review_decision": session.review_verdict.decision if session.review_verdict else None,
        "paper_ready": session.phase == ResearchPhase.COMPLETE,
        "paper_word_count": len(session.final_paper.split()) if session.final_paper else 0,
        "logs": session.logs[-10:],  # Last 10 log entries
    }


def get_research_paper(session_id: str) -> Optional[str]:
    """Get the final paper for a completed research session."""
    director = get_director()
    session = director.get_session(session_id)
    if not session or session.phase != ResearchPhase.COMPLETE:
        return None
    return session.final_paper


def format_research_acknowledgment(topic: str, session_id: str, actor: str = "jack") -> str:
    """Generate the avatar's response when research is initiated."""
    if actor == "julia":
        return (
            f"I've started the Auto-Scientist pipeline for \"{topic}\". "
            f"I'm pulling the latest research, forming hypotheses, and will run simulations. "
            f"This might take a few minutes. I'll let you know when the whitepaper is ready. "
            f"Session: {session_id}"
        )
    return (
        f"Got it. I've kicked off the research pipeline for \"{topic}\". "
        f"Right now I'm pulling papers from arXiv, generating hypotheses, "
        f"and I'll run simulations to test them. When the whitepaper is done, "
        f"it goes through peer review before I share it with you. "
        f"Session: {session_id}"
    )


async def route_message(
    message: str,
    actor: str = "jack",
    user_id: str = "default",
) -> Optional[str]:
    """
    Check if a message should trigger research.
    Returns an acknowledgment string if research was started, None otherwise.
    """
    if not is_research_request(message):
        return None

    topic = extract_research_topic(message)
    if len(topic) < 10:
        return None  # Topic too short, probably not a real research request

    session_id = start_research_task(topic, user_id=user_id)
    return format_research_acknowledgment(topic, session_id, actor)
