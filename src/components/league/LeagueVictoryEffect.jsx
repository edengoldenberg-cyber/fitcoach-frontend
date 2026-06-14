import React, { useEffect, useRef, useState } from 'react';

/**
 * Lightweight victory celebration.
 * Trigger by passing a `trigger` prop that changes (e.g. achievement key, rank number).
 * Shows confetti burst + glow pulse for 3 seconds.
 */
let confettiLoaded = false;
let confettiFn = null;

async function getConfetti() {
  if (confettiFn) return confettiFn;
  try {
    const mod = await import('canvas-confetti');
    confettiFn = mod.default;
    return confettiFn;
  } catch {
    return null;
  }
}

export function useVictoryEffect() {
  const [showGlow, setShowGlow] = useState(false);
  const [message, setMessage] = useState('');
  const prevTrigger = useRef(null);

  const fire = async (triggerKey, msg) => {
    if (!triggerKey || triggerKey === prevTrigger.current) return;
    prevTrigger.current = triggerKey;
    setMessage(msg || '');
    setShowGlow(true);

    // Vibrate
    try { navigator.vibrate?.(200); } catch {}

    // Confetti
    const confetti = await getConfetti();
    if (confetti) {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 }, colors: ['#FFD700', '#79DBD6', '#a855f7'] });
    }

    setTimeout(() => setShowGlow(false), 3000);
  };

  return { showGlow, message, fire };
}

export default function LeagueVictoryOverlay({ showGlow, message }) {
  if (!showGlow) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div className="animate-ping absolute inset-0 bg-yellow-400/5 rounded-full" />
      {message && (
        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-black text-lg px-8 py-4 rounded-2xl shadow-2xl animate-bounce border-2 border-yellow-300">
          {message}
        </div>
      )}
    </div>
  );
}