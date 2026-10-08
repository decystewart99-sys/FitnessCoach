// Rest timer shown at the bottom of the workout screen. Beeps when time's up (while the app
// is open – iPhone pauses web apps in the background, so keep the screen on).

import { useEffect, useRef, useState } from 'react';

let audio: AudioContext | undefined;

/** Must be called from a tap so iPhone allows sound later. */
export function primeAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* no audio */
  }
}

function beep() {
  if (!audio) return;
  const t = audio.currentTime;
  for (const [offset, freq] of [
    [0, 880],
    [0.25, 880],
    [0.5, 1320],
  ]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, t + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.2);
  }
  navigator.vibrate?.([200, 100, 200]);
}

export default function RestTimer({ endAt, onChange }: { endAt: number | undefined; onChange: (endAt: number | undefined) => void }) {
  const [now, setNow] = useState(Date.now());
  const beeped = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!endAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endAt]);

  useEffect(() => {
    if (endAt && now >= endAt && beeped.current !== endAt) {
      beeped.current = endAt;
      beep();
    }
  }, [now, endAt]);

  if (!endAt) return null;
  const left = Math.round((endAt - now) / 1000);
  const over = left <= 0;
  const abs = Math.abs(left);
  const mmss = `${over ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;

  return (
    <div className={`rest-timer ${over ? 'over' : ''}`} role="timer" aria-live="off">
      <div>
        <div className="small">{over ? 'Rest done – next set' : 'Rest'}</div>
        <div className="rest-time">{mmss}</div>
      </div>
      <div className="row">
        <button className="btn small" onClick={() => onChange(endAt - 15_000)}>
          −15s
        </button>
        <button className="btn small" onClick={() => onChange(endAt + 15_000)}>
          +15s
        </button>
        <button className="btn small" onClick={() => onChange(undefined)}>
          {over ? 'Close' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
