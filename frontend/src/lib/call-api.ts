/**
 * AGI-1 Call Session API Client
 * Handles session creation, token management, runtime truth updates,
 * and vision ingest against the production AGI backend.
 */

const API_BASE = '';  // same-origin via Next rewrites

export type CallSessionResponse = {
  status: string;
  call_session_id: string;
  room_id: string;
  provider: string;
  provider_url: string;
  actor: 'jack' | 'julia';
  created_at: string;
  expires_at: string;
  token?: string;
  agent_name?: string;
};

export type CallTokenResponse = {
  status: string;
  provider: string;
  provider_url: string;
  room_id: string;
  token: string;
  expires_in: number;
  role: 'publisher' | 'subscriber';
  actor: 'jack' | 'julia';
  agent_name?: string;
};

export async function createCallSession(input: {
  actor: 'jack' | 'julia';
  user_id: string;
}): Promise<CallSessionResponse> {
  const response = await fetch(`${API_BASE}/api/livekit-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actor: input.actor,
      user_id: input.user_id,
      role: 'publisher',
    }),
  });
  if (!response.ok) {
    throw new Error(`call_session_create_failed:${response.status}`);
  }
  return response.json();
}

export async function getCallToken(input: {
  call_session_id: string;
  role?: 'publisher' | 'subscriber';
}): Promise<CallTokenResponse> {
  const response = await fetch(`${API_BASE}/api/livekit-token/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call_session_id: input.call_session_id,
      role: input.role || 'publisher',
    }),
  });
  if (!response.ok) {
    throw new Error(`call_token_failed:${response.status}`);
  }
  return response.json();
}

export async function endCallSession(
  callSessionId: string
): Promise<{ status: string; call_session_id: string }> {
  const response = await fetch(`${API_BASE}/api/livekit-end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call_session_id: callSessionId }),
  });
  if (!response.ok) {
    throw new Error(`call_end_failed:${response.status}`);
  }
  return response.json();
}

export type RuntimeUpdateInput = {
  call_session_id: string;
  user_id: string;
  mode_requested?: 'text' | 'voice' | 'video';
  mode_actual?: 'text' | 'voice' | 'video';
  room_connected?: boolean;
  transport_connected?: boolean;
  mic_live?: boolean;
  speaker_live?: boolean;
  stream_connected?: boolean;
  stt_ready?: boolean | null;
  tts_ready?: boolean | null;
  vad_ready?: boolean | null;
  agent_joined?: boolean;
  camera_live?: boolean;
  visual_pipeline_ready?: boolean;
  frames_receiving?: boolean;
};

export async function updateCallRuntime(input: RuntimeUpdateInput): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/api/livekit-runtime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`call_runtime_failed:${response.status}`);
  }
  return response.json();
}

export type VisionFrameInput = {
  call_session_id?: string;
  user_id: string;
  source: 'camera' | 'screen' | 'document' | 'environment';
  frame_base64: string;
  mime_type?: string;
  width?: number;
  height?: number;
  prompt?: string;
};

export async function sendVisionFrame(input: VisionFrameInput): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/api/vision/frame`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`vision_frame_failed:${response.status}`);
  }
  return response.json();
}
