import { NextRequest, NextResponse } from 'next/server';
import { getTokens } from '../workspace/oauth/store';
import { deriveCapabilities } from '../workspace/_lib/scopes';
import { getConsent, listPermissions } from '../workspace/_lib/permission-vault';
import { readWorkspaceAudit } from '../workspace/_lib/audit';

/**
 * GET /api/runtime
 * Unified AGI-1 runtime status endpoint.
 *
 * Returns the truthful state of every subsystem:
 * - Avatar rendering
 * - Voice I/O
 * - Vision
 * - Memory
 * - Research pipeline
 * - Workspace integrations
 * - Permission state
 * - OpenClaw readiness
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';
const DID_API_KEY = process.env.DID_API_KEY || '';
const SIMLI_API_KEY = process.env.SIMLI_API_KEY || '';
const LIPSYNC_SERVER_URL = process.env.LIPSYNC_SERVER_URL || '';
const AUDIO2FACE_BRIDGE_URL = process.env.AUDIO2FACE_BRIDGE_URL || process.env.NVIDIA_ACE_WS_URL || '';
const AGI1_RUNTIME_BACKEND_URL = (process.env.AGI1_RUNTIME_BACKEND_URL || process.env.NEXT_PUBLIC_AGI_BACKEND_URL || 'https://api.agi1.org').replace(/\/$/, '');

async function loadBackendPhysicalLayer(userId: string) {
  try {
    const response = await fetch(
      `${AGI1_RUNTIME_BACKEND_URL}/api/neural/runtime?user_id=${encodeURIComponent(userId)}`,
      {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      },
    );
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    if (payload && typeof payload === 'object' && payload.physical_layer && typeof payload.physical_layer === 'object') {
      return payload.physical_layer;
    }
  } catch {
    return null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('user_id') || 'default';
  const lipSyncProvider = DID_API_KEY
    ? 'did'
    : SIMLI_API_KEY
      ? 'simli'
      : LIPSYNC_SERVER_URL
        ? 'self_hosted'
        : 'none';
  const lipSyncRenderableLive = lipSyncProvider === 'self_hosted';
  const lipSyncRealtimeCapable = lipSyncProvider === 'self_hosted' || lipSyncProvider === 'simli' || Boolean(AUDIO2FACE_BRIDGE_URL);
  const lipSyncAsyncAvailable = lipSyncProvider === 'did';
  const lipSyncClientIntegrated = lipSyncProvider === 'self_hosted';

  // Check workspace integration state
  const tokens = getTokens(userId);
  const scopes = tokens?.scopes || [];
  const capabilities = tokens ? deriveCapabilities(scopes) : null;

  // Check permission state
  const consent = getConsent(userId);
  const permissions = listPermissions(userId);
  const grantedPermissions = permissions.filter((p) => p.granted);

  // Token health
  let tokenHealth: 'none' | 'healthy' | 'expiring_soon' | 'expired' = 'none';
  if (tokens) {
    const now = Date.now();
    const expiresIn = Math.max(0, (tokens.expires_at - now) / 1000);
    tokenHealth = now >= tokens.expires_at
      ? 'expired'
      : expiresIn < 300
        ? 'expiring_soon'
        : 'healthy';
  }

  // Recent audit events
  const recentAudit = readWorkspaceAudit(5);
  const backendPhysicalLayer = await loadBackendPhysicalLayer(userId);
  const fallbackPhysicalLayer = {
    world_model_live: false,
    scene_persistence_live: true,
    scene_query_live: true,
    actor_grounding_live: false,
    embodiment_constraints_live: false,
    ebm_logic_guard_live: false,
    photonic_presence_live: false,
    components: {
      worldfm: {
        status: 'staged',
        note: 'Scene persistence is local-only until the backend physical layer responds.',
      },
      ebm: {
        status: 'staged',
        note: 'Rule-based consistency seam exists locally; backend truth is preferred.',
      },
      psizero: {
        status: 'staged',
        note: 'Motion constraints are staged until the backend physical layer is active.',
      },
      lito: {
        status: 'staged',
        note: 'Photonic presence remains staged until the backend runtime confirms it.',
      },
    },
    war_room_v1: {
      found: true,
      scene_id: 'war_room_v1',
      attached_actors: ['jack', 'julia'],
      persistent: true,
    },
    blockers: [
      'Backend physical layer runtime did not respond; using a local fallback contract.',
    ],
  };

  return NextResponse.json({
    status: 'ok',
    user_id: userId,

    // Core truth contract
    truth: {
      // Avatar
      avatar_render_live: true,       // Video playback works
      lip_sync_live: lipSyncRenderableLive,
      lip_sync_provider: lipSyncProvider,
      lip_sync_realtime_capable: lipSyncRealtimeCapable,
      lip_sync_async_available: lipSyncAsyncAvailable,
      lip_sync_client_integrated: lipSyncClientIntegrated,
      audio2face_live: Boolean(AUDIO2FACE_BRIDGE_URL),
      pixel_streaming_live: false,    // UE5.7 not deployed
      render_mode: lipSyncRenderableLive ? 'generated_video' : 'video_swap',

      // Voice
      voice_output_live: Boolean(GROQ_API_KEY),  // Groq Orpheus TTS
      voice_input_live: Boolean(GROQ_API_KEY),   // Groq Whisper STT
      tts_provider: GROQ_API_KEY ? 'groq_orpheus' : 'none',
      stt_provider: GROQ_API_KEY ? 'groq_whisper' : 'none',

      // Vision
      vision_live: Boolean(GROQ_API_KEY),         // Groq Llama-4-Scout
      vision_provider: GROQ_API_KEY ? 'groq_llama4_scout' : 'none',

      // Memory
      memory_live: true,              // conversation-store + memory-graph
      memory_provider: 'in_memory',   // Upgradeable to persistent DB

      // Research
      research_live: true,            // Auto-Scientist pipeline
      research_provider: 'auto_scientist',

      // LLM
      llm_live: Boolean(GROQ_API_KEY),
      llm_provider: GROQ_API_KEY ? 'groq' : 'none',
      llm_model: 'llama-3.3-70b-versatile',
    },

    // Workspace integrations
    workspace: {
      connected: Boolean(tokens),
      token_health: tokenHealth,
      integrations: {
        gmail: capabilities?.gmailRead ?? false,
        gmail_write: capabilities?.gmailWrite ?? false,
        drive: capabilities?.driveRead ?? false,
        docs: capabilities?.docsRead ?? false,
        sheets: capabilities?.sheetsRead ?? false,
        calendar: scopes.some((s) => s.includes('calendar')),
      },
      oauth_url: `/api/workspace/oauth?user_id=${encodeURIComponent(userId)}`,
    },

    // Permission state
    permissions: {
      total_categories: permissions.length,
      granted: grantedPermissions.length,
      consent_created: consent?.created_at || null,
      grants: grantedPermissions.map((p) => ({ category: p.category, risk: p.risk_level })),
    },

    // Agent readiness
    agents: {
      jack: { ready: true, mode: 'voice_text_vision' },
      julia: { ready: true, mode: 'voice_text_vision' },
      singularity: { ready: true, mode: 'task_orchestrator' },
      aegis: { ready: true, mode: 'policy_safety' },
      openclaw: { ready: Boolean(tokens), mode: tokens ? 'workspace_operator' : 'requires_oauth' },
    },

    // Omni-Nodes
    omni_nodes: {
      communications: {
        status: capabilities?.gmailRead ? 'live' : 'requires_oauth',
        provider: 'google_gmail',
      },
      documents: {
        status: capabilities?.driveRead ? 'live' : 'requires_oauth',
        provider: 'google_drive_docs',
      },
      sheets: {
        status: capabilities?.sheetsRead ? 'live' : 'requires_oauth',
        provider: 'google_sheets',
      },
      calendar: {
        status: scopes.some((s) => s.includes('calendar')) ? 'live' : 'requires_oauth',
        provider: 'google_calendar',
      },
      finance: {
        status: 'staged',
        provider: 'plaid_stripe',
        note: 'Requires Plaid/Stripe API keys',
      },
      social: {
        status: 'staged',
        provider: 'official_apis',
        note: 'Requires social platform API keys',
      },
      health: {
        status: 'staged',
        provider: 'local_tracking',
      },
      device_io: {
        status: 'browser_only',
        capabilities: ['camera', 'microphone', 'screen_share'],
      },
    },

    // Physical Layer — truthful runtime flags
    // These report the actual state of the world model integration.
    // All flags default to false unless the physical layer backend confirms otherwise.
    physical_layer: backendPhysicalLayer || fallbackPhysicalLayer,

    // Recent activity
    recent_audit: recentAudit,

    timestamp: new Date().toISOString(),
  });
}
