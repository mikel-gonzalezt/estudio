<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { formatClock, initial, pause, remaining, reset, start, tick, type Pomodoro } from '../lib/pomodoro';
  import Icon from './Icon.svelte';

  const durations = $derived({ workMs: app.settings.pomodoroWorkMin * 60_000, breakMs: app.settings.pomodoroBreakMin * 60_000 });
  let p = $state.raw<Pomodoro>(initial(untrack(() => durations)));
  let now = $state(Date.now());
  let flash = $state(false);

  $effect(() => {
    const id = setInterval(() => {
      now = Date.now();
      const next = tick(p, now, durations);
      if (next !== p) {
        chime(next.phase);
        p = next;
      }
    }, 500);
    return () => clearInterval(id);
  });

  function chime(phase: 'work' | 'break') {
    flash = true;
    setTimeout(() => (flash = false), 4000);
    const text = phase === 'break' ? 'Time for a short break.' : 'Break over. Ready for the next block?';
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Estudio', { body: text, silent: false });
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = phase === 'break' ? 660 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.85);
    } catch {
      // Audio is a nicety; the visual flash is enough.
    }
  }

  function toggle() {
    if (p.endsAt === null) {
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
      p = start(p, Date.now());
    } else p = pause(p, Date.now());
  }

  const running = $derived(p.endsAt !== null);
</script>

<div class="pomo" class:break={p.phase === 'break'} class:flash title="Pomodoro: {p.completed} completed" data-testid="pomodoro">
  <span class="phase">{p.phase === 'work' ? 'Focus' : 'Break'}</span>
  <span class="clock">{formatClock(remaining(p, now))}</span>
  <button onclick={toggle} aria-label={running ? 'Pause pomodoro' : 'Start pomodoro'}><Icon name={running ? 'pause' : 'play'} size={13} /></button>
  <button onclick={() => (p = reset(p, durations))} aria-label="Reset pomodoro"><Icon name="reset" size={13} /></button>
</div>

<style>
  .pomo { display: inline-flex; align-items: center; gap: 4px; padding: 0 4px 0 8px; border-radius: 10px; font-variant-numeric: tabular-nums; }
  .phase { font-size: 11px; color: var(--muted); }
  .clock { min-width: 36px; font-weight: 600; }
  .break .clock { color: var(--accent); }
  .flash { background: var(--accent-soft); }
  button { padding: 1px 3px; }
</style>
