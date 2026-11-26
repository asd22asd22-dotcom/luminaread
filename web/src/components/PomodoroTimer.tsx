import React, { useEffect, useRef, useState } from 'react';
import { Timer, Play, Pause, RotateCcw, Coffee, Flame } from 'lucide-react';

interface Props {
  onNotify: (msg: string) => void;
}

function playSoftChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.14);
      gain.gain.setValueAtTime(0.001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.14 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.7);
    });
  } catch {
    // Ignore audio context restriction
  }
}

export const PomodoroTimer: React.FC<Props> = ({ onNotify }) => {
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [openPopover, setOpenPopover] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setRunning(false);
          playSoftChime();
          const nextMode = mode === 'focus' ? 'break' : 'focus';
          onNotify(
            mode === 'focus'
              ? '番茄钟专注完成！休息 5 分钟保护视力与记忆吸收吧'
              : '休息结束，准备开始下一轮考研精读！'
          );
          setMode(nextMode);
          return nextMode === 'focus' ? 25 * 60 : 5 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [running, mode, onNotify]);

  useEffect(() => {
    if (!openPopover) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpenPopover(false);
      }
    };
    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, [openPopover]);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  const switchMode = (next: 'focus' | 'break') => {
    setRunning(false);
    setMode(next);
    setSecondsLeft(next === 'focus' ? 25 * 60 : 5 * 60);
  };

  return (
    <div ref={boxRef} className="relative app-no-drag">
      <button
        onClick={() => setOpenPopover((v) => !v)}
        className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border transition cursor-pointer ${
          running
            ? mode === 'focus'
              ? 'bg-cyan-500/20 border-cyan-400/45 text-cyan-200'
              : 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
            : 'glass-soft text-[var(--text-secondary)] hover:bg-white/10'
        }`}
        title="考研番茄专注钟"
      >
        <Timer className={`w-3.5 h-3.5 ${running ? 'animate-pulse text-cyan-300' : ''}`} />
        <span className="font-mono tabular-nums">
          {mins}:{secs}
        </span>
      </button>

      {openPopover && (
        <div className="absolute right-0 mt-2 w-64 glass-elevated iridescent-border rounded-2xl p-3.5 space-y-3 z-50">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold flex items-center gap-1.5">
              {mode === 'focus' ? (
                <>
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  专注精读 (25分)
                </>
              ) : (
                <>
                  <Coffee className="w-3.5 h-3.5 text-emerald-400" />
                  科学小憩 (5分)
                </>
              )}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => switchMode('focus')}
                className={`px-2 py-0.5 rounded-lg text-[11px] cursor-pointer ${
                  mode === 'focus' ? 'bg-cyan-500/25 text-cyan-200' : 'text-[var(--text-muted)]'
                }`}
              >
                专注
              </button>
              <button
                onClick={() => switchMode('break')}
                className={`px-2 py-0.5 rounded-lg text-[11px] cursor-pointer ${
                  mode === 'break' ? 'bg-emerald-500/25 text-emerald-200' : 'text-[var(--text-muted)]'
                }`}
              >
                休息
              </button>
            </div>
          </div>

          <div className="text-center font-mono text-3xl font-bold tracking-wider py-1">
            {mins}:{secs}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setRunning((r) => !r)}
              className="flex-1 liquid-btn-primary rounded-xl py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {running ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  暂停
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  开始专注
                </>
              )}
            </button>
            <button
              onClick={() => {
                setRunning(false);
                setSecondsLeft(mode === 'focus' ? 25 * 60 : 5 * 60);
              }}
              className="p-1.5 rounded-xl glass-soft hover:bg-white/15 text-[var(--text-secondary)] cursor-pointer"
              title="重置计时"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
