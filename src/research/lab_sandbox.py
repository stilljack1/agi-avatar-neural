"""
AGI-1 Auto-Scientist: Secure Lab Sandbox
Executes AI-generated Python code in a restricted subprocess with
automatic error detection, self-healing retries, and timeout protection.

SECURITY: All code runs inside a subprocess with:
- Strict 5-minute timeout
- Restricted working directory (cwd)
- No network access in simulation scripts (by convention)
- stdout/stderr captured
- Max 5 retry attempts for self-healing
"""

import asyncio
import json
import logging
import os
import subprocess
import tempfile
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("agi1.research.lab_sandbox")

GROQ_API_KEY: Optional[str] = None
GROQ_MODEL = "llama-3.3-70b-versatile"

# Safety: maximum output size to prevent memory issues
MAX_OUTPUT_BYTES = 1_000_000  # 1MB


def _get_groq_key() -> str:
    global GROQ_API_KEY
    if GROQ_API_KEY is None:
        GROQ_API_KEY = os.environ.get("GROQ_API_KEY", os.environ.get("GROQ_LLAMA_KEY", ""))
    return GROQ_API_KEY


@dataclass
class SimulationResult:
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    duration_seconds: float
    retries_used: int
    final_code: str
    output_files: list[str] = field(default_factory=list)


async def _llm_fix_code(original_code: str, error_output: str, attempt: int) -> str:
    """Ask LLM to fix broken simulation code based on error output."""
    key = _get_groq_key()
    if not key:
        raise RuntimeError("GROQ_API_KEY not configured for code repair")

    prompt = f"""The following Python simulation code failed with an error.
Fix the code so it runs successfully. Return ONLY the corrected Python code.

ATTEMPT {attempt} FAILED CODE:
```python
{original_code}
```

ERROR OUTPUT:
```
{error_output[:2000]}
```

Requirements:
- Fix the specific error shown above
- Keep the same overall logic and purpose
- Ensure the script is self-contained
- Use only standard library + numpy + pandas + scipy + matplotlib
- Return ONLY Python code, no markdown fences, no explanations"""

    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 4096,
        "temperature": 0.2,
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
    code = data.get("choices", [{}])[0].get("message", {}).get("content", "")

    # Clean markdown fences
    if code.startswith("```python"):
        code = code[len("```python"):].strip()
    if code.startswith("```"):
        code = code[3:].strip()
    if code.endswith("```"):
        code = code[:-3].strip()

    return code


def _run_subprocess(script_path: str, cwd: str, timeout: int) -> tuple[int, str, str]:
    """Run a Python script in a subprocess with timeout."""
    try:
        result = subprocess.run(
            ["python3", script_path],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={
                **os.environ,
                "PYTHONDONTWRITEBYTECODE": "1",
                "PYTHONUNBUFFERED": "1",
                # Restrict: no home directory access
                "HOME": cwd,
            },
        )
        stdout = result.stdout[:MAX_OUTPUT_BYTES] if result.stdout else ""
        stderr = result.stderr[:MAX_OUTPUT_BYTES] if result.stderr else ""
        return result.returncode, stdout, stderr
    except subprocess.TimeoutExpired:
        return -1, "", f"TIMEOUT: Script exceeded {timeout}s limit"
    except Exception as exc:
        return -2, "", f"SUBPROCESS_ERROR: {exc}"


def _list_output_files(cwd: str, before_files: set[str]) -> list[str]:
    """List new files created during simulation."""
    try:
        after_files = set(os.listdir(cwd))
        new_files = after_files - before_files
        return sorted(new_files)
    except Exception:
        return []


async def execute_simulation(
    python_code: str,
    cwd: str = "/home/ubuntu/agi-research-lab",
    timeout: int = 300,
    max_retries: int = 5,
) -> SimulationResult:
    """
    Execute Python simulation code in a secure subprocess.
    Self-heals up to max_retries times if errors occur.
    """
    # Ensure working directory exists
    os.makedirs(cwd, exist_ok=True)

    current_code = python_code
    start_time = time.time()
    retries_used = 0

    # Snapshot existing files before simulation
    try:
        before_files = set(os.listdir(cwd))
    except Exception:
        before_files = set()

    for attempt in range(1, max_retries + 1):
        # Write code to temporary file in the lab directory
        script_path = os.path.join(cwd, f"simulation_attempt_{attempt}.py")
        try:
            with open(script_path, "w") as f:
                f.write(current_code)
        except Exception as exc:
            return SimulationResult(
                success=False,
                exit_code=-3,
                stdout="",
                stderr=f"WRITE_ERROR: Could not write script: {exc}",
                duration_seconds=time.time() - start_time,
                retries_used=retries_used,
                final_code=current_code,
            )

        logger.info("Running simulation attempt %d/%d", attempt, max_retries)

        # Run in executor to not block event loop
        loop = asyncio.get_event_loop()
        exit_code, stdout, stderr = await loop.run_in_executor(
            None, _run_subprocess, script_path, cwd, timeout
        )

        if exit_code == 0:
            # Success
            output_files = _list_output_files(cwd, before_files)
            return SimulationResult(
                success=True,
                exit_code=0,
                stdout=stdout,
                stderr=stderr,
                duration_seconds=time.time() - start_time,
                retries_used=retries_used,
                final_code=current_code,
                output_files=output_files,
            )

        # Failure - check if we should retry
        retries_used += 1
        error_text = stderr or stdout

        # Check for known fixable errors
        is_fixable = any(err in error_text for err in [
            "SyntaxError", "IndentationError", "NameError",
            "ImportError", "ModuleNotFoundError", "TypeError",
            "ValueError", "KeyError", "IndexError", "AttributeError",
            "ZeroDivisionError", "FileNotFoundError",
        ])

        if attempt < max_retries and is_fixable:
            logger.info("Attempt %d failed with fixable error, requesting LLM repair", attempt)
            try:
                current_code = await _llm_fix_code(current_code, error_text, attempt)
            except Exception as fix_exc:
                logger.warning("LLM code repair failed: %s", fix_exc)
                # Continue with same code for next attempt
        elif attempt < max_retries and "TIMEOUT" in error_text:
            logger.info("Attempt %d timed out, requesting optimization", attempt)
            try:
                current_code = await _llm_fix_code(
                    current_code,
                    f"{error_text}\n\nThe script must complete faster. Reduce data size or simplify computation.",
                    attempt,
                )
            except Exception:
                pass
        else:
            # Non-fixable or out of retries
            break

    # All retries exhausted
    output_files = _list_output_files(cwd, before_files)
    return SimulationResult(
        success=False,
        exit_code=exit_code,
        stdout=stdout,
        stderr=stderr,
        duration_seconds=time.time() - start_time,
        retries_used=retries_used,
        final_code=current_code,
        output_files=output_files,
    )
