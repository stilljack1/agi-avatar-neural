'use client';

import { useCallback, useRef, useState } from 'react';
import { sendVisionFrame } from '../lib/call-api';
import { getStableBrowserUserId } from '../lib/browser-user-id';

/**
 * Vision Capture Hook
 * Handles camera/screen capture and frame extraction for visual AI analysis.
 * Frames are extracted to canvas and sent to the backend vision endpoint.
 */

export type VisionMode = 'camera' | 'screen' | 'off';

export type VisionState =
  | 'camera_off'
  | 'requesting_camera'
  | 'camera_ready'
  | 'camera_live'
  | 'analyzing'
  | 'paused'
  | 'error_camera'
  | 'error_visual_pipeline';

export type VisionCaptureState = {
  visionState: VisionState;
  visionMode: VisionMode;
  visionError: string;
  cameraStream: MediaStream | null;
  lastAnalysis: string;
  isAnalyzing: boolean;
  frameCount: number;
};

export type VisionCaptureActions = {
  startCamera: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopVision: () => void;
  pushFrame: (context?: { callSessionId?: string; userId?: string }, prompt?: string) => Promise<boolean>;
  captureAndAnalyze: (
    actor: 'jack' | 'julia',
    prompt?: string,
    context?: { callSessionId?: string; userId?: string }
  ) => Promise<string>;
  pauseVision: () => void;
  resumeVision: () => void;
};

export function useVisionCapture(): [VisionCaptureState, VisionCaptureActions] {
  const [visionState, setVisionState] = useState<VisionState>('camera_off');
  const [visionMode, setVisionMode] = useState<VisionMode>('off');
  const [visionError, setVisionError] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [frameCount, setFrameCount] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Create hidden canvas for frame extraction
  const getCanvas = () => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    return canvasRef.current;
  };

  const getVideo = () => {
    if (!videoRef.current) {
      videoRef.current = document.createElement('video');
      videoRef.current.autoplay = true;
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      videoRef.current.style.display = 'none';
      document.body.appendChild(videoRef.current);
    }
    return videoRef.current;
  };

  const waitForVideoReady = useCallback(async (video: HTMLVideoElement, timeoutMs = 2500) => {
    if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutId: number | null = null;

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('playing', onReady);
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      };

      const onReady = () => {
        if (settled) return;
        if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
          settled = true;
          cleanup();
          resolve();
        }
      };

      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('canplay', onReady);
      video.addEventListener('playing', onReady);

      timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('video_frame_not_ready'));
      }, timeoutMs);

      onReady();
    });
  }, []);

  const cleanupStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = useCallback(async () => {
    setVisionError('');
    setVisionState('requesting_camera');
    setLastAnalysis('');
    setFrameCount(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });

      streamRef.current = stream;
      setCameraStream(stream);

      const video = getVideo();
      video.srcObject = stream;
      void video.play().catch(() => {
        // The hidden preview is muted and may still settle a beat later.
        // Keep the visual session live instead of failing the whole camera path.
      });
      await waitForVideoReady(video);

      setVisionMode('camera');
      setVisionState('camera_live');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'camera_access_failed';
      setVisionError(msg);
      setVisionState('error_camera');
    }
  }, [waitForVideoReady]);

  const startScreenShare = useCallback(async () => {
    setVisionError('');
    setVisionState('requesting_camera');
    setLastAnalysis('');
    setFrameCount(0);

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      streamRef.current = stream;
      setCameraStream(stream);

      const video = getVideo();
      video.srcObject = stream;
      void video.play().catch(() => {
        // Screen-share preview can lag without meaning capture failed.
      });
      await waitForVideoReady(video);

      // Handle user stopping screen share via browser UI
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        cleanupStream();
        setVisionMode('off');
        setVisionState('camera_off');
        setVisionError('');
        setIsAnalyzing(false);
      });

      setVisionMode('screen');
      setVisionState('camera_live');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'screen_share_failed';
      setVisionError(msg);
      setVisionState('error_camera');
    }
  }, [waitForVideoReady]);

  const stopVision = useCallback(() => {
    cleanupStream();
    setVisionMode('off');
    setVisionState('camera_off');
    setVisionError('');
    setIsAnalyzing(false);
  }, []);

  const pauseVision = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((t) => { t.enabled = false; });
      setVisionState('paused');
    }
  }, []);

  const resumeVision = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((t) => { t.enabled = true; });
      setVisionState('camera_live');
    }
  }, []);

  const extractFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const canvas = getCanvas();
    // Resize for API efficiency (max 1024px wide)
    const scale = Math.min(1, 1024 / video.videoWidth);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFrameCount((c) => c + 1);

    // Return as base64 JPEG (quality 0.8 for good balance)
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  const captureFramePayload = useCallback((): {
    frameData: string;
    payload: string;
    mimeType: string;
  } | null => {
    const frameData = extractFrame();
    if (!frameData) return null;

    const [header, payload] = frameData.split(',');
    if (!payload) return null;

    const mimeMatch = /^data:([^;]+);base64$/.exec(header);
    return {
      frameData,
      payload,
      mimeType: mimeMatch?.[1] || 'image/jpeg',
    };
  }, [extractFrame]);

  const pushFrame = useCallback(async (
    context?: { callSessionId?: string; userId?: string },
    prompt?: string
  ): Promise<boolean> => {
    if (visionState !== 'camera_live' && visionState !== 'analyzing') {
      return false;
    }

    try {
      await waitForVideoReady(getVideo());
      const captured = captureFramePayload();
      if (!captured) {
        return false;
      }
      await sendVisionFrame({
        call_session_id: context?.callSessionId,
        user_id: context?.userId || getStableBrowserUserId(),
        source: visionMode === 'screen' ? 'screen' : 'camera',
        frame_base64: captured.payload,
        mime_type: captured.mimeType,
        prompt: prompt || 'Keep the live visual session current.',
      });
      setVisionError('');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'frame_push_failed';
      setVisionError(msg);
      return false;
    }
  }, [captureFramePayload, visionMode, visionState, waitForVideoReady]);

  const captureAndAnalyze = useCallback(async (
    actor: 'jack' | 'julia',
    prompt?: string,
    context?: { callSessionId?: string; userId?: string }
  ): Promise<string> => {
    if (visionState !== 'camera_live') {
      return 'Vision is not active. Please enable the camera first.';
    }

    setIsAnalyzing(true);
    setVisionState('analyzing');

    try {
      await waitForVideoReady(getVideo());
      const captured = captureFramePayload();
      if (!captured) {
        setVisionState('camera_live');
        setIsAnalyzing(false);
        return 'Could not capture frame from camera.';
      }

      try {
        await sendVisionFrame({
          call_session_id: context?.callSessionId,
          user_id: context?.userId || getStableBrowserUserId(),
          source: visionMode === 'screen' ? 'screen' : 'camera',
          frame_base64: captured.payload,
          mime_type: captured.mimeType,
          prompt: prompt || 'Describe what you see in detail.',
        });
      } catch {
        // The semantic path below can still run even if the truth-update ingest fails.
      }

      // Send frame to semantic vision analysis endpoint
      const response = await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: captured.frameData,
          actor,
          prompt: prompt || 'Describe what you see in detail.',
        }),
      });

      if (!response.ok) {
        throw new Error(`vision_api_error:${response.status}`);
      }

      const result = await response.json();
      const analysis = result.analysis || 'No analysis returned.';
      setLastAnalysis(analysis);
      setVisionState('camera_live');
      setIsAnalyzing(false);
      return analysis;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'analysis_failed';
      setVisionError(msg);
      setVisionState('error_visual_pipeline');
      setIsAnalyzing(false);
      return `Vision analysis failed: ${msg}`;
    }
  }, [captureFramePayload, visionMode, visionState, waitForVideoReady]);

  return [
    {
      visionState,
      visionMode,
      visionError,
      cameraStream,
      lastAnalysis,
      isAnalyzing,
      frameCount,
    },
    {
      startCamera,
      startScreenShare,
      stopVision,
      pushFrame,
      captureAndAnalyze,
      pauseVision,
      resumeVision,
    },
  ];
}
