"""
AGI-1 Self-Hosted Lip-Sync Server
==================================

Real-time lip-sync generation using SadTalker or Wav2Lip.
Deploy on any GPU server (RunPod, Lambda, AWS g4dn, etc.)

Usage:
  pip install fastapi uvicorn torch torchvision torchaudio
  pip install sadtalker  # or wav2lip

  # Start server:
  python -m src.lipsync.server

  # Or with uvicorn:
  uvicorn src.lipsync.server:app --host 0.0.0.0 --port 8765

  # Then set on your AGI-1 server:
  LIPSYNC_SERVER_URL=http://your-gpu-ip:8765

Endpoints:
  POST /generate  — Generate lip-synced video from audio + face image
  GET  /health    — Health check
  GET  /status    — Server capabilities
"""

import asyncio
import base64
import io
import os
import subprocess
import tempfile
import time
from pathlib import Path

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, JSONResponse
    from pydantic import BaseModel
except ImportError:
    print("Install dependencies: pip install fastapi uvicorn pydantic")
    raise

app = FastAPI(title="AGI-1 Lip-Sync Server", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache directory for generated videos
CACHE_DIR = Path(os.getenv("LIPSYNC_CACHE_DIR", "/tmp/agi1-lipsync-cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Face reference images directory
FACES_DIR = Path(os.getenv("LIPSYNC_FACES_DIR", "/tmp/agi1-faces"))
FACES_DIR.mkdir(parents=True, exist_ok=True)

# Which engine to use
ENGINE = os.getenv("LIPSYNC_ENGINE", "sadtalker")  # sadtalker | wav2lip | liveportrait


class GenerateRequest(BaseModel):
    audio_base64: str
    face_url: str | None = None
    face_base64: str | None = None
    actor: str = "jack"


class HealthResponse(BaseModel):
    status: str
    engine: str
    gpu_available: bool
    cache_size_mb: float


async def download_face(url: str, actor: str) -> Path:
    """Download and cache face reference image."""
    face_path = FACES_DIR / f"{actor}.png"
    if face_path.exists():
        return face_path

    import urllib.request
    urllib.request.urlretrieve(url, str(face_path))
    return face_path


def check_gpu() -> bool:
    """Check if CUDA GPU is available."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


# ====================================================================
# SadTalker Engine
# ====================================================================

async def generate_sadtalker(audio_path: str, face_path: str, output_path: str) -> bool:
    """Generate lip-synced video using SadTalker."""
    try:
        # Check if SadTalker is installed
        sadtalker_dir = os.getenv("SADTALKER_DIR", "/opt/SadTalker")

        cmd = [
            "python", f"{sadtalker_dir}/inference.py",
            "--driven_audio", audio_path,
            "--source_image", face_path,
            "--result_dir", str(Path(output_path).parent),
            "--still",
            "--preprocess", "crop",
            "--enhancer", "gfpgan",
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120)

        if process.returncode != 0:
            print(f"[SadTalker] Error: {stderr.decode()[:500]}")
            return False

        # Find the generated video
        result_dir = Path(output_path).parent
        videos = sorted(result_dir.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
        if videos:
            videos[0].rename(output_path)
            return True

        return False

    except FileNotFoundError:
        print("[SadTalker] Not installed. Install from: https://github.com/OpenTalker/SadTalker")
        return False
    except asyncio.TimeoutError:
        print("[SadTalker] Timed out after 120s")
        return False


# ====================================================================
# Wav2Lip Engine
# ====================================================================

async def generate_wav2lip(audio_path: str, face_path: str, output_path: str) -> bool:
    """Generate lip-synced video using Wav2Lip."""
    try:
        wav2lip_dir = os.getenv("WAV2LIP_DIR", "/opt/Wav2Lip")

        cmd = [
            "python", f"{wav2lip_dir}/inference.py",
            "--checkpoint_path", f"{wav2lip_dir}/checkpoints/wav2lip_gan.pth",
            "--face", face_path,
            "--audio", audio_path,
            "--outfile", output_path,
            "--pads", "0", "10", "0", "0",
            "--resize_factor", "1",
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60)

        return process.returncode == 0

    except FileNotFoundError:
        print("[Wav2Lip] Not installed. Install from: https://github.com/Rudrabha/Wav2Lip")
        return False
    except asyncio.TimeoutError:
        print("[Wav2Lip] Timed out after 60s")
        return False


# ====================================================================
# LivePortrait Engine
# ====================================================================

async def generate_liveportrait(audio_path: str, face_path: str, output_path: str) -> bool:
    """Generate lip-synced video using LivePortrait."""
    try:
        lp_dir = os.getenv("LIVEPORTRAIT_DIR", "/opt/LivePortrait")

        cmd = [
            "python", f"{lp_dir}/inference.py",
            "--source", face_path,
            "--audio", audio_path,
            "--output", output_path,
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=90)

        return process.returncode == 0

    except FileNotFoundError:
        print("[LivePortrait] Not installed. Install from: https://github.com/KwaiVGI/LivePortrait")
        return False
    except asyncio.TimeoutError:
        print("[LivePortrait] Timed out after 90s")
        return False


# Engine dispatch
ENGINES = {
    "sadtalker": generate_sadtalker,
    "wav2lip": generate_wav2lip,
    "liveportrait": generate_liveportrait,
}


# ====================================================================
# API Endpoints
# ====================================================================

@app.post("/generate")
async def generate(req: GenerateRequest):
    """Generate lip-synced video from audio + face image."""
    start = time.time()

    # Decode audio
    try:
        audio_bytes = base64.b64decode(req.audio_base64)
    except Exception as e:
        raise HTTPException(400, f"Invalid audio_base64: {e}")

    # Get face image
    if req.face_base64:
        face_bytes = base64.b64decode(req.face_base64)
        face_path = FACES_DIR / f"{req.actor}_custom.png"
        face_path.write_bytes(face_bytes)
    elif req.face_url:
        face_path = await download_face(req.face_url, req.actor)
    else:
        face_path = FACES_DIR / f"{req.actor}.png"
        if not face_path.exists():
            raise HTTPException(400, f"No face image for actor '{req.actor}'. Provide face_url or face_base64.")

    # Write audio to temp file
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir=str(CACHE_DIR)) as f:
        f.write(audio_bytes)
        audio_path = f.name

    # Output path
    output_path = str(CACHE_DIR / f"{req.actor}_{int(time.time() * 1000)}.mp4")

    # Generate
    engine_fn = ENGINES.get(ENGINE)
    if not engine_fn:
        raise HTTPException(500, f"Unknown engine: {ENGINE}. Choose: {list(ENGINES.keys())}")

    success = await engine_fn(audio_path, str(face_path), output_path)

    # Cleanup audio temp
    try:
        os.unlink(audio_path)
    except OSError:
        pass

    if not success or not Path(output_path).exists():
        raise HTTPException(500, f"Lip-sync generation failed with engine: {ENGINE}")

    duration = time.time() - start
    print(f"[LipSync] Generated {output_path} in {duration:.1f}s using {ENGINE}")

    return FileResponse(
        output_path,
        media_type="video/mp4",
        headers={
            "X-AGI1-Lipsync-Engine": ENGINE,
            "X-AGI1-Lipsync-Duration": f"{duration:.2f}",
        },
    )


@app.get("/health")
async def health():
    """Health check."""
    cache_size = sum(f.stat().st_size for f in CACHE_DIR.iterdir() if f.is_file()) / (1024 * 1024)
    return HealthResponse(
        status="ok",
        engine=ENGINE,
        gpu_available=check_gpu(),
        cache_size_mb=round(cache_size, 2),
    )


@app.get("/status")
async def status():
    """Detailed status."""
    gpu = check_gpu()
    engine_fn = ENGINES.get(ENGINE)

    return {
        "status": "ok",
        "engine": ENGINE,
        "engine_available": engine_fn is not None,
        "gpu_available": gpu,
        "gpu_name": None,
        "faces_cached": [f.name for f in FACES_DIR.iterdir() if f.is_file()],
        "cache_dir": str(CACHE_DIR),
        "supported_engines": list(ENGINES.keys()),
    }


# ====================================================================
# Cleanup old cache files (keep last 50)
# ====================================================================

@app.on_event("startup")
async def cleanup_cache():
    videos = sorted(CACHE_DIR.glob("*.mp4"), key=lambda p: p.stat().st_mtime)
    if len(videos) > 50:
        for old in videos[:-50]:
            try:
                old.unlink()
            except OSError:
                pass


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("LIPSYNC_PORT", "8765"))
    print(f"[AGI-1 LipSync Server] Starting on port {port} with engine: {ENGINE}")
    uvicorn.run(app, host="0.0.0.0", port=port)
