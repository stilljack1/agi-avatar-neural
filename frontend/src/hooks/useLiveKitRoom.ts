'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createCallSession,
  getCallToken,
  endCallSession,
  updateCallRuntime,
} from '../lib/call-api';
import { getStableBrowserUserId } from '../lib/browser-user-id';

/**
 * LiveKit Room Connection Hook
 * Uses the production AGI backend for session/token/runtime truth and
 * keeps browser playback state honest.
 */

export type RoomStatus =
  | 'disconnected'
  | 'requesting_media'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type LiveKitRoomState = {
  roomStatus: RoomStatus;
  roomError: string;
  sessionId: string;
  roomId: string;
  provider: string;
  localStream: MediaStream | null;
  remoteAudioElement: HTMLAudioElement | null;
  isAgentConnected: boolean;
  isAgentSpeaking: boolean;
  micLive: boolean;
  speakerLive: boolean;
  speakerBlocked: boolean;
  transportConnected: boolean;
  callDuration: number;
  sttReady: boolean | null;
  ttsReady: boolean | null;
  vadReady: boolean | null;
};

export type LiveKitRoomActions = {
  connect: (actor: 'jack' | 'julia') => Promise<void>;
  disconnect: () => Promise<void>;
  toggleMic: () => void;
  enableSpeakerAudio: () => Promise<void>;
};

export function useLiveKitRoom(): [LiveKitRoomState, LiveKitRoomActions] {
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('disconnected');
  const [roomError, setRoomError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [provider, setProvider] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [micLive, setMicLive] = useState(false);
  const [speakerLive, setSpeakerLive] = useState(false);
  const [speakerBlocked, setSpeakerBlocked] = useState(false);
  const [transportConnected, setTransportConnected] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [sttReady, setSttReady] = useState<boolean | null>(null);
  const [ttsReady, setTtsReady] = useState<boolean | null>(null);
  const [vadReady, setVadReady] = useState<boolean | null>(null);

  const roomRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const endingRef = useRef(false);
  const durationRef = useRef<number | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    if (durationRef.current) {
      window.clearInterval(durationRef.current);
      durationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
    setLocalStream(null);
    setMicLive(false);
    setSpeakerLive(false);
    setSpeakerBlocked(false);
    setTransportConnected(false);
    setIsAgentConnected(false);
    setIsAgentSpeaking(false);
    setSttReady(null);
    setTtsReady(null);
    setVadReady(null);
  }, []);

  useEffect(() => {
    return () => {
      endingRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  const pushRuntimeState = useCallback(async (overrides?: Partial<Parameters<typeof updateCallRuntime>[0]>) => {
    const currentSessionId = overrides?.call_session_id || sessionId;
    if (!currentSessionId) return;
    try {
      await updateCallRuntime({
        call_session_id: currentSessionId,
        user_id: getStableBrowserUserId(),
        mode_requested: 'voice',
        mode_actual: transportConnected && micLive && speakerLive && isAgentConnected ? 'voice' : 'text',
        room_connected: roomStatus === 'connected' || roomStatus === 'reconnecting',
        transport_connected: transportConnected,
        mic_live: micLive,
        speaker_live: speakerLive,
        stream_connected: transportConnected && (micLive || speakerLive),
        stt_ready: sttReady,
        tts_ready: ttsReady,
        vad_ready: vadReady,
        agent_joined: isAgentConnected,
        camera_live: false,
        visual_pipeline_ready: false,
        frames_receiving: false,
        ...overrides,
      });
    } catch {
      // Runtime truth should not break the session UX.
    }
  }, [
    isAgentConnected,
    micLive,
    roomStatus,
    sessionId,
    speakerLive,
    sttReady,
    transportConnected,
    ttsReady,
    vadReady,
  ]);

  useEffect(() => {
    void pushRuntimeState();
  }, [
    pushRuntimeState,
    roomStatus,
    transportConnected,
    micLive,
    speakerLive,
    isAgentConnected,
    sttReady,
    ttsReady,
    vadReady,
  ]);

  const enableSpeakerAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setSpeakerBlocked(!room.canPlaybackAudio);
      if (room.canPlaybackAudio && remoteAudioRef.current && !remoteAudioRef.current.paused) {
        setSpeakerLive(true);
      }
      await pushRuntimeState({
        speaker_live: room.canPlaybackAudio && !!remoteAudioRef.current && !remoteAudioRef.current.paused,
      });
    } catch {
      setSpeakerBlocked(true);
      await pushRuntimeState({ speaker_live: false });
    }
  }, [pushRuntimeState]);

  const bindRemoteAudioElement = useCallback((audioEl: HTMLAudioElement) => {
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', 'true');
    audioEl.volume = 1.0;
    audioEl.muted = false;
    audioEl.addEventListener('play', () => {
      setSpeakerLive(true);
      setIsAgentSpeaking(true);
    });
    audioEl.addEventListener('pause', () => {
      setIsAgentSpeaking(false);
    });
    audioEl.addEventListener('ended', () => {
      setIsAgentSpeaking(false);
    });
    audioEl.addEventListener('error', () => {
      setSpeakerLive(false);
      setIsAgentSpeaking(false);
      setSpeakerBlocked(true);
    });
  }, []);

  const connect = useCallback(async (actor: 'jack' | 'julia') => {
    if (roomStatus === 'connecting' || roomStatus === 'connected') return;
    endingRef.current = false;
    setRoomError('');
    setRoomStatus('requesting_media');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      setLocalStream(stream);
      setMicLive(true);

      if (endingRef.current) {
        cleanup();
        return;
      }
      setRoomStatus('connecting');

      const session = await createCallSession({ actor, user_id: getStableBrowserUserId() });
      setSessionId(session.call_session_id);
      setRoomId(session.room_id);
      setProvider(session.provider);
      setSttReady(session.provider === 'livekit');
      setTtsReady(session.provider === 'livekit');
      setVadReady(session.provider === 'livekit');

      if (endingRef.current) {
        cleanup();
        return;
      }

      let providerUrl = session.provider_url;
      let token = session.token || '';
      if (!token) {
        const tokenResp = await getCallToken({
          call_session_id: session.call_session_id,
          role: 'publisher',
        });
        providerUrl = tokenResp.provider_url;
        token = tokenResp.token;
        setProvider(tokenResp.provider);
      }

      if (providerUrl && token && session.provider === 'livekit') {
        const lk = await import('livekit-client');
        const room = new lk.Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(lk.RoomEvent.ParticipantConnected, () => {
          setIsAgentConnected(true);
        });

        room.on(lk.RoomEvent.ParticipantDisconnected, () => {
          setIsAgentConnected(false);
          setIsAgentSpeaking(false);
        });

        room.on(lk.RoomEvent.TrackSubscribed, (track: any) => {
          if (track.kind === lk.Track.Kind.Audio) {
            const audioEl = track.attach();
            bindRemoteAudioElement(audioEl);
            document.body.appendChild(audioEl);
            remoteAudioRef.current = audioEl;
            setSpeakerBlocked(!room.canPlaybackAudio);
            if (room.canPlaybackAudio) {
              void audioEl.play().catch(() => {
                setSpeakerBlocked(true);
                setSpeakerLive(false);
              });
            }
          }
        });

        room.on(lk.RoomEvent.TrackUnsubscribed, (track: any) => {
          if (track.kind === lk.Track.Kind.Audio) {
            track.detach();
            setSpeakerLive(false);
            setIsAgentSpeaking(false);
          }
        });

        room.on(lk.RoomEvent.AudioPlaybackStatusChanged, () => {
          const canPlay = room.canPlaybackAudio;
          setSpeakerBlocked(!canPlay);
          if (!canPlay) {
            setSpeakerLive(false);
            setIsAgentSpeaking(false);
          } else if (remoteAudioRef.current && !remoteAudioRef.current.paused) {
            setSpeakerLive(true);
          }
        });

        room.on(lk.RoomEvent.Reconnecting, () => {
          if (!endingRef.current) setRoomStatus('reconnecting');
        });

        room.on(lk.RoomEvent.Reconnected, () => {
          if (!endingRef.current) setRoomStatus('connected');
        });

        room.on(lk.RoomEvent.Disconnected, () => {
          if (!endingRef.current) {
            setRoomStatus('error');
            setRoomError('room_disconnected');
          }
        });

        await room.connect(providerUrl, token, { autoSubscribe: true });

        try {
          await room.startAudio();
          setSpeakerBlocked(!room.canPlaybackAudio);
        } catch {
          setSpeakerBlocked(!room.canPlaybackAudio);
        }

        for (const track of stream.getAudioTracks()) {
          await room.localParticipant.publishTrack(track);
        }

        setTransportConnected(true);
        if (room.remoteParticipants.size > 0) {
          setIsAgentConnected(true);
        }
      } else {
        setTransportConnected(false);
        setRoomError('livekit_token_unavailable');
        setRoomStatus('error');
        cleanup();
        return;
      }

      setRoomStatus('connected');
      setCallDuration(0);
      durationRef.current = window.setInterval(() => {
        setCallDuration((duration) => duration + 1);
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'connection_failed';
      setRoomError(msg);
      setRoomStatus('error');
      cleanup();
    }
  }, [cleanup, roomStatus]);

  const disconnect = useCallback(async () => {
    endingRef.current = true;
    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    if (sessionId) {
      try {
        await endCallSession(sessionId);
      } catch {}
    }
    cleanup();
    setRoomStatus('disconnected');
    setRoomError('');
    setSessionId('');
    setRoomId('');
    setCallDuration(0);
  }, [cleanup, sessionId]);

  const toggleMic = useCallback(() => {
    if (!streamRef.current) return;
    const tracks = streamRef.current.getAudioTracks();
    const nextLive = !micLive;
    tracks.forEach((track) => {
      track.enabled = nextLive;
    });
    setMicLive(nextLive);
  }, [micLive]);

  return [
    {
      roomStatus,
      roomError,
      sessionId,
      roomId,
      provider,
      localStream,
      remoteAudioElement: remoteAudioRef.current,
      isAgentConnected,
      isAgentSpeaking,
      micLive,
      speakerLive,
      speakerBlocked,
      transportConnected,
      callDuration,
      sttReady,
      ttsReady,
      vadReady,
    },
    {
      connect,
      disconnect,
      toggleMic,
      enableSpeakerAudio,
    },
  ];
}
