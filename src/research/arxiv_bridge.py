"""
AGI-1 Auto-Scientist: arXiv Bridge
Compatibility alias — routes through the unified literature_rag module.

The user-facing API is identical:
    from src.research.arxiv_bridge import search_arxiv, conduct_literature_review
"""

from .literature_rag import (
    search_arxiv,
    search_semantic_scholar,
    conduct_literature_review,
    LiteratureReview,
    PaperSummary,
)

__all__ = [
    "search_arxiv",
    "search_semantic_scholar",
    "conduct_literature_review",
    "LiteratureReview",
    "PaperSummary",
]
