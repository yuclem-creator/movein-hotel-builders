// timer.js — the classroom build clock.
//
// Facilitator-paced rounds were fine for a demo; a room of six teams needs a shared
// clock, or the session ends when the slowest tablet does. The clock never blocks a
// tap: at zero it says so and keeps running the round on the team's command, because a
// facilitator may deliberately allow "one more minute".

const TICK_MS = 250;

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * @param {number} minutes build minutes per round
 * @param {{onTick?:(remaining:number, state:string)=>void, onDone?:()=>void}} handlers
 */
export function createClock(minutes, { onTick, onDone } = {}) {
  let totalMs = minutes * 60000;
  let remaining = totalMs;
  let state = 'idle';
  let endsAt = 0;
  let timer = 0;

  const emit = () => onTick?.(remaining, state);

  const stopTimer = () => { if (timer) { clearInterval(timer); timer = 0; } };

  const tick = () => {
    remaining = Math.max(0, endsAt - Date.now());
    if (remaining === 0) {
      state = 'over';
      stopTimer();
      emit();
      onDone?.();
      return;
    }
    emit();
  };

  const run = () => {
    endsAt = Date.now() + remaining;
    state = 'running';
    stopTimer();
    timer = setInterval(tick, TICK_MS);
    emit();
  };

  return {
    /** Fresh clock for the next round: idle until the build screen asks for it. */
    reset(nextMinutes = minutes) {
      stopTimer();
      minutes = nextMinutes;
      totalMs = minutes * 60000;
      remaining = totalMs;
      state = 'idle';
      emit();
    },
    start() { if (state === 'running') return; run(); },
    pause() {
      if (state !== 'running') return;
      remaining = Math.max(0, endsAt - Date.now());
      state = 'paused';
      stopTimer();
      emit();
    },
    resume() { if (state === 'paused') run(); },
    stop() { stopTimer(); state = 'idle'; emit(); },
    get remaining() { return remaining; },
    get total() { return totalMs; },
    get state() { return state; },
    /** Share of the round still left, 0-1, for the bar. */
    get share() { return totalMs ? remaining / totalMs : 0; },
  };
}
