"""
AGI-1 Auto-Scientist: Literature RAG Module
Fetches and analyzes recent research papers from arXiv and Semantic Scholar,
then uses LLM to produce structured gap analysis.
"""

import asyncio
import json
import logging
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Optional
from xml.etree import ElementTree

logger = logging.getLogger("agi1.research.literature_rag")

ARXIV_API = "http://export.arxiv.org/api/query"
SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1/paper/search"

GROQ_API_KEY: Optional[str] = None
GROQ_MODEL = "llama-3.3-70b-versatile"


def _configure_groq_key() -> str:
    """Lazy-load GROQ key from env."""
    import os
    global GROQ_API_KEY
    if GROQ_API_KEY is None:
        GROQ_API_KEY = os.environ.get("GROQ_API_KEY", os.environ.get("GROQ_LLAMA_KEY", ""))
    return GROQ_API_KEY


@dataclass
class PaperSummary:
    title: str
    authors: list[str]
    abstract: str
    url: str
    published: str
    source: str = "arxiv"


@dataclass
class LiteratureReview:
    topic: str
    papers: list[PaperSummary] = field(default_factory=list)
    gap_analysis: str = ""
    key_findings: list[str] = field(default_factory=list)
    research_gaps: list[str] = field(default_factory=list)
    suggested_directions: list[str] = field(default_factory=list)


async def search_arxiv(topic: str, max_results: int = 10) -> list[PaperSummary]:
    """Search arXiv for recent papers on a topic."""
    papers = []
    try:
        query = urllib.parse.quote(topic)
        url = f"{ARXIV_API}?search_query=all:{query}&start=0&max_results={max_results}&sortBy=submittedDate&sortOrder=descending"

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: urllib.request.urlopen(url, timeout=15).read()
        )

        root = ElementTree.fromstring(response)
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        for entry in root.findall("atom:entry", ns):
            title = entry.findtext("atom:title", "", ns).strip().replace("\n", " ")
            abstract = entry.findtext("atom:summary", "", ns).strip().replace("\n", " ")
            published = entry.findtext("atom:published", "", ns)[:10]
            link_el = entry.find("atom:id", ns)
            link = link_el.text.strip() if link_el is not None and link_el.text else ""
            authors = [
                a.findtext("atom:name", "", ns)
                for a in entry.findall("atom:author", ns)
            ]
            papers.append(PaperSummary(
                title=title,
                authors=authors[:5],
                abstract=abstract[:600],
                url=link,
                published=published,
                source="arxiv",
            ))
    except Exception as exc:
        logger.warning("arXiv search failed: %s", exc)
    return papers


async def search_semantic_scholar(topic: str, max_results: int = 10) -> list[PaperSummary]:
    """Search Semantic Scholar for recent papers."""
    papers = []
    try:
        query = urllib.parse.quote(topic)
        url = f"{SEMANTIC_SCHOLAR_API}?query={query}&limit={max_results}&fields=title,abstract,authors,url,publicationDate"

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: urllib.request.urlopen(url, timeout=15).read()
        )
        data = json.loads(response)

        for paper in data.get("data", []):
            if not paper.get("abstract"):
                continue
            papers.append(PaperSummary(
                title=paper.get("title", ""),
                authors=[a.get("name", "") for a in paper.get("authors", [])[:5]],
                abstract=paper.get("abstract", "")[:600],
                url=paper.get("url", ""),
                published=paper.get("publicationDate", "")[:10],
                source="semantic_scholar",
            ))
    except Exception as exc:
        logger.warning("Semantic Scholar search failed: %s", exc)
    return papers


async def _llm_analyze(prompt: str) -> str:
    """Send prompt to Groq LLM and return response."""
    key = _configure_groq_key()
    if not key:
        return "[LLM unavailable: GROQ_API_KEY not set]"

    import urllib.request
    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 2048,
        "temperature": 0.4,
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
        None, lambda: urllib.request.urlopen(req, timeout=30).read()
    )
    data = json.loads(response)
    return data.get("choices", [{}])[0].get("message", {}).get("content", "")


async def conduct_literature_review(topic: str, max_results: int = 10) -> LiteratureReview:
    """
    Full literature review pipeline:
    1. Fetch papers from arXiv + Semantic Scholar
    2. Use LLM to synthesize gap analysis
    """
    review = LiteratureReview(topic=topic)

    # Fetch papers from both sources in parallel
    arxiv_task = search_arxiv(topic, max_results=max_results)
    scholar_task = search_semantic_scholar(topic, max_results=max_results)
    arxiv_papers, scholar_papers = await asyncio.gather(arxiv_task, scholar_task)

    # Merge and deduplicate by title similarity
    seen_titles = set()
    for paper in arxiv_papers + scholar_papers:
        normalized = paper.title.lower().strip()
        if normalized not in seen_titles:
            seen_titles.add(normalized)
            review.papers.append(paper)

    if not review.papers:
        review.gap_analysis = f"No papers found for topic: {topic}"
        return review

    # Build context for LLM
    paper_context = "\n\n".join(
        f"[{i+1}] {p.title} ({p.published})\nAuthors: {', '.join(p.authors)}\nAbstract: {p.abstract}"
        for i, p in enumerate(review.papers[:15])
    )

    prompt = f"""You are a senior research scientist conducting a literature review.

Topic: {topic}

Here are the {len(review.papers)} most recent papers found:

{paper_context}

Analyze these papers and produce a structured gap analysis:

1. KEY FINDINGS: What are the 3-5 most important findings across these papers?
2. RESEARCH GAPS: What are 3-5 specific gaps, limitations, or unanswered questions in the current research?
3. SUGGESTED DIRECTIONS: What are 3 novel research directions that could address these gaps?
4. GAP ANALYSIS SUMMARY: A 2-3 paragraph synthesis of what is missing in current research and what would be most impactful to investigate next.

Format each section clearly with headers."""

    analysis = await _llm_analyze(prompt)
    review.gap_analysis = analysis

    # Parse structured sections
    for line in analysis.split("\n"):
        line = line.strip()
        if line.startswith("- ") or line.startswith("* "):
            content = line[2:].strip()
            if "FINDING" in analysis[:analysis.index(line)] if line in analysis else False:
                review.key_findings.append(content)
            elif "GAP" in analysis[:analysis.index(line)] if line in analysis else False:
                review.research_gaps.append(content)
            elif "DIRECTION" in analysis[:analysis.index(line)] if line in analysis else False:
                review.suggested_directions.append(content)

    logger.info(
        "Literature review complete: %d papers, %d gaps identified",
        len(review.papers), len(review.research_gaps)
    )
    return review
