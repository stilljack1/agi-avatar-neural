'use client';
// ─────────────────────────────────────────────────────────
//  AGI-1 Welcome — FULL SCREEN UNMUTED Video
//  Strategy: try unmuted autoplay first. If browser blocks,
//  fall back to muted + show unmute overlay.
//  Video covers 100% of the screen. Nothing on top.
// ─────────────────────────────────────────────────────────
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const WELCOME_VIDEO_SOURCES = ['/video/welcome.mp4', 'https://agi1.org/video/welcome.mp4'];

function TopAuthActions({
  onSignIn,
  onSignUp,
}: {
  onSignIn?: () => void;
  onSignUp?: () => void;
}) {
  const sharedClassName =
    'rounded-full px-4 py-2 text-sm transition sm:px-5';

  const sharedGlassStyle = {
    background: 'rgba(0,0,0,0.28)',
    backdropFilter: 'blur(10px)',
  } as const;

  const signInProps = onSignIn
    ? { as: 'button' as const, onClick: onSignIn }
    : { as: 'a' as const, href: '/login' };

  const signUpProps = onSignUp
    ? { as: 'button' as const, onClick: onSignUp }
    : { as: 'a' as const, href: '/register' };

  const SignInTag = signInProps.as;
  const SignUpTag = signUpProps.as;

  return (
    <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pt-4 sm:px-6 sm:pt-6">
      <div
        className="rounded-full border border-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/75"
        style={sharedGlassStyle}
      >
        AGI-1
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <SignInTag
          {...(signInProps.as === 'button' ? { type: 'button' as const } : {})}
          {...signInProps}
          className={`${sharedClassName} border border-white/15 font-medium text-white hover:border-white/30 hover:bg-white/10`}
          style={sharedGlassStyle}
        >
          Sign In
        </SignInTag>
        <SignUpTag
          {...(signUpProps.as === 'button' ? { type: 'button' as const } : {})}
          {...signUpProps}
          className={`${sharedClassName} font-semibold text-white hover:opacity-90`}
          style={{
            background: 'linear-gradient(135deg, #FF6A00, #FF8A33)',
            boxShadow: '0 0 32px rgba(255,106,0,0.24)',
          }}
        >
          Sign Up
        </SignUpTag>
      </div>
    </div>
  );
}

function WelcomeHeroCopy({ compact = false }: { compact?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4 sm:top-24 sm:px-6">
      <div className="w-full max-w-5xl text-center text-white">
        <p
          className={`text-white/80 ${compact ? 'text-[11px]' : 'text-[12px] sm:text-[13px]'} uppercase tracking-[0.38em]`}
          style={{ textShadow: '0 0 28px rgba(255,255,255,0.15)' }}
        >
          Welcome to AGI-1
        </p>
        <h1
          className={`mt-4 font-semibold ${compact ? 'text-[34px]' : 'text-[40px] sm:text-[64px] lg:text-[78px]'} leading-none tracking-[-0.04em]`}
          style={{ textShadow: '0 0 36px rgba(255,255,255,0.24)' }}
        >
          Welcome to AGI 1
        </h1>
        <div className="mx-auto mt-4 h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-[#FF8A33] to-transparent opacity-90" />
        <p
          className={`mt-4 font-medium italic text-[#FFB56D] ${compact ? 'text-lg' : 'text-xl sm:text-[34px]'} tracking-[0.06em]`}
          style={{ textShadow: '0 0 26px rgba(255,138,51,0.22)' }}
        >
          The Beginning of a New World
        </p>
        <p
          className={`mx-auto mt-6 max-w-3xl ${compact ? 'text-sm' : 'text-sm sm:text-[17px]'} leading-relaxed text-white/82`}
          style={{ textShadow: '0 0 20px rgba(0,0,0,0.35)' }}
        >
          Jack and Julia, your personal super intelligent assistants, are here to help you.
        </p>
      </div>
    </div>
  );
}

function WelcomeCaptionCard() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex justify-center px-4 sm:bottom-32">
      <div
        className="max-w-3xl rounded-[28px] border border-white/20 px-6 py-4 text-center text-black shadow-[0_18px_80px_rgba(0,0,0,0.28)] sm:px-10"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,246,246,0.92) 100%)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <p className="text-xl font-medium leading-tight sm:text-[28px]">
          Jack and Julia, your personal Super Assistants, are here to help you.
        </p>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoplayAttemptedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [browserBlocked, setBrowserBlocked] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [ended, setEnded] = useState(false);
  const [ready, setReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [showFallbackOverlay, setShowFallbackOverlay] = useState(false);
  const [videoSrcIndex, setVideoSrcIndex] = useState(0);

  // ── Redirect if already seen ────────────────────────────
  useEffect(() => {
    const seen = localStorage.getItem('agi1_welcome_seen');
    if (seen === 'true') {
      router.replace('/');
      return;
    }
    setReady(true);
  }, [router]);

  const attemptPlayback = useCallback(async () => {
    const vid = videoRef.current;
    if (!vid) return;

    try {
      vid.muted = false;
      setMuted(false);
      setBrowserBlocked(false);
      setVideoFailed(false);
      setShowFallbackOverlay(false);
      await vid.play();
    } catch {
      try {
        vid.muted = true;
        setMuted(true);
        setBrowserBlocked(true);
        setVideoFailed(false);
        setShowFallbackOverlay(true);
        await vid.play();
      } catch {
        setVideoFailed(true);
        setShowFallbackOverlay(true);
      }
    }
  }, []);

  // ── Try unmuted autoplay, fall back to muted ────────────
  useEffect(() => {
    if (!ready || autoplayAttemptedRef.current) return;
    const vid = videoRef.current;
    if (!vid) return;
    autoplayAttemptedRef.current = true;
    void attemptPlayback();
  }, [attemptPlayback, ready]);

  useEffect(() => {
    if (!ready || ended) return;
    const timer = window.setTimeout(() => {
      const vid = videoRef.current;
      const stalled = !vid || vid.readyState < 2 || vid.currentTime < 0.05;
      if (stalled) {
        setShowFallbackOverlay(true);
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [ended, ready]);

  // ── Unmute on user tap ──────────────────────────────────
  const handleUnmute = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = false;
    setMuted(false);
    setBrowserBlocked(false);
    setVideoFailed(false);
    setShowFallbackOverlay(false);
    // Also try to play if paused
    if (vid.paused) vid.play().catch(() => {});
  }, []);

  // ── Proceed: always set cookie + go to wireframe SPA ────
  const completeWelcome = useCallback((targetPath = '/') => {
    localStorage.setItem('agi1_welcome_seen', 'true');
    if (dontShowAgain) {
      document.cookie =
        'agi1_welcome_seen=true; path=/; max-age=31536000; SameSite=Lax';
    } else {
      document.cookie =
        'agi1_welcome_seen=true; path=/; SameSite=Lax';
    }
    setFadeOut(true);
    setTimeout(() => {
      window.location.href = targetPath;
    }, 600);
  }, [dontShowAgain]);

  const proceed = useCallback(() => {
    completeWelcome('/');
  }, [completeWelcome]);

  const handleAuthEntry = useCallback((targetPath: '/login' | '/register') => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    completeWelcome(targetPath);
  }, [completeWelcome]);

  const handleSkip = useCallback(() => {
    if (videoRef.current) videoRef.current.pause();
    proceed();
  }, [proceed]);

  const handleVideoEnd = useCallback(() => {
    setEnded(true);
    setTimeout(proceed, 2000);
  }, [proceed]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.currentTime > 0.05) {
        setShowFallbackOverlay(false);
      }
      const p =
        (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(isNaN(p) ? 0 : p);
    }
  }, []);

  if (!ready) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black">
        <TopAuthActions />
        <WelcomeHeroCopy compact />
        <div className="flex flex-col items-center gap-5 text-center text-white">
          <div className="h-14 w-14 animate-spin rounded-full border-2 border-white/20 border-t-[#FF6A00]" />
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/45">AGI-1</p>
            <h1 className="mt-2 text-3xl font-semibold">Preparing your welcome experience</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black transition-opacity duration-700 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <TopAuthActions
        onSignIn={() => handleAuthEntry('/login')}
        onSignUp={() => handleAuthEntry('/register')}
      />
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(180deg, rgba(3,6,12,0.72) 0%, rgba(3,6,12,0.18) 24%, rgba(3,6,12,0.08) 55%, rgba(3,6,12,0.52) 100%)',
        }}
      />
      <WelcomeHeroCopy />
      <WelcomeCaptionCard />

      {/* ═══════════════════════════════════════════════════
          VIDEO — 100% of the screen, nothing on top
          ═══════════════════════════════════════════════════ */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        playsInline
        muted={muted}
        disablePictureInPicture
        controlsList="nodownload noplaybackrate"
        onEnded={handleVideoEnd}
        onTimeUpdate={handleTimeUpdate}
        onLoadedData={() => {
          setVideoFailed(false);
        }}
        onPlaying={() => {
          setVideoFailed(false);
          setShowFallbackOverlay(false);
        }}
        onStalled={() => setShowFallbackOverlay(true)}
        onError={() => {
          if (videoSrcIndex < WELCOME_VIDEO_SOURCES.length - 1) {
            autoplayAttemptedRef.current = false;
            setVideoSrcIndex((current) => current + 1);
            const vid = videoRef.current;
            if (vid) {
              window.setTimeout(() => {
                vid.load();
                void attemptPlayback();
              }, 0);
            }
            return;
          }
          setVideoFailed(true);
          setShowFallbackOverlay(true);
        }}
        preload="auto"
        style={{ zIndex: 1 }}
      >
        <source src={WELCOME_VIDEO_SOURCES[videoSrcIndex]} type="video/mp4" />
      </video>

      {(showFallbackOverlay || videoFailed) && !ended ? (
        <div
          className="absolute inset-0 z-25 flex items-center justify-center px-6"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.68) 100%)',
          }}
        >
          <div
            className="w-full max-w-2xl rounded-[28px] border border-white/10 p-8 text-center"
            style={{
              background: 'rgba(7, 9, 13, 0.72)',
              backdropFilter: 'blur(18px)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            <p
              style={{
                color: 'rgba(255,255,255,0.58)',
                fontSize: '12px',
                letterSpacing: '0.35em',
                textTransform: 'uppercase',
                marginBottom: '14px',
              }}
            >
              Welcome to AGI-1
            </p>
            <h1
              style={{
                color: 'white',
                fontSize: 'clamp(32px, 6vw, 56px)',
                fontWeight: 800,
                lineHeight: 1.05,
                marginBottom: '14px',
              }}
            >
              The Beginning of a New World
            </h1>
            <p
              style={{
                color: 'rgba(255,255,255,0.72)',
                fontSize: '15px',
                lineHeight: 1.6,
                marginBottom: '28px',
              }}
            >
              The cinematic intro is unavailable on this device right now, but the product is ready.
              Enter directly or enable sound to continue with the full welcome experience.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={proceed}
                style={{
                  padding: '16px 34px',
                  background: 'linear-gradient(135deg, #FF6A00, #FF8A33)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '16px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 0 50px rgba(255,106,0,0.25)',
                }}
              >
                Enter AGI-1
              </button>
              {browserBlocked ? (
                <button
                  onClick={handleUnmute}
                  style={{
                    padding: '16px 34px',
                    background: 'transparent',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '15px',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,255,255,0.18)',
                    cursor: 'pointer',
                  }}
                >
                  Tap to enable sound
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════
          BROWSER BLOCKED SOUND — minimal unmute overlay
          Only shows if browser forced muted playback.
          Tap anywhere on screen to unmute.
          ═══════════════════════════════════════════════════ */}
      {browserBlocked && muted && !ended && (
        <button
          onClick={handleUnmute}
          className="absolute inset-0 z-20 cursor-pointer"
          style={{ background: 'transparent', border: 'none' }}
          aria-label="Tap to unmute"
        >
          {/* Small unmute icon in top-right corner */}
          <div
            className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
            <span style={{ color: 'white', fontSize: '13px', fontFamily: 'Inter, system-ui, sans-serif' }}>
              Tap to unmute
            </span>
          </div>
        </button>
      )}

      {/* ═══════════════════════════════════════════════════
          BOTTOM CONTROLS — minimal, translucent, over video
          ═══════════════════════════════════════════════════ */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center gap-3 pb-6 pt-16"
        style={{
          background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Progress bar */}
        {!ended && (
          <div className="w-4/5 max-w-lg h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <div
              className="h-full transition-all duration-300 ease-linear"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #FF6A00, #FFB347)',
              }}
            />
          </div>
        )}

        {/* Skip */}
        {!ended && (
          <button
            onClick={handleSkip}
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontSize: '13px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '4px',
            }}
          >
            Skip
          </button>
        )}

        {/* Video ended — Enter AGI-1 */}
        {ended && (
          <div style={{ animation: 'fadeInUp 0.6s ease-out' }}>
            <button
              onClick={proceed}
              style={{
                padding: '16px 56px',
                background: 'linear-gradient(135deg, #FF6A00, #FF8A33)',
                color: 'white',
                fontWeight: 700,
                fontSize: '18px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 0 50px rgba(255,106,0,0.4)',
              }}
            >
              Enter AGI-1
            </button>
          </div>
        )}

        {/* Don't show again */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            style={{ accentColor: '#FF6A00', width: '14px', height: '14px' }}
          />
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px' }}>
            Don&apos;t show again
          </span>
        </label>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
