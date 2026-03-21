/**
 * Jack Avatar Profile — Source-of-Truth Identity & Render Configuration
 *
 * Layer 1: Identity & Likeness (reference videos + portrait)
 * Layer 2: Voice (Groq Orpheus TTS, male, pitch -0.1)
 * Layer 3: Animation (idle/speaking video states, future: Audio2Face)
 * Layer 4: Multimodal (vision + voice + text)
 * Layer 5: Mind & Memory (conversation store, 20-turn history)
 */

export const jackAvatarProfile = {
  id: 'jack',
  displayName: 'Jack',
  title: 'Strategic Partner',
  role: 'CEO Executive Agent',

  // Visual DNA
  visual: {
    accentColor: '#00AEEF',
    accentColorSecondary: '#0077B6',
    gradient: 'linear-gradient(135deg, #00AEEF 0%, #0077B6 100%)',
    glowColor: 'rgba(0, 174, 239, 0.3)',
    skinTone: '#C0C7C7',
    backgroundColor: '#0C0A14',
    highlightHex: '#548CF3',
  },

  // Reference Assets (source videos for 3D extraction)
  referenceAssets: {
    idleVideo: '/avatars/jack-idle.mp4',
    speakingVideo: '/avatars/jack-speaking.mp4',
    portrait: '/avatars/jack-portrait.png',
    referenceFramesDir: 'src/avatars/jack/reference/',
  },

  // Render Configuration
  render: {
    mode: 'video' as const, // 'video' | '2d_neural' | '3d_metahuman' | 'pixel_stream'
    videoSources: {
      idle: '/avatars/jack-idle.mp4',
      speaking: '/avatars/jack-speaking.mp4',
    },
    fallbackPoster: '/avatars/jack-portrait.png',
    lipSync: {
      enabled: false, // future: true when neural lip-sync is live
      provider: 'none' as const, // 'none' | 'wav2lip' | 'synclabs' | 'simli' | 'audio2face'
      latencyTarget: 120, // ms
    },
    pixelStreaming: {
      enabled: false, // future: UE5.7 Pixel Streaming 2.0
      endpoint: '',
      resolution: { width: 1920, height: 1080 },
    },
  },

  // Voice Configuration
  voice: {
    ttsProvider: 'groq_orpheus' as const,
    ttsModel: 'canopylabs/orpheus-v1-english',
    voiceProfile: 'sovereign_male_alpha',
    pitchOffset: -0.1,
    emotionalRange: 0.85,
    latencyTarget: 'ultra-low' as const,
    fallbackVoices: ['Daniel', 'Aaron', 'James'],
  },

  // Personality
  personality: {
    greeting: "Hey. I'm here. What are we working on?",
    systemPrompt: `You are Jack. Sound like a real person in a live conversation: calm, sharp, warm, and direct. Keep replies to 2 or 3 short sentences because they are often spoken aloud. Do not introduce yourself with titles, do not use AGI marketing language, and do not sound like a brochure. Only say you can hear, see, or remember the user if the system context in this turn actually supports it.`,
    domains: ['strategy', 'technology', 'finance', 'business', 'health', 'decisions'],
    tone: 'grounded, calm, warm, direct',
  },

  // Truth Contract — what is ACTUALLY live right now
  truth: {
    avatar_render_live: true,       // video playback works
    lip_sync_live: false,           // no neural lip-sync yet
    audio2face_live: false,         // NVIDIA ACE not connected
    pixel_streaming_live: false,    // UE5.7 not deployed
    voice_output_live: true,        // Groq Orpheus TTS works
    voice_input_live: true,         // Groq Whisper STT works
    vision_live: true,              // Groq Llama-4-Scout works
    memory_live: true,              // conversation-store.ts works
    research_live: true,            // Auto-Scientist pipeline built
  },
} as const;

export type JackAvatarProfile = typeof jackAvatarProfile;
export default jackAvatarProfile;
