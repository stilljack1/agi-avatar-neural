'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const WELCOME_VIDEO_SOURCES = ['/video/welcome.mp4', 'https://agi1.org/video/welcome.mp4'];
const WELCOME_POSTER = '/images/agi-hero.png';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function TopActions({
  onSignIn,
  onSignUp,
  onInstall,
  isInstalledApp,
}: {
  onSignIn: () => void;
  onSignUp: () => void;
  onInstall: () => void;
  isInstalledApp: boolean;
}) {
  const pillClass =
    'rounded-full px-4 py-2 text-sm font-medium transition sm:px-5';
  const glass = {
    background: 'rgba(5, 10, 18, 0.44)',
    backdropFilter: 'blur(14px)',
  } as const;

  return (
    <div className="absolute inset-x-0 top-0 z-40 flex items-center justify-between px-4 pt-4 sm:px-6 sm:pt-6">
      <div
        className="rounded-full border border-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/75"
        style={glass}
      >
        AGI-1
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onSignIn}
          className={`${pillClass} border border-white/15 text-white hover:border-white/30 hover:bg-white/10`}
          style={glass}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={onSignUp}
          className={`${pillClass} text-white hover:opacity-90`}
          style={{
            background: 'linear-gradient(135deg, #FF6A00, #FF8A33)',
            boxShadow: '0 0 32px rgba(255,106,0,0.24)',
          }}
        >
          Sign Up
        </button>

        {/* Only show Download/Install on website — hide when user is already in the installed app */}
        {!isInstalledApp && (
          <button
            type="button"
            onClick={onInstall}
            className={`${pillClass} flex items-center gap-2 border border-[#7db9ff]/28 text-white hover:border-[#7db9ff]/55 hover:bg-[#0d4ea6]/18`}
            style={glass}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          AGI-1 App
        </button>
        )}
      </div>
    </div>
  );
}

function InstallDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-[rgba(8,12,18,0.9)] p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <p className="text-[11px] uppercase tracking-[0.34em] text-white/55">AGI-1 App</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Install is not enabled in this browser yet</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          The live web experience is available now. Native-style install depends on browser support and install metadata that are not active on this device yet.
        </p>
        <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/55">
          Continue with Sign Up or Sign In to enter AGI-1 immediately on the web.
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WelcomeClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoplayAttemptedRef = useRef(false);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const [muted, setMuted] = useState(false);
  const [browserBlocked, setBrowserBlocked] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [ended, setEnded] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [showFallbackOverlay, setShowFallbackOverlay] = useState(false);
  const [videoSrcIndex, setVideoSrcIndex] = useState(0);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [isInstalledApp, setIsInstalledApp] = useState(false);

  // Detect if running as installed PWA (standalone) — hide download button in app
  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsInstalledApp(isStandalone);
  }, []);

  const completeWelcome = useCallback((targetPath = '/') => {
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
    }, 500);
  }, [dontShowAgain]);

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

  useEffect(() => {
    if (autoplayAttemptedRef.current) return;
    autoplayAttemptedRef.current = true;
    void attemptPlayback();
  }, [attemptPlayback]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const vid = videoRef.current;
      const stalled = !vid || vid.readyState < 2 || vid.currentTime < 0.05;
      if (stalled) {
        setShowFallbackOverlay(true);
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as BeforeInstallPromptEvent;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleUnmute = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = false;
    setMuted(false);
    setBrowserBlocked(false);
    setVideoFailed(false);
    setShowFallbackOverlay(false);
    if (vid.paused) {
      void vid.play().catch(() => {});
    }
  }, []);

  const handleAuthEntry = useCallback((targetPath: string) => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    completeWelcome(targetPath);
  }, [completeWelcome]);

  const handleInstall = useCallback(async () => {
    const deferredPrompt = installPromptRef.current;
    if (!deferredPrompt) {
      setInstallDialogOpen(true);
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => undefined);
    installPromptRef.current = null;
  }, []);

  const handleSkip = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    completeWelcome('/register?mode=signup');
  }, [completeWelcome]);

  const handleVideoEnd = useCallback(() => {
    setEnded(true);
    setTimeout(() => completeWelcome('/register?mode=signup'), 1400);
  }, [completeWelcome]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.currentTime > 0.05) {
        setShowFallbackOverlay(false);
      }
      const currentProgress =
        (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(Number.isNaN(currentProgress) ? 0 : currentProgress);
    }
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black transition-opacity duration-700 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${WELCOME_POSTER}')` }}
      />

      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
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

      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(180deg, rgba(3,6,12,0.35) 0%, rgba(3,6,12,0.05) 22%, rgba(3,6,12,0.04) 64%, rgba(3,6,12,0.58) 100%)',
        }}
      />

      <TopActions
        onSignIn={() => handleAuthEntry('/register?mode=signin')}
        onSignUp={() => handleAuthEntry('/register?mode=signup')}
        onInstall={() => void handleInstall()}
        isInstalledApp={isInstalledApp}
      />

      {(showFallbackOverlay || videoFailed) && !ended ? (
        <div className="absolute inset-x-0 bottom-28 z-30 flex justify-center px-6 sm:bottom-32">
          <div
            className="w-full max-w-2xl rounded-[28px] border border-white/10 p-6 text-center text-white"
            style={{
              background: 'rgba(7, 9, 13, 0.72)',
              backdropFilter: 'blur(18px)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            }}
          >
            <p className="text-[12px] uppercase tracking-[0.34em] text-white/58">Welcome to AGI-1</p>
            <h1 className="mt-3 text-[clamp(28px,4.4vw,44px)] font-semibold tracking-[-0.04em]">
              The Beginning of a New World
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/68">
              This browser needs one interaction to continue with sound. You can enable audio now or continue directly into AGI-1.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => completeWelcome('/register?mode=signup')}
                className="rounded-full bg-[linear-gradient(135deg,#FF6A00,#FF8A33)] px-7 py-3 text-sm font-semibold text-white shadow-[0_0_40px_rgba(255,106,0,0.22)]"
              >
                Enter AGI-1
              </button>
              {browserBlocked ? (
                <button
                  type="button"
                  onClick={handleUnmute}
                  className="rounded-full border border-white/18 px-7 py-3 text-sm font-medium text-white"
                >
                  Tap to enable sound
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {browserBlocked && muted && !ended ? (
        <button
          type="button"
          onClick={handleUnmute}
          className="absolute inset-0 z-20 cursor-pointer border-none bg-transparent"
          aria-label="Tap to unmute"
        >
          <div
            className="absolute right-6 top-6 flex items-center gap-2 rounded-full px-4 py-2"
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
            <span className="text-[13px] text-white">Tap to unmute</span>
          </div>
        </button>
      ) : null}

      <div
        className="absolute bottom-0 left-0 right-0 z-40 flex flex-col items-center gap-3 pb-6 pt-16"
        style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.62))' }}
      >
        {!ended ? (
          <div className="h-[3px] w-4/5 max-w-lg overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full transition-all duration-300 ease-linear"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #FF6A00, #FFB347)',
              }}
            />
          </div>
        ) : null}

        {!ended ? (
          <button
            type="button"
            onClick={handleSkip}
            className="text-[13px] text-white/40 underline underline-offset-4"
          >
            Skip
          </button>
        ) : null}

        {ended ? (
          <button
            type="button"
            onClick={() => completeWelcome('/register?mode=signup')}
            className="rounded-full bg-[linear-gradient(135deg,#FF6A00,#FF8A33)] px-12 py-4 text-[17px] font-semibold text-white shadow-[0_0_50px_rgba(255,106,0,0.3)]"
          >
            Enter AGI-1
          </button>
        ) : null}

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            style={{ accentColor: '#FF6A00', width: '14px', height: '14px' }}
          />
          <span className="text-[12px] text-white/35">Don&apos;t show again</span>
        </label>
      </div>

      <InstallDialog
        open={installDialogOpen}
        onClose={() => setInstallDialogOpen(false)}
      />
    </div>
  );
}
