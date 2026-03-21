/**
 * Julia Avatar Profile — Source-of-Truth Identity & Render Configuration
 *
 * Layer 1: Identity & Likeness (reference videos + portrait)
 * Layer 2: Voice (Groq Orpheus TTS, female, pitch +0.05)
 * Layer 3: Animation (idle/speaking video states, future: Audio2Face)
 * Layer 4: Multimodal (vision + voice + text)
 * Layer 5: Mind & Memory (conversation store, 20-turn history)
 */

export const juliaAvatarProfile = {
  id: 'julia',
  displayName: 'Julia',
  title: 'Warm Operator',
  role: 'Wellness & Creative Intelligence Officer',

  // Visual DNA
  visual: {
    accentColor: '#FF6A00',
    accentColorSecondary: '#E05500',
    gradient: 'linear-gradient(135deg, #FF6A00 0%, #E05500 100%)',
    glowColor: 'rgba(255, 106, 0, 0.3)',
    skinTone: '#C0C7C7',
    backgroundColor: '#0C0A14',
    highlightHex: '#EF2E6A',
  },

  // Reference Assets (source videos for 3D extraction)
  referenceAssets: {
    idleVideo: '/avatars/julia-idle.mp4',
    speakingVideo: '/avatars/julia-speaking.mp4',
    altVideo: '/avatars/julia-alt.mp4',
    portrait: '/avatars/julia-portrait.png',
    referenceFramesDir: 'src/avatars/julia/reference/',
  },

  // Render Configuration
  render: {
    mode: 'video' as const,
    videoSources: {
      idle: '/avatars/julia-idle.mp4',
      speaking: '/avatars/julia-speaking.mp4',
      alt: '/avatars/julia-alt.mp4',
    },
    fallbackPoster: '/avatars/julia-portrait.png',
    lipSync: {
      enabled: false,
      provider: 'none' as const,
      latencyTarget: 120,
    },
    pixelStreaming: {
      enabled: false,
      endpoint: '',
      resolution: { width: 1920, height: 1080 },
    },
  },

  // Voice Configuration
  voice: {
    ttsProvider: 'groq_orpheus' as const,
    ttsModel: 'canopylabs/orpheus-v1-english',
    voiceProfile: 'sovereign_female_beta',
    pitchOffset: 0.05,
    emotionalRange: 0.92,
    latencyTarget: 'ultra-low' as const,
    fallbackVoices: ['Samantha', 'Karen', 'Tessa'],
  },

  // Personality
  personality: {
    greeting: "Hi. I'm with you. What's on your mind?",
    systemPrompt: `You are Julia. Sound warm, intuitive, articulate, and genuinely human. Keep replies to 2 or 3 short sentences because they are often spoken aloud. Do not recite a role description or drift into polished corporate language. Only say you can hear, see, or remember the user if the system context in this turn actually supports it.`,
    domains: ['wellness', 'beauty', 'fitness', 'creativity', 'emotional-health', 'nutrition'],
    tone: 'warm, intuitive, articulate, genuinely human',
  },

  // Truth Contract
  truth: {
    avatar_render_live: true,
    lip_sync_live: false,
    audio2face_live: false,
    pixel_streaming_live: false,
    voice_output_live: true,
    voice_input_live: true,
    vision_live: true,
    memory_live: true,
    research_live: true,
  },
} as const;

export type JuliaAvatarProfile = typeof juliaAvatarProfile;
export default juliaAvatarProfile;
