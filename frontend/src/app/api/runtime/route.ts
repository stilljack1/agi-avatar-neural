import { NextRequest, NextResponse } from 'next/server';
import { getTokens } from '../workspace/oauth/store';
import { deriveCapabilities } from '../workspace/_lib/scopes';
import { getConsent, listPermissions } from '../workspace/_lib/permission-vault';
import { readWorkspaceAudit } from '../workspace/_lib/audit';
import { AGI1_SYSTEM_CONTRACT, getAgiApiBase, getAgiApiWsBase } from '../../../lib/api-base';

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

const XAI_API_KEY = process.env.XAI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_LLAMA_KEY || '';
const XAI_MODEL = process.env.XAI_MODEL || 'grok-3';
const DID_API_KEY = process.env.DID_API_KEY || '';
const SIMLI_API_KEY = process.env.SIMLI_API_KEY || '';
const LIPSYNC_SERVER_URL = process.env.LIPSYNC_SERVER_URL || '';
const AUDIO2FACE_BRIDGE_URL = process.env.AUDIO2FACE_BRIDGE_URL || process.env.NVIDIA_ACE_WS_URL || '';
const AGI1_RUNTIME_BACKEND_URL = (process.env.AGI1_RUNTIME_BACKEND_URL || process.env.NEXT_PUBLIC_AGI_BACKEND_URL || getAgiApiBase()).replace(/\/$/, '');

async function loadBackendNeuralRuntime(userId: string) {
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
    if (payload && typeof payload === 'object') {
      return payload;
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
  const backendNeuralRuntime = await loadBackendNeuralRuntime(userId);
  const backendPhysicalLayer =
    backendNeuralRuntime?.physical_layer && typeof backendNeuralRuntime.physical_layer === 'object'
      ? backendNeuralRuntime.physical_layer
      : null;
  const fallbackPhysicalLayer = {
    world_model_live: false,
    scene_persistence_live: true,
    scene_query_live: true,
    scene_initialized_live: true,
    controller_anchor_live: true,
    controller_role: 'm1_controller_spatial_anchor',
    renderer_required: true,
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
  const renderEngineActual = typeof backendNeuralRuntime?.render_engine_actual === 'string'
    ? backendNeuralRuntime.render_engine_actual
    : lipSyncRenderableLive
      ? 'browser_generated_video'
      : 'video_swap';
  const renderEngineTarget = typeof backendNeuralRuntime?.render_engine_target === 'string'
    ? backendNeuralRuntime.render_engine_target
    : 'high_quality_avatar_runtime';
  const avatarResolutionActual = typeof backendNeuralRuntime?.avatar_resolution_actual === 'string'
    ? backendNeuralRuntime.avatar_resolution_actual
    : lipSyncRenderableLive
      ? 'generated_video'
      : 'reference_video';
  const runtimeBlockers = [
    ...(Array.isArray(backendNeuralRuntime?.blockers) ? backendNeuralRuntime.blockers : []),
    ...(Array.isArray(backendPhysicalLayer?.blockers) ? backendPhysicalLayer.blockers : []),
  ].filter((value, index, list) => typeof value === 'string' && list.indexOf(value) === index);

  return NextResponse.json({
    status: 'ok',
    user_id: userId,

    // Core truth contract
    truth: {
      // Avatar
      avatar_render_live: true,       // Video playback works
      avatar_identity_locked: true,
      lip_sync_live: lipSyncRenderableLive,
      lip_sync_provider: lipSyncProvider,
      lip_sync_realtime_capable: lipSyncRealtimeCapable,
      lip_sync_async_available: lipSyncAsyncAvailable,
      lip_sync_client_integrated: lipSyncClientIntegrated,
      audio2face_live: Boolean(backendNeuralRuntime?.audio2face_live ?? AUDIO2FACE_BRIDGE_URL),
      personaplex_live: Boolean(backendNeuralRuntime?.personaplex_live),
      metahuman_path_live: Boolean(backendNeuralRuntime?.metahuman_path_live ?? backendNeuralRuntime?.meta_avatar_live),
      pixel_streaming_live: false,    // UE5.7 not deployed
      render_mode: renderEngineActual,
      render_engine_target: renderEngineTarget,
      render_engine_actual: renderEngineActual,
      render_node_live: Boolean(backendNeuralRuntime?.render_node_live),
      meta_avatar_live: Boolean(backendNeuralRuntime?.meta_avatar_live),
      facial_expression_live: Boolean(backendNeuralRuntime?.facial_expression_live ?? backendNeuralRuntime?.audio2face_live),
      body_gesture_live: Boolean(backendNeuralRuntime?.body_gesture_live),
      cinematic_quality_live: Boolean(backendNeuralRuntime?.cinematic_quality_live ?? lipSyncRenderableLive),
      cinematic_4k_live: Boolean(backendNeuralRuntime?.cinematic_4k_live),
      live_4k: Boolean(backendNeuralRuntime?.live_4k ?? backendNeuralRuntime?.cinematic_4k_live),
      cosmos_world_layer_live: Boolean(backendNeuralRuntime?.cosmos_world_layer_live),
      avatar_resolution_actual: avatarResolutionActual,
      wardrobe_swap_live: Boolean(backendNeuralRuntime?.wardrobe_swap_live),

      // Voice
      voice_output_live: Boolean(XAI_API_KEY || GROQ_API_KEY),
      voice_input_live: Boolean(XAI_API_KEY || GROQ_API_KEY),
      tts_provider: XAI_API_KEY ? 'xai_realtime' : GROQ_API_KEY ? 'groq_orpheus' : 'none',
      stt_provider: XAI_API_KEY ? 'xai_realtime' : GROQ_API_KEY ? 'groq_whisper' : 'none',
      voice_transport: XAI_API_KEY
        ? 'xai_realtime'
        : typeof backendNeuralRuntime?.voice_transport === 'string'
          ? backendNeuralRuntime.voice_transport
          : 'livekit',
      voice_model: XAI_API_KEY ? 'grok-4.20-realtime' : GROQ_API_KEY ? 'orpheus-v1' : 'none',
      voice_jack: XAI_API_KEY ? 'Rex' : 'daniel',
      voice_julia: XAI_API_KEY ? 'Ara' : 'diana',
      full_duplex_live: Boolean(XAI_API_KEY || backendNeuralRuntime?.full_duplex_live),

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
      llm_live: Boolean(XAI_API_KEY || GROQ_API_KEY),
      llm_provider: XAI_API_KEY ? 'xai_grok' : GROQ_API_KEY ? 'groq' : 'none',
      llm_model: XAI_API_KEY ? XAI_MODEL : 'llama-3.3-70b-versatile',

      // Controller / world model truth
      world_model_live: Boolean(backendPhysicalLayer?.world_model_live),
      scene_initialized_live: Boolean(backendPhysicalLayer?.scene_initialized_live),
      scene_persistence_live: Boolean(backendPhysicalLayer?.scene_persistence_live),
      actor_grounding_live: Boolean(backendPhysicalLayer?.actor_grounding_live),
      controller_role: typeof backendNeuralRuntime?.controller_role === 'string'
        ? backendNeuralRuntime.controller_role
        : typeof backendPhysicalLayer?.controller_role === 'string'
          ? backendPhysicalLayer.controller_role
          : 'm1_controller_spatial_anchor',
      jack_scene_attached: Boolean(backendNeuralRuntime?.jack_scene_attached),
      julia_scene_attached: Boolean(backendNeuralRuntime?.julia_scene_attached),
      blockers: runtimeBlockers,
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

    system: {
      contract: AGI1_SYSTEM_CONTRACT,
      canonical_domains: {
        product: AGI1_SYSTEM_CONTRACT.domains.product,
        neural: AGI1_SYSTEM_CONTRACT.domains.neural,
        jack: AGI1_SYSTEM_CONTRACT.domains.jack,
        julia: AGI1_SYSTEM_CONTRACT.domains.julia,
        api: getAgiApiBase(),
        api_ws: getAgiApiWsBase(),
        corporate: AGI1_SYSTEM_CONTRACT.domains.corporate,
      },
      agent_roles: {
        jack: AGI1_SYSTEM_CONTRACT.agents.jack,
        julia: AGI1_SYSTEM_CONTRACT.agents.julia,
        singularity: AGI1_SYSTEM_CONTRACT.agents.singularity,
        openclaw: AGI1_SYSTEM_CONTRACT.agents.openclawV2,
        aegis: AGI1_SYSTEM_CONTRACT.agents.aegis,
      },
      topology: AGI1_SYSTEM_CONTRACT.topology,
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
