"""
AGI-1 Neural Lip-Sync Server (2D Bridge)
WebSocket server that accepts audio chunks and returns lip-synced video frames.

Architecture:
    Browser Audio → WebSocket → This Server → Wav2Lip/inference → JPEG frames → WebSocket → Browser Canvas

Current status: STAGED (Wav2Lip model not yet downloaded)
When live, run with:
    python3 -m src.neural_lip_sync --port 8765 --avatar jack

Requirements (when activating):
    pip install torch torchvision torchaudio
    pip install face-alignment
    pip install websockets
    # Download Wav2Lip checkpoint:
    # wget https://github.com/Rudrabha/Wav2Lip/releases/download/v1.0/wav2lip_gan.pth
"""

import argparse
import asyncio
import json
import logging
import os
import struct
import tempfile
import time
from pathlib import Path

logger = logging.getLogger("agi1.neural_lip_sync")

# Staged: these imports will activate when model is downloaded
WAV2LIP_AVAILABLE = False
try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

try:
    import websockets
    WS_AVAILABLE = True
except ImportError:
    WS_AVAILABLE = False


PROJECT_ROOT = Path(__file__).parent.parent

AVATAR_REFERENCE_VIDEOS = {
    "jack": PROJECT_ROOT / "frontend" / "public" / "avatars" / "jack-idle.mp4",
    "julia": PROJECT_ROOT / "frontend" / "public" / "avatars" / "julia-idle.mp4",
}

MODEL_PATHS = {
    "wav2lip_gan": PROJECT_ROOT / "models" / "wav2lip_gan.pth",
    "wav2lip": PROJECT_ROOT / "models" / "wav2lip.pth",
}


class NeuralLipSyncServer:
    """WebSocket server for real-time neural lip-sync."""

    def __init__(self, avatar: str = "jack", port: int = 8765):
        self.avatar = avatar
        self.port = port
        self.reference_video = str(AVATAR_REFERENCE_VIDEOS.get(avatar, ""))
        self.reference_frames: list = []
        self.model = None
        self.is_ready = False

    def load_reference_frames(self):
        """Extract reference frames from the avatar's idle video."""
        if not CV2_AVAILABLE:
            logger.warning("OpenCV not available, lip-sync will not process frames")
            return

        if not os.path.exists(self.reference_video):
            logger.warning("Reference video not found: %s", self.reference_video)
            return

        cap = cv2.VideoCapture(self.reference_video)
        frames = []
        while len(frames) < 30:  # Cache 30 reference frames (1 second at 30fps)
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            # Resize to 256x256 for Wav2Lip
            frame = cv2.resize(frame, (256, 256))
            frames.append(frame)
        cap.release()
        self.reference_frames = frames
        logger.info("Loaded %d reference frames for %s", len(frames), self.avatar)

    def load_model(self):
        """Load the Wav2Lip model checkpoint."""
        for name, path in MODEL_PATHS.items():
            if path.exists():
                logger.info("Loading model: %s", name)
                # Staged: actual model loading would happen here
                # self.model = Wav2Lip()
                # self.model.load_state_dict(torch.load(path))
                # self.model.eval()
                self.is_ready = True
                return

        logger.warning("No Wav2Lip model found. Server running in passthrough mode.")
        self.is_ready = False

    async def handle_client(self, websocket):
        """Handle a single WebSocket client connection."""
        logger.info("Client connected")
        frame_idx = 0

        try:
            async for message in websocket:
                if isinstance(message, bytes):
                    # Audio chunk received
                    start_time = time.monotonic()

                    if self.is_ready and self.model and self.reference_frames:
                        # Production path: run Wav2Lip inference
                        # mel = audio_to_mel(message)
                        # ref_frame = self.reference_frames[frame_idx % len(self.reference_frames)]
                        # output_frame = self.model.generate(ref_frame, mel)
                        # encoded = cv2.imencode('.jpg', output_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])[1]
                        # await websocket.send(encoded.tobytes())
                        pass
                    elif CV2_AVAILABLE and self.reference_frames:
                        # Passthrough mode: return reference frame as-is
                        ref_frame = self.reference_frames[frame_idx % len(self.reference_frames)]
                        encoded = cv2.imencode('.jpg', ref_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])[1]
                        await websocket.send(encoded.tobytes())
                    else:
                        # No frames available — send status message
                        await websocket.send(json.dumps({
                            "status": "staged",
                            "message": "Neural lip-sync model not loaded. Using video-swap fallback.",
                        }))

                    frame_idx += 1
                    latency = (time.monotonic() - start_time) * 1000
                    if frame_idx % 30 == 0:
                        logger.debug("Processed %d frames, last latency: %.1fms", frame_idx, latency)

                elif isinstance(message, str):
                    # JSON control message
                    try:
                        cmd = json.loads(message)
                        if cmd.get("type") == "ping":
                            await websocket.send(json.dumps({"type": "pong", "ready": self.is_ready}))
                        elif cmd.get("type") == "status":
                            await websocket.send(json.dumps({
                                "type": "status",
                                "avatar": self.avatar,
                                "ready": self.is_ready,
                                "reference_frames": len(self.reference_frames),
                                "model_loaded": self.model is not None,
                            }))
                    except json.JSONDecodeError:
                        pass

        except Exception as e:
            logger.error("Client error: %s", e)
        finally:
            logger.info("Client disconnected (processed %d frames)", frame_idx)

    async def start(self):
        """Start the WebSocket server."""
        if not WS_AVAILABLE:
            logger.error("websockets package not installed. pip install websockets")
            return

        self.load_reference_frames()
        self.load_model()

        logger.info(
            "Neural Lip-Sync Server starting on port %d (avatar=%s, ready=%s)",
            self.port, self.avatar, self.is_ready,
        )

        async with websockets.serve(self.handle_client, "0.0.0.0", self.port):
            await asyncio.Future()  # Run forever


def main():
    parser = argparse.ArgumentParser(description="AGI-1 Neural Lip-Sync Server")
    parser.add_argument("--avatar", choices=["jack", "julia"], default="jack")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    server = NeuralLipSyncServer(avatar=args.avatar, port=args.port)
    asyncio.run(server.start())


if __name__ == "__main__":
    main()
