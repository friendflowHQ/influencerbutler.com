"use client";

// Pure-CSS confetti: ~60 absolutely-positioned pieces falling with one
// keyframe animation, auto-unmounting after ~3s. No canvas, no library.

import { useEffect, useMemo } from "react";

const COLORS = ["#10b981", "#f59e0b", "#6366f1", "#f43f5e", "#0ea5e9", "#8b5cf6"];
const PIECES = 60;

type Piece = {
  left: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  drift: number;
  spin: number;
  round: boolean;
};

/** Deterministic 0..1 "random" so render stays pure (react-hooks/purity). */
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export default function Confetti({ onDone }: { onDone?: () => void }) {
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: jitter(i + 1) * 100,
        delay: jitter(i + 101) * 0.6,
        duration: 2 + jitter(i + 201) * 1.2,
        size: 6 + jitter(i + 301) * 7,
        color: COLORS[i % COLORS.length],
        drift: (jitter(i + 401) - 0.5) * 200,
        spin: 360 + jitter(i + 501) * 720,
        round: jitter(i + 601) < 0.3,
      })),
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 3400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      <style>{`
        @keyframes growth-confetti-fall {
          0% { transform: translate3d(0, -12vh, 0) rotate(0deg); opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translate3d(var(--drift), 110vh, 0) rotate(var(--spin)); opacity: 0; }
        }
      `}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              position: "absolute",
              top: 0,
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.round ? p.size : p.size * 0.45}px`,
              backgroundColor: p.color,
              borderRadius: p.round ? "9999px" : "2px",
              animation: `growth-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
