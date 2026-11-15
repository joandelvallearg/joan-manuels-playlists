import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioWaveform,
  Languages,
  ListOrdered,
  Music2,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
} from 'lucide-react';
import type { UiStringKey } from '../data/translations';
import type { AudioPlayMode, Track } from '../types';
import { formatAudioTime, getCountryFlagEmoji } from '../utils/musicLogic';

interface YtPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  loadVideoById: (videoId: string) => void;
  cueVideoById: (videoId: string) => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface YtPlayerEvent {
  data: number;
  target: YtPlayerInstance;
}

interface YtNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      height?: string | number;
      width?: string | number;
      host?: string;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YtPlayerInstance }) => void;
        onStateChange?: (event: YtPlayerEvent) => void;
        onError?: () => void;
      };
    }
  ) => YtPlayerInstance;
  PlayerState?: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type AudioPlaybackStatus = 'stopped' | 'playing' | 'paused';

interface AudioDeckPlayerProps {
  t: (key: UiStringKey) => string;
  activeTrack: Track | null;
  queue: Track[];
  playMode: AudioPlayMode;
  playbackStatus: AudioPlaybackStatus;
  onPlayPause: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelectMode: (nextMode: AudioPlayMode) => void;
  onTrackEnded: () => void;
  onSyncExternalPlaybackState: (nextStatus: AudioPlaybackStatus) => void;
  translateTerm: (term: string) => string;
}

export function AudioDeckPlayer({
  t,
  activeTrack,
  queue,
  playMode,
  playbackStatus,
  onPlayPause,
  onStop,
  onPrevious,
  onNext,
  onSelectMode,
  onTrackEnded,
  onSyncExternalPlaybackState,
  translateTerm,
}: AudioDeckPlayerProps) {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YtPlayerInstance | null>(null);
  const ytReadyRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const ytActuallyPlayingRef = useRef(false);
  const hasEverPlayedOnceRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const latestRef = useRef({
    activeTrack,
    playbackStatus,
    onTrackEnded,
    onSyncExternalPlaybackState,
  });

  useEffect(() => {
    latestRef.current = {
      activeTrack,
      playbackStatus,
      onTrackEnded,
      onSyncExternalPlaybackState,
    };
  }, [activeTrack, playbackStatus, onTrackEnded, onSyncExternalPlaybackState]);

  // Preload YouTube IFrame API silently so Play invokes YT synchronously inside user click gesture
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const initPlayer = () => {
      if (cancelled || !playerHostRef.current || ytPlayerRef.current || !window.YT?.Player) return;
      const initialVideoId = latestRef.current.activeTrack?.youtubeId;
      try {
        ytPlayerRef.current = new window.YT.Player(playerHostRef.current, {
          height: '1',
          width: '1',
          host: 'https://www.youtube-nocookie.com',
          videoId: initialVideoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              ytReadyRef.current = true;
              loadedVideoIdRef.current = initialVideoId ?? null;
              const { activeTrack: currTrack, playbackStatus: currStatus } = latestRef.current;
              if (currTrack && currStatus === 'playing') {
                ytActuallyPlayingRef.current = false;
                if (currTrack.youtubeId !== loadedVideoIdRef.current) {
                  loadedVideoIdRef.current = currTrack.youtubeId;
                  event.target.loadVideoById(currTrack.youtubeId);
                } else {
                  event.target.playVideo();
                }
              }
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const state = event.data;
              if (state === 1) {
                ytActuallyPlayingRef.current = true;
                hasEverPlayedOnceRef.current = true;
                consecutiveErrorsRef.current = 0;
                const d = event.target.getDuration?.() ?? 0;
                if (Number.isFinite(d) && d > 0) setDuration(d);
                if (latestRef.current.playbackStatus !== 'playing') {
                  latestRef.current.onSyncExternalPlaybackState('playing');
                }
              } else if (state === 2) {
                if (ytActuallyPlayingRef.current && latestRef.current.playbackStatus === 'playing') {
                  ytActuallyPlayingRef.current = false;
                  latestRef.current.onSyncExternalPlaybackState('paused');
                }
              } else if (state === 0) {
                ytActuallyPlayingRef.current = false;
                setCurrentTime(0);
                latestRef.current.onTrackEnded();
              }
            },
            onError: () => {
              if (cancelled) return;
              ytActuallyPlayingRef.current = false;
              consecutiveErrorsRef.current += 1;
              if (
                hasEverPlayedOnceRef.current &&
                latestRef.current.playbackStatus === 'playing' &&
                consecutiveErrorsRef.current < 2
              ) {
                latestRef.current.onTrackEnded();
              }
            },
          },
        });
      } catch {
        // Ignore if blocked in offline sandbox
      }
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prevCallback?.();
        initPlayer();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.onerror = () => {
          // Safe silent fallback in offline environments
        };
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      ytReadyRef.current = false;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore destroy error
        }
        ytPlayerRef.current = null;
      }
    };
  }, []);

  // Synchronize React track/playback state -> hidden YT audio player
  useEffect(() => {
    const player = ytPlayerRef.current;
    if (!player || !ytReadyRef.current || !activeTrack) return;

    const targetId = activeTrack.youtubeId;
    try {
      if (playbackStatus === 'playing') {
        if (loadedVideoIdRef.current !== targetId) {
          loadedVideoIdRef.current = targetId;
          ytActuallyPlayingRef.current = false;
          setCurrentTime(0);
          setDuration(0);
          player.loadVideoById(targetId);
        } else {
          player.playVideo();
        }
      } else if (playbackStatus === 'paused') {
        ytActuallyPlayingRef.current = false;
        if (loadedVideoIdRef.current !== targetId) {
          loadedVideoIdRef.current = targetId;
          setCurrentTime(0);
          setDuration(0);
          player.cueVideoById(targetId);
        } else {
          player.pauseVideo();
        }
      } else {
        // stopped
        ytActuallyPlayingRef.current = false;
        setCurrentTime(0);
        if (loadedVideoIdRef.current !== targetId) {
          loadedVideoIdRef.current = targetId;
          setDuration(0);
          player.cueVideoById(targetId);
        } else {
          player.stopVideo();
          player.seekTo(0, true);
        }
      }
    } catch {
      // Ignore YT API call failures in offline environments
    }
  }, [activeTrack, playbackStatus]);

  // Reset elapsed counter when track switches while YT player is unavailable or idle
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
  }, [activeTrack?.id]);

  // Poll progress every 500ms only while actively playing
  useEffect(() => {
    if (playbackStatus !== 'playing') return;
    const interval = window.setInterval(() => {
      const player = ytPlayerRef.current;
      if (!player || !ytReadyRef.current) return;
      try {
        const nextTime = player.getCurrentTime?.() ?? 0;
        const nextDuration = player.getDuration?.() ?? 0;
        if (Number.isFinite(nextTime) && nextTime >= 0) setCurrentTime(nextTime);
        if (Number.isFinite(nextDuration) && nextDuration > 0) setDuration(nextDuration);
      } catch {
        // Ignore
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [playbackStatus]);

  const handleSeek = useCallback((nextSeconds: number) => {
    setCurrentTime(nextSeconds);
    const player = ytPlayerRef.current;
    if (player && ytReadyRef.current) {
      try {
        player.seekTo(nextSeconds, true);
      } catch {
        // Ignore
      }
    }
  }, []);

  if (!activeTrack) {
    return null;
  }

  const activeIndex = queue.findIndex((tr) => tr.id === activeTrack.id);
  const nextTrack =
    queue.length > 1
      ? queue[activeIndex >= 0 ? (activeIndex + 1) % queue.length : 0]
      : null;

  const flag = getCountryFlagEmoji(activeTrack.countryCode);
  const progressMax = duration > 0 ? duration : 100;
  const progressValue = duration > 0 ? Math.min(currentTime, duration) : 0;
  const progressPercent = duration > 0 ? Math.min(100, (progressValue / duration) * 100) : 0;

  const modeOptions: Array<{
    id: AudioPlayMode;
    label: string;
    icon: typeof Radio;
  }> = [
    { id: 'ordered', label: t('audioModeOrdered'), icon: ListOrdered },
    { id: 'radio', label: t('audioModeRadio'), icon: Radio },
    { id: 'similar-genre', label: t('audioModeSimilarGenre'), icon: AudioWaveform },
    { id: 'same-language', label: t('audioModeSameLanguage'), icon: Languages },
    { id: 'same-genre', label: t('audioModeSameGenre'), icon: Music2 },
  ];

  return (
    <section
      id="audio-player"
      data-testid="audio-deck"
      data-playback-status={playbackStatus}
      data-play-mode={playMode}
      className="border-b border-zinc-200 bg-white transition-colors dark:border-zinc-800 dark:bg-zinc-950"
    >
      {/* Hidden off-screen YouTube audio engine: never shows video */}
      <div
        aria-hidden="true"
        data-testid="audio-hidden-yt-host"
        className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
      >
        <div ref={playerHostRef} />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-2xl border border-zinc-200 bg-[#F6F7F9] p-5 sm:p-6 transition-colors dark:border-zinc-800 dark:bg-zinc-900/90">
          {/* Quiet Header Meta Line (Zero pills, zero pulsing dots) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <Volume2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>{t('audioOnlyNotice')}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {queue.length} {t('audioQueueCount')}
              </span>
            </div>

            {nextTrack && (
              <p className="text-xs text-zinc-500 truncate max-w-full sm:max-w-md dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{t('audioUpNext')}</span>{' '}
                <span>
                  {nextTrack.title} — {nextTrack.artist}
                </span>
              </p>
            )}
          </div>

          {/* Main Spotify-inspired Console Row */}
          <div className="flex flex-col gap-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            {/* Minimalist Track Info: ONLY title, artist(s), country/countries, and genre */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <h2
                data-testid="audio-deck-title"
                className="font-display text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 truncate dark:text-zinc-50"
              >
                {activeTrack.title}
              </h2>
              <p
                data-testid="audio-deck-artist"
                className="text-sm sm:text-base font-medium text-zinc-700 truncate dark:text-zinc-300"
              >
                {activeTrack.artist}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
                <span data-testid="audio-deck-country" className="font-medium text-zinc-800 dark:text-zinc-200">
                  {flag && <span aria-hidden="true" className="mr-1.5">{flag}</span>}
                  {translateTerm(activeTrack.country)}
                </span>
                <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-600">·</span>
                <span data-testid="audio-deck-genre">
                  {activeTrack.isRemix && (
                    <>
                      <span className="font-semibold text-blue-700 dark:text-blue-400">{t('remixBadge')}</span>
                      <span aria-hidden="true"> · </span>
                    </>
                  )}
                  {translateTerm(activeTrack.genre)}
                </span>
              </div>
            </div>

            {/* Transport Controls + Progress Bar */}
            <div className="flex flex-col items-center gap-3 lg:w-[24rem] shrink-0">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  data-testid="audio-prev"
                  onClick={onPrevious}
                  disabled={queue.length === 0}
                  aria-label={t('previousTrack')}
                  title={t('previousTrack')}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-200/80 hover:text-zinc-950 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  <SkipBack className="h-4 w-4 fill-current" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  data-testid="audio-play-pause"
                  onClick={onPlayPause}
                  aria-label={playbackStatus === 'playing' ? t('audioPause') : t('audioPlay')}
                  title={playbackStatus === 'playing' ? t('audioPause') : t('audioPlay')}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-white shadow-sm hover:scale-[1.04] hover:bg-blue-600 transition-all cursor-pointer dark:bg-white dark:text-zinc-950 dark:hover:bg-blue-500 dark:hover:text-white"
                >
                  {playbackStatus === 'playing' ? (
                    <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
                  ) : (
                    <Play className="h-5 w-5 fill-current translate-x-[1px]" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  data-testid="audio-stop"
                  onClick={onStop}
                  disabled={playbackStatus === 'stopped'}
                  aria-label={t('audioStop')}
                  title={t('audioStop')}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-200/80 hover:text-zinc-950 transition-colors disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  data-testid="audio-next"
                  onClick={onNext}
                  disabled={queue.length === 0}
                  aria-label={t('nextTrack')}
                  title={t('nextTrack')}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-200/80 hover:text-zinc-950 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  <SkipForward className="h-4 w-4 fill-current" aria-hidden="true" />
                </button>
              </div>

              {/* Minimalist Spotify-like Scrubber */}
              <div className="flex w-full items-center gap-2.5">
                <span className="font-mono text-[11px] text-zinc-500 tabular-nums w-9 text-right dark:text-zinc-400">
                  {formatAudioTime(progressValue)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={progressMax}
                  step={1}
                  value={progressValue}
                  disabled={duration <= 0}
                  aria-label="Progreso de reproducción"
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #2563eb ${progressPercent}%, rgba(161, 161, 170, 0.35) ${progressPercent}%)`,
                  }}
                  className="h-1.5 flex-1 appearance-none rounded-full cursor-pointer disabled:cursor-default accent-blue-600"
                />
                <span className="font-mono text-[11px] text-zinc-500 tabular-nums w-9 dark:text-zinc-400">
                  {formatAudioTime(duration)}
                </span>
              </div>
            </div>
          </div>

          {/* Auto-Queue Mode Selector Strip */}
          <div
            role="radiogroup"
            aria-label="Modo de reproducción automática"
            className="flex flex-wrap items-center gap-2 border-t border-zinc-200/80 pt-4 dark:border-zinc-800"
          >
            {modeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = playMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-testid={`audio-mode-${option.id}`}
                  onClick={() => onSelectMode(option.id)}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
