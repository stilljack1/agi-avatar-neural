'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const WELCOME_VIDEO_SOURCES = ['/video/welcome.mp4', 'https://agi1.org/video/welcome.mp4'];

function TopAuthActions({
  onSignIn,
  onSignUp,
  signInHref = '/register?mode=signin',
  signUpHref = '/register?mode=signup',
}: {
  onSignIn?: () => void;
  onSignUp?: () => void;
  signInHref?: string;
  signUpHref?: string;
}) {
  const sharedClassName =
    'rounded-full px-4 py-2 text-sm transition sm:px-5';

  const sharedGlassStyle = {
    background: 'rgba(0,0,0,0.28)',
    backdropFilter: 'blur(10px)',
  } as const;

  const signInProps = onSignIn
    ? { as: 'button' as const, onClick: onSignIn }
    : { as: 'a' as const, href: signInHref };

  const signUpProps = onSignUp
    ? { as: 'button' as const, onClick: onSignUp }
    : { as: 'a' as const, href: signUpHref };

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

  const handleAuthEntry = useCallback((targetPath: string) => {
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
      <div
        className="fixed inset-0 z-[9999] flex items-end justify-center bg-black px-4 pb-24"
        style={{
          background:
            'radial-gradient(circle at 50% 82%, rgba(255,140,45,0.34), rgba(255,140,45,0.04) 24%, rgba(0,0,0,0) 42%), linear-gradient(180deg, #05070d 0%, #0b1220 48%, #06080f 100%)',
        }}
      >
        <TopAuthActions />
        <div className="w-full max-w-xl rounded-[28px] border border-white/12 bg-black/35 p-6 text-center text-white backdrop-blur-md">
          <p className="text-[11px] uppercase tracking-[0.34em] text-white/55">Welcome to AGI-1</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">The Beginning of a New World</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/62">
            Loading the welcome video and first-screen intro.
          </p>
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
        onSignIn={() => handleAuthEntry('/register?mode=signin')}
        onSignUp={() => handleAuthEntry('/register?mode=signup')}
      />
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(180deg, rgba(3,6,12,0.45) 0%, rgba(3,6,12,0.08) 22%, rgba(3,6,12,0.04) 58%, rgba(3,6,12,0.55) 100%)',
        }}
      />

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
          className="absolute inset-x-0 bottom-28 z-25 flex justify-center px-6 sm:bottom-32"
          style={{
            pointerEvents: 'none',
          }}
        >
          <div
            className="w-full max-w-2xl rounded-[28px] border border-white/10 p-6 text-center"
            style={{
              background: 'rgba(7, 9, 13, 0.72)',
              backdropFilter: 'blur(18px)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            }}
          >
            <p
              style={{
                color: 'rgba(255,255,255,0.62)',
                fontSize: '12px',
                letterSpacing: '0.35em',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              Welcome to AGI-1
            </p>
            <h1
              style={{
                color: 'white',
                fontSize: 'clamp(28px, 4.5vw, 44px)',
                fontWeight: 700,
                lineHeight: 1.05,
                marginBottom: '12px',
              }}
            >
              The Beginning of a New World
            </h1>
            <p
              style={{
                color: 'rgba(255,255,255,0.72)',
                fontSize: '14px',
                lineHeight: 1.55,
                marginBottom: '24px',
              }}
            >
              The welcome intro needs one tap on this device to continue with sound. You can enter AGI-1 directly or start the video with audio now.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ pointerEvents: 'auto' }}>
              <button
                onClick={proceed}
                style={{
                  padding: '14px 28px',
                  background: 'linear-gradient(135deg, #FF6A00, #FF8A33)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '15px',
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
                    padding: '14px 28px',
                    background: 'transparent',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '14px',
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

      {browserBlocked && muted && !ended && (
        <button
          onClick={handleUnmute}
          className="absolute inset-0 z-20 cursor-pointer"
          style={{ background: 'transparent', border: 'none' }}
          aria-label="Tap to unmute"
        >
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

      <div
        className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center gap-3 pb-6 pt-16"
        style={{
          background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
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
