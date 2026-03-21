'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createCallSession,
  getCallToken,
  endCallSession,
  type CallSessionResponse,
} from '../lib/call-api';
import { getStableBrowserUserId } from '../lib/browser-user-id';

export type CallStatus = 'idle' | 'requesting' | 'connecting' | 'connected' | 'reconnecting' | 'error';

type LiveCallState = {
  status: CallStatus;
  error: string;
  sessionId: string;
  localStream: MediaStream | null;
  hasMicPermission: boolean;
  hasCamPermission: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  callDuration: number;
};

type LiveCallActions = {
  startCall: (actor: 'jack' | 'julia') => Promise<void>;
  endCall: () => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => void;
};

export function useLiveCall(): [LiveCallState, LiveCallActions] {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [hasCamPermission, setHasCamPermission] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<{ id: string; actor: string } | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  const endingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endingRef.current = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (durationTimerRef.current) {
        window.clearInterval(durationTimerRef.current);
      }
    };
  }, []);

  const acquireMedia = useCallback(async (): Promise<MediaStream> => {
    // Request camera + microphone
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setHasMicPermission(stream.getAudioTracks().length > 0);
      setHasCamPermission(stream.getVideoTracks().length > 0);
      return stream;
    } catch (err) {
      // Try audio-only if video fails
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: constraints.audio });
        setHasMicPermission(true);
        setHasCamPermission(false);
        return audioOnly;
      } catch {
        throw new Error('media_permission_denied');
      }
    }
  }, []);

  const startCall = useCallback(async (actor: 'jack' | 'julia') => {
    if (status === 'connecting' || status === 'connected') return;

    setError('');
    setStatus('requesting');
    endingRef.current = false;

    try {
      // Step 1: Acquire camera + mic
      const stream = await acquireMedia();
      streamRef.current = stream;
      setLocalStream(stream);

      if (endingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      setStatus('connecting');

      // Step 2: Create call session on server
      const userId = getStableBrowserUserId();
      const session = await createCallSession({ actor, user_id: userId });
      sessionRef.current = { id: session.call_session_id, actor };
      setSessionId(session.call_session_id);

      if (endingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Step 3: Get call token
      const tokenResp = await getCallToken({
        call_session_id: session.call_session_id,
        role: 'publisher',
      });

      if (endingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Step 4: If LiveKit provider URL is available, connect via LiveKit
      // For now, with local provider, we go straight to "connected" with local media
      if (tokenResp.provider_url && tokenResp.provider === 'livekit') {
        // LiveKit connection — dynamic import to avoid SSR issues
        const { Room, RoomEvent, Track } = await import('livekit-client');
        const room = new Room({ adaptiveStream: true, dynacast: true });

        room.on(RoomEvent.Disconnected, () => {
          if (!endingRef.current) {
            setStatus('error');
            setError('call_disconnected');
          }
        });

        await room.connect(tokenResp.provider_url, tokenResp.token, {
          autoSubscribe: true,
        });

        // Publish local tracks
        for (const track of stream.getTracks()) {
          if (track.kind === 'audio') {
            await room.localParticipant.publishTrack(track);
          } else if (track.kind === 'video') {
            await room.localParticipant.publishTrack(track);
          }
        }
      }

      // Mark as connected
      setStatus('connected');
      setCallDuration(0);

      // Start duration timer
      durationTimerRef.current = window.setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'call_start_failed';
      setError(message);
      setStatus('error');

      // Cleanup stream on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setLocalStream(null);
      }
    }
  }, [status, acquireMedia]);

  const endCall = useCallback(async () => {
    endingRef.current = true;

    // Stop duration timer
    if (durationTimerRef.current) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    // Stop all media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLocalStream(null);

    // End server session
    const session = sessionRef.current;
    if (session?.id) {
      try {
        await endCallSession(session.id);
      } catch {
        // no-op: local disconnect still completed
      }
    }
    sessionRef.current = null;

    setStatus('idle');
    setError('');
    setSessionId('');
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (!streamRef.current) return;
    const audioTracks = streamRef.current.getAudioTracks();
    const newMuted = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !newMuted;
    });
    setIsMuted(newMuted);
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    if (!streamRef.current) return;
    const videoTracks = streamRef.current.getVideoTracks();
    const newOff = !isCameraOff;
    videoTracks.forEach((track) => {
      track.enabled = !newOff;
    });
    setIsCameraOff(newOff);
  }, [isCameraOff]);

  const state: LiveCallState = {
    status,
    error,
    sessionId,
    localStream,
    hasMicPermission,
    hasCamPermission,
    isMuted,
    isCameraOff,
    callDuration,
  };

  const actions: LiveCallActions = {
    startCall,
    endCall,
    toggleMic,
    toggleCamera,
  };

  return [state, actions];
}
