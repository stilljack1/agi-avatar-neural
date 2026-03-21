'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Real-Time Browser Lip-Sync Engine
 * ==================================
 *
 * Animates a portrait image in real-time driven by TTS audio.
 * No external API keys required — runs 100% in the browser.
 *
 * Pipeline:
 * 1. Audio AnalyserNode → frequency + amplitude data at 60fps
 * 2. Frequency bands → viseme parameters (jaw, lips, tongue position)
 * 3. Viseme params → facial landmark displacements
 * 4. Canvas mesh warp renders animated portrait
 * 5. Subtle idle animations: breathing, micro-saccades, blinks
 *
 * The result is a living, breathing digital human that lip-syncs
 * to real Groq Orpheus TTS audio in real-time.
 */

// ================================================================
// Types
// ================================================================

export type VisemeState = {
  jawOpen: number;       // 0-1: how open the jaw is
  mouthWidth: number;    // -1 to 1: narrow to wide
  lipPucker: number;     // 0-1: lip rounding (for 'oo', 'w')
  upperLipRaise: number; // 0-1: upper lip movement
  lowerLipDrop: number;  // 0-1: lower lip drop
  tongueOut: number;     // 0-1: tongue visibility (for 'th', 'l')
};

export type FaceAnimState = {
  headRotX: number;    // pitch (nod)
  headRotY: number;    // yaw (turn)
  headRotZ: number;    // roll (tilt)
  eyeBlinkL: number;   // 0-1
  eyeBlinkR: number;   // 0-1
  eyeBrowRaise: number; // -1 to 1
  breathScale: number;  // subtle breathing
};

export type LipSyncEngineState = {
  isActive: boolean;
  isRendering: boolean;
  fps: number;
  viseme: VisemeState;
  faceAnim: FaceAnimState;
};

export type LipSyncEngineActions = {
  startLipSync: (audioElement: HTMLAudioElement) => void;
  stopLipSync: () => void;
  getCanvas: () => HTMLCanvasElement | null;
  setPortraitSrc: (src: string) => void;
};

// ================================================================
// Viseme extraction from audio frequency data
// ================================================================

function extractViseme(
  freqData: Uint8Array,
  timeData: Uint8Array,
  sampleRate: number,
  prevViseme: VisemeState,
): VisemeState {
  const binCount = freqData.length;
  const nyquist = sampleRate / 2;
  const binWidth = nyquist / binCount;

  // Frequency band energies
  let lowEnergy = 0;   // 80-300 Hz (vowel fundamentals, jaw)
  let midEnergy = 0;   // 300-2000 Hz (formants, mouth shape)
  let highEnergy = 0;  // 2000-6000 Hz (sibilants, fricatives)
  let vhighEnergy = 0; // 6000+ Hz (high freq noise)
  let lowCount = 0, midCount = 0, highCount = 0, vhighCount = 0;

  for (let i = 0; i < binCount; i++) {
    const freq = i * binWidth;
    const amplitude = freqData[i] / 255;
    if (freq >= 80 && freq < 300) { lowEnergy += amplitude; lowCount++; }
    else if (freq >= 300 && freq < 2000) { midEnergy += amplitude; midCount++; }
    else if (freq >= 2000 && freq < 6000) { highEnergy += amplitude; highCount++; }
    else if (freq >= 6000) { vhighEnergy += amplitude; vhighCount++; }
  }

  lowEnergy = lowCount > 0 ? lowEnergy / lowCount : 0;
  midEnergy = midCount > 0 ? midEnergy / midCount : 0;
  highEnergy = highCount > 0 ? highEnergy / highCount : 0;
  vhighEnergy = vhighCount > 0 ? vhighEnergy / vhighCount : 0;

  // RMS from time domain
  let rms = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    rms += v * v;
  }
  rms = Math.sqrt(rms / timeData.length);

  // Map to viseme parameters
  const jawOpen = Math.min(1, rms * 5 * (0.6 + lowEnergy * 0.8));
  const mouthWidth = Math.min(1, Math.max(-0.5, (midEnergy - 0.15) * 2.5 - highEnergy * 0.8));
  const lipPucker = Math.min(1, Math.max(0, lowEnergy * 1.5 - midEnergy * 0.8));
  const upperLipRaise = Math.min(1, midEnergy * 1.2 + highEnergy * 0.5);
  const lowerLipDrop = Math.min(1, jawOpen * 0.8 + lowEnergy * 0.3);
  const tongueOut = Math.min(0.4, highEnergy * 0.6 * (1 - vhighEnergy));

  // Smooth towards target (exponential moving average)
  const smoothing = 0.35; // lower = smoother
  return {
    jawOpen: lerp(prevViseme.jawOpen, jawOpen, smoothing),
    mouthWidth: lerp(prevViseme.mouthWidth, mouthWidth, smoothing),
    lipPucker: lerp(prevViseme.lipPucker, lipPucker, smoothing),
    upperLipRaise: lerp(prevViseme.upperLipRaise, upperLipRaise, smoothing),
    lowerLipDrop: lerp(prevViseme.lowerLipDrop, lowerLipDrop, smoothing),
    tongueOut: lerp(prevViseme.tongueOut, tongueOut, smoothing),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ================================================================
// Face idle animation (blinks, breathing, micro-movements)
// ================================================================

function computeIdleAnim(time: number, isSpeaking: boolean): FaceAnimState {
  const t = time / 1000;

  // Breathing: subtle scale oscillation
  const breathScale = 1 + Math.sin(t * 0.8) * 0.003;

  // Micro head movements (more when speaking)
  const speakMult = isSpeaking ? 1.5 : 0.5;
  const headRotX = Math.sin(t * 0.3) * 0.5 * speakMult + Math.sin(t * 0.7) * 0.3 * speakMult;
  const headRotY = Math.sin(t * 0.2 + 1.3) * 0.8 * speakMult + Math.cos(t * 0.5) * 0.4 * speakMult;
  const headRotZ = Math.sin(t * 0.15 + 2.1) * 0.3;

  // Eye blinks: ~every 3-6 seconds, 150ms duration
  const blinkCycle = 4.5;
  const blinkPhase = (t % blinkCycle) / blinkCycle;
  const blinkDuration = 0.035; // fraction of cycle
  let eyeBlink = 0;
  if (blinkPhase < blinkDuration) {
    const p = blinkPhase / blinkDuration;
    eyeBlink = p < 0.5 ? p * 2 : (1 - p) * 2;
  }
  // Secondary blink (slightly offset for natural asymmetry)
  const blink2Phase = ((t + 0.03) % (blinkCycle * 1.1)) / (blinkCycle * 1.1);
  let eyeBlinkR = eyeBlink;
  if (blink2Phase < blinkDuration * 0.8) {
    const p2 = blink2Phase / (blinkDuration * 0.8);
    eyeBlinkR = Math.max(eyeBlinkR, p2 < 0.5 ? p2 * 2 : (1 - p2) * 2);
  }

  // Eyebrow: subtle raise when speaking emphatically
  const eyeBrowRaise = isSpeaking ? Math.sin(t * 1.5) * 0.15 + 0.05 : Math.sin(t * 0.4) * 0.03;

  return {
    headRotX,
    headRotY,
    headRotZ,
    eyeBlinkL: eyeBlink,
    eyeBlinkR,
    eyeBrowRaise,
    breathScale,
  };
}

// ================================================================
// Canvas Mesh Warp Renderer
// ================================================================

type Point = [number, number];

// Define facial landmark regions relative to image (0-1 normalized)
// These are approximate positions for a front-facing portrait
const FACE_LANDMARKS = {
  // Mouth region (the critical lip-sync area)
  mouthLeft:     [0.38, 0.68] as Point,
  mouthRight:    [0.62, 0.68] as Point,
  mouthTop:      [0.50, 0.65] as Point,
  mouthBottom:   [0.50, 0.73] as Point,
  upperLipLeft:  [0.42, 0.66] as Point,
  upperLipRight: [0.58, 0.66] as Point,
  lowerLipLeft:  [0.42, 0.71] as Point,
  lowerLipRight: [0.58, 0.71] as Point,

  // Jaw
  jawLeft:       [0.30, 0.75] as Point,
  jawRight:      [0.70, 0.75] as Point,
  chin:          [0.50, 0.80] as Point,

  // Eyes
  eyeLeftOuter:  [0.32, 0.45] as Point,
  eyeLeftInner:  [0.42, 0.45] as Point,
  eyeLeftTop:    [0.37, 0.43] as Point,
  eyeLeftBottom: [0.37, 0.47] as Point,
  eyeRightOuter: [0.68, 0.45] as Point,
  eyeRightInner: [0.58, 0.45] as Point,
  eyeRightTop:   [0.63, 0.43] as Point,
  eyeRightBottom:[0.63, 0.47] as Point,

  // Eyebrows
  browLeftInner: [0.40, 0.38] as Point,
  browLeftOuter: [0.28, 0.39] as Point,
  browRightInner:[0.60, 0.38] as Point,
  browRightOuter:[0.72, 0.39] as Point,

  // Nose
  noseTip:       [0.50, 0.58] as Point,
  noseLeft:      [0.44, 0.60] as Point,
  noseRight:     [0.56, 0.60] as Point,
};

// Create a triangulated mesh grid over the face
function createFaceMesh(w: number, h: number, gridSize: number = 12): {
  vertices: Point[];
  triangles: [number, number, number][];
  uvs: Point[];
} {
  const vertices: Point[] = [];
  const uvs: Point[] = [];
  const cols = gridSize;
  const rows = gridSize;

  // Create uniform grid
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const v = r / rows;
      vertices.push([u * w, v * h]);
      uvs.push([u, v]);
    }
  }

  // Triangulate grid
  const triangles: [number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tl = r * (cols + 1) + c;
      const tr = tl + 1;
      const bl = (r + 1) * (cols + 1) + c;
      const br = bl + 1;
      triangles.push([tl, tr, bl]);
      triangles.push([tr, br, bl]);
    }
  }

  return { vertices, triangles, uvs };
}

// Apply viseme + face animation displacements to mesh vertices
function deformMesh(
  baseVertices: Point[],
  uvs: Point[],
  w: number,
  h: number,
  viseme: VisemeState,
  faceAnim: FaceAnimState,
): Point[] {
  const deformed: Point[] = [];

  for (let i = 0; i < baseVertices.length; i++) {
    const [bx, by] = baseVertices[i];
    const [u, v] = uvs[i];
    let dx = 0;
    let dy = 0;

    // ── Mouth/Jaw deformation ──
    // Distance from mouth center
    const mouthCenterU = 0.5;
    const mouthCenterV = 0.69;
    const distToMouth = Math.sqrt((u - mouthCenterU) ** 2 + (v - mouthCenterV) ** 2);
    const mouthInfluence = Math.max(0, 1 - distToMouth / 0.2); // falloff radius

    if (mouthInfluence > 0) {
      // Jaw open: pull lower mouth vertices down
      if (v > mouthCenterV) {
        dy += viseme.jawOpen * 12 * mouthInfluence * (v - mouthCenterV) / 0.11;
      }
      // Upper lip raise
      if (v < mouthCenterV && v > mouthCenterV - 0.06) {
        dy -= viseme.upperLipRaise * 3 * mouthInfluence;
      }
      // Mouth width: push corners outward/inward
      const horizontalDir = u < mouthCenterU ? -1 : 1;
      dx += viseme.mouthWidth * 5 * mouthInfluence * horizontalDir * Math.abs(u - mouthCenterU) / 0.12;
      // Lip pucker: pull corners inward
      dx -= viseme.lipPucker * 4 * mouthInfluence * horizontalDir * Math.abs(u - mouthCenterU) / 0.12;
    }

    // ── Jaw region ──
    const jawCenterV = 0.77;
    const distToJaw = Math.abs(v - jawCenterV);
    if (v > 0.65 && distToJaw < 0.1) {
      const jawInfluence = 1 - distToJaw / 0.1;
      dy += viseme.jawOpen * 8 * jawInfluence;
    }

    // ── Eye blinks ──
    const leftEyeU = 0.37, leftEyeV = 0.45;
    const rightEyeU = 0.63, rightEyeV = 0.45;
    const eyeRadius = 0.06;

    // Left eye
    const distToLeftEye = Math.sqrt((u - leftEyeU) ** 2 + (v - leftEyeV) ** 2);
    if (distToLeftEye < eyeRadius) {
      const eyeInf = 1 - distToLeftEye / eyeRadius;
      if (v < leftEyeV) {
        dy += faceAnim.eyeBlinkL * 4 * eyeInf; // upper lid down
      } else {
        dy -= faceAnim.eyeBlinkL * 3 * eyeInf; // lower lid up
      }
    }

    // Right eye
    const distToRightEye = Math.sqrt((u - rightEyeU) ** 2 + (v - rightEyeV) ** 2);
    if (distToRightEye < eyeRadius) {
      const eyeInf = 1 - distToRightEye / eyeRadius;
      if (v < rightEyeV) {
        dy += faceAnim.eyeBlinkR * 4 * eyeInf;
      } else {
        dy -= faceAnim.eyeBlinkR * 3 * eyeInf;
      }
    }

    // ── Eyebrows ──
    const browV = 0.38;
    if (v > 0.33 && v < 0.42 && u > 0.25 && u < 0.75) {
      const browDist = Math.abs(v - browV);
      const browInf = Math.max(0, 1 - browDist / 0.04);
      dy -= faceAnim.eyeBrowRaise * 3 * browInf;
    }

    // ── Head rotation (applied globally with center pivot) ──
    const pivotU = 0.5, pivotV = 0.5;
    const relU = u - pivotU;
    const relV = v - pivotV;

    // Yaw: horizontal perspective shift
    dx += faceAnim.headRotY * relU * 8;
    // Pitch: vertical perspective shift
    dy += faceAnim.headRotX * relV * 6;
    // Roll: rotation
    const rollRad = faceAnim.headRotZ * Math.PI / 180;
    const rotDx = relU * Math.cos(rollRad) - relV * Math.sin(rollRad) - relU;
    const rotDy = relU * Math.sin(rollRad) + relV * Math.cos(rollRad) - relV;
    dx += rotDx * w * 0.01;
    dy += rotDy * h * 0.01;

    deformed.push([bx + dx, by + dy]);
  }

  return deformed;
}

// Render textured mesh triangles to canvas
function renderMesh(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  triangles: [number, number, number][],
  srcVertices: Point[],
  dstVertices: Point[],
  uvs: Point[],
  imgW: number,
  imgH: number,
) {
  ctx.save();

  for (const [i0, i1, i2] of triangles) {
    const [sx0, sy0] = [uvs[i0][0] * imgW, uvs[i0][1] * imgH];
    const [sx1, sy1] = [uvs[i1][0] * imgW, uvs[i1][1] * imgH];
    const [sx2, sy2] = [uvs[i2][0] * imgW, uvs[i2][1] * imgH];

    const [dx0, dy0] = dstVertices[i0];
    const [dx1, dy1] = dstVertices[i1];
    const [dx2, dy2] = dstVertices[i2];

    // Compute affine transform from source triangle to destination triangle
    // Using the matrix: [a b c; d e f] where:
    // dst = M * src + [c, f]
    const det = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
    if (Math.abs(det) < 1e-6) continue;

    const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / det;
    const b = ((dx2 - dx0) * (sy1 - sy0) - (dx1 - dx0) * (sy2 - sy0)) / det;
    const c_val = dx0 - a * sx0 - b * sy0;
    const d = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / det;
    const e = ((dy2 - dy0) * (sy1 - sy0) - (dy1 - dy0) * (sy2 - sy0)) / det;
    const f = dy0 - d * sx0 - e * sy0;

    // Clip to destination triangle
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx0, dy0);
    ctx.lineTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.closePath();
    ctx.clip();

    // Apply affine transform and draw
    ctx.setTransform(a, d, b, e, c_val, f);
    ctx.drawImage(img, 0, 0);

    ctx.restore();
  }

  ctx.restore();
}

// ================================================================
// Main Hook
// ================================================================

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 640;
const TARGET_FPS = 30;

export function useRealtimeLipSync(): [LipSyncEngineState, LipSyncEngineActions] {
  const [isActive, setIsActive] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [fps, setFps] = useState(0);
  const [viseme, setViseme] = useState<VisemeState>({
    jawOpen: 0, mouthWidth: 0, lipPucker: 0,
    upperLipRaise: 0, lowerLipDrop: 0, tongueOut: 0,
  });
  const [faceAnim, setFaceAnim] = useState<FaceAnimState>({
    headRotX: 0, headRotY: 0, headRotZ: 0,
    eyeBlinkL: 0, eyeBlinkR: 0, eyeBrowRaise: 0, breathScale: 1,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgLoadedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);
  const visemeRef = useRef<VisemeState>({
    jawOpen: 0, mouthWidth: 0, lipPucker: 0,
    upperLipRaise: 0, lowerLipDrop: 0, tongueOut: 0,
  });
  const meshRef = useRef<ReturnType<typeof createFaceMesh> | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);
  const startTimeRef = useRef(0);
  const isActiveRef = useRef(false);
  const connectedAudioRef = useRef<HTMLAudioElement | null>(null);

  // Create canvas lazily
  const getCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!canvasRef.current && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      canvasRef.current = canvas;
    }
    return canvasRef.current;
  }, []);

  // Set portrait image source
  const setPortraitSrc = useCallback((src: string) => {
    if (!imgRef.current) {
      imgRef.current = new Image();
      imgRef.current.crossOrigin = 'anonymous';
    }
    imgLoadedRef.current = false;
    imgRef.current.onload = () => {
      imgLoadedRef.current = true;
      // Create mesh once image dimensions are known
      meshRef.current = createFaceMesh(CANVAS_WIDTH, CANVAS_HEIGHT, 16);
      // Draw initial static frame
      const canvas = getCanvas();
      if (canvas && imgRef.current) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(imgRef.current, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        }
      }
    };
    imgRef.current.src = src;
  }, [getCanvas]);

  // Main render loop
  const renderFrame = useCallback(() => {
    if (!isActiveRef.current) return;

    const canvas = canvasRef.current;
    const img = imgRef.current;
    const mesh = meshRef.current;
    const analyser = analyserRef.current;

    if (!canvas || !img || !imgLoadedRef.current || !mesh) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const now = performance.now();
    const elapsed = now - startTimeRef.current;

    // Get audio data
    let newViseme = visemeRef.current;
    if (analyser) {
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);

      const sampleRate = audioContextRef.current?.sampleRate || 44100;
      newViseme = extractViseme(freqData, timeData, sampleRate, visemeRef.current);
      visemeRef.current = newViseme;
    }

    // Compute face animation
    const anim = computeIdleAnim(elapsed, analyser !== null);

    // Deform mesh
    const deformedVertices = deformMesh(
      mesh.vertices, mesh.uvs, CANVAS_WIDTH, CANVAS_HEIGHT,
      newViseme, anim,
    );

    // Clear and render
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    renderMesh(ctx, img, mesh.triangles, mesh.vertices, deformedVertices, mesh.uvs, img.naturalWidth, img.naturalHeight);

    // FPS tracking
    frameCountRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }

    // Throttle state updates (every 3rd frame for React perf)
    if (frameCountRef.current % 3 === 0) {
      setViseme({ ...newViseme });
      setFaceAnim({ ...anim });
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // Start lip-sync with an audio element
  const startLipSync = useCallback((audioElement: HTMLAudioElement) => {
    if (!imgLoadedRef.current) {
      console.warn('[LipSync] Portrait not loaded yet');
      return;
    }

    // Avoid reconnecting the same element
    if (connectedAudioRef.current === audioElement && isActiveRef.current) return;

    // Create AudioContext + AnalyserNode
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      // Disconnect previous source
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.disconnect(); } catch {}
        sourceNodeRef.current = null;
      }

      // Create source from audio element (can only be done once per element)
      let source: MediaElementAudioSourceNode;
      if (connectedAudioRef.current === audioElement && sourceNodeRef.current) {
        source = sourceNodeRef.current;
      } else {
        try {
          source = ctx.createMediaElementSource(audioElement);
        } catch {
          // Already connected - reuse the existing connection
          console.log('[LipSync] Audio element already connected to AudioContext');
          // Just ensure analyser is set up
          if (!analyserRef.current) {
            analyserRef.current = ctx.createAnalyser();
            analyserRef.current.fftSize = 512;
            analyserRef.current.smoothingTimeConstant = 0.7;
          }
          setIsActive(true);
          setIsRendering(true);
          isActiveRef.current = true;
          startTimeRef.current = performance.now();
          lastFpsTimeRef.current = performance.now();
          rafRef.current = requestAnimationFrame(renderFrame);
          return;
        }
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;

      source.connect(analyser);
      analyser.connect(ctx.destination);

      sourceNodeRef.current = source;
      analyserRef.current = analyser;
      audioElementRef.current = audioElement;
      connectedAudioRef.current = audioElement;

      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
    } catch (err) {
      console.warn('[LipSync] AudioContext setup failed, running without audio analysis:', err);
      // Still run the animation loop for idle animations
    }

    setIsActive(true);
    setIsRendering(true);
    isActiveRef.current = true;
    startTimeRef.current = performance.now();
    lastFpsTimeRef.current = performance.now();

    // Start render loop
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderFrame);
  }, [renderFrame]);

  // Stop lip-sync (keeps idle animation going for liveness)
  const stopLipSync = useCallback(() => {
    // Don't disconnect audio (keep for future use) but stop the analyser
    analyserRef.current = null;

    // Reset viseme to closed mouth
    const closedViseme: VisemeState = {
      jawOpen: 0, mouthWidth: 0, lipPucker: 0,
      upperLipRaise: 0, lowerLipDrop: 0, tongueOut: 0,
    };
    visemeRef.current = closedViseme;
    setViseme(closedViseme);

    // Keep rendering for idle animation (breathing, blinking)
    // but mark as not actively lip-syncing
    setIsActive(false);
    // Don't stop the render loop — keep the face alive
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.disconnect(); } catch {}
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return [
    { isActive, isRendering, fps, viseme, faceAnim },
    { startLipSync, stopLipSync, getCanvas, setPortraitSrc },
  ];
}
