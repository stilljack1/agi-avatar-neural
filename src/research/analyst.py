"""
AGI-1 Auto-Scientist: Data Analyst & Scribe
Analyzes simulation results and drafts formal academic whitepapers.
"""

import asyncio
import json
import logging
import os
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("agi1.research.analyst")

GROQ_MODEL = "llama-3.3-70b-versatile"


def _get_groq_key() -> str:
    return os.environ.get("GROQ_API_KEY", os.environ.get("GROQ_LLAMA_KEY", ""))


async def _llm_call(prompt: str, temperature: float = 0.3, max_tokens: int = 4096) -> str:
    key = _get_groq_key()
    if not key:
        return "[LLM unavailable: GROQ_API_KEY not set]"

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
class WhitepaperDraft:
    title: str
    content: str
    abstract: str = ""
    sections: list[str] = field(default_factory=list)
    word_count: int = 0
    citations_count: int = 0


async def analyze_results(
    simulation_result,  # SimulationResult from lab_sandbox
    hypothesis,  # Hypothesis from director
    topic: str,
) -> str:
    """Analyze simulation output and produce structured findings."""

    stdout = simulation_result.stdout if simulation_result else "No simulation output"
    success = simulation_result.success if simulation_result else False

    prompt = f"""You are a senior data analyst reviewing simulation results.

RESEARCH TOPIC: {topic}
HYPOTHESIS: {hypothesis.statement if hypothesis else 'N/A'}
SIMULATION STATUS: {'Completed successfully' if success else 'Failed or partial'}

SIMULATION OUTPUT:
```
{stdout[:4000]}
```

{'SIMULATION ERRORS: ' + simulation_result.stderr[:1000] if simulation_result and simulation_result.stderr else ''}

Produce a structured analysis:

1. DATA SUMMARY: What did the simulation produce? Summarize the key numbers and outputs.
2. STATISTICAL FINDINGS: What statistical tests were run? What were the p-values, effect sizes, confidence intervals?
3. HYPOTHESIS VERDICT: Based on the data, is the hypothesis SUPPORTED, PARTIALLY SUPPORTED, or NOT SUPPORTED? Why?
4. LIMITATIONS: What are the limitations of this simulation approach?
5. IMPLICATIONS: What do these findings mean for the broader research question?

Be precise. Use actual numbers from the output. Do not fabricate statistics."""

    return await _llm_call(prompt)


async def draft_whitepaper(
    topic: str,
    literature_review,  # LiteratureReview
    hypothesis,  # Hypothesis
    simulation_code: str,
    simulation_result,  # SimulationResult
    analysis: str,
) -> WhitepaperDraft:
    """Draft a formal academic whitepaper from all research components."""

    # Build paper citations from literature review
    citations = ""
    if literature_review and literature_review.papers:
        citations = "\n".join(
            f"[{i+1}] {p.title}. {', '.join(p.authors[:3])}. {p.published}. {p.url}"
            for i, p in enumerate(literature_review.papers[:10])
        )

    gap_analysis = literature_review.gap_analysis if literature_review else "N/A"
    sim_stdout = simulation_result.stdout[:3000] if simulation_result else "No output"
    sim_success = simulation_result.success if simulation_result else False

    prompt = f"""You are a senior research scientist writing a formal academic whitepaper.

Write a complete research paper in Markdown format with these sections:

# Title (create a specific, descriptive title)

## Abstract
(150-250 word summary of the research)

## 1. Introduction
- Background on: {topic}
- Research motivation from the literature gap analysis

## 2. Literature Review
Key findings from the literature:
{gap_analysis[:2000]}

## 3. Methodology
### 3.1 Hypothesis
{hypothesis.statement if hypothesis else 'N/A'}
Rationale: {hypothesis.rationale if hypothesis else 'N/A'}

### 3.2 Experimental Design
Describe the simulation approach used.
The simulation code was {len(simulation_code)} characters of Python.

## 4. Results
Simulation status: {'Completed successfully' if sim_success else 'Partial/Failed'}
Key outputs:
```
{sim_stdout[:2000]}
```

Analysis:
{analysis[:2000]}

## 5. Discussion
Interpret the results. Address limitations honestly.

## 6. Conclusion
Summarize findings and suggest future work.

## References
{citations}

IMPORTANT RULES:
- Only cite papers that appear in the References section above
- Do NOT invent citations that don't exist in the provided list
- Be honest about limitations and failed experiments
- Use actual numbers from the simulation output
- Keep total length to ~2000-3000 words"""

    content = await _llm_call(prompt, temperature=0.3, max_tokens=4096)

    # Extract title and abstract
    title = topic
    abstract = ""
    lines = content.split("\n")
    for line in lines:
        if line.startswith("# ") and not line.startswith("## "):
            title = line[2:].strip()
            break

    # Find abstract section
    in_abstract = False
    abstract_lines = []
    for line in lines:
        if "## Abstract" in line or "## abstract" in line:
            in_abstract = True
            continue
        if in_abstract:
            if line.startswith("## "):
                break
            abstract_lines.append(line)
    abstract = " ".join(abstract_lines).strip()

    # Count citations used
    citation_count = content.count("[") // 2  # rough estimate

    return WhitepaperDraft(
        title=title,
        content=content,
        abstract=abstract,
        sections=["Abstract", "Introduction", "Literature Review", "Methodology", "Results", "Discussion", "Conclusion", "References"],
        word_count=len(content.split()),
        citations_count=citation_count,
    )
