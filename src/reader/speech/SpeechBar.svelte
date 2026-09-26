<script lang="ts">
  import { RATES, type Speaker } from './speaker.svelte';

  let { speaker }: { speaker: Speaker } = $props();
  const ICONS = {
    back: 'M15 18l-6-6 6-6',
    forward: 'M9 18l6-6-6-6',
    play: 'M7 5l12 7-12 7z',
    pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
    close: 'M6 6l12 12M18 6L6 18',
  };
  const phase = $derived(speaker.phase);
  const languageName = (code: string) => new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  const label = (v: SpeechSynthesisVoice) => `${v.name.replace(/^Microsoft\s+/, '').replace(/\s+-\s+.*$/, '')} (${v.lang})`;
</script>

{#snippet icon(d: string)}
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path {d} /></svg>
{/snippet}

{#if phase.kind !== 'idle'}
  <div class="speech-bar" role="toolbar" aria-label="Read aloud" data-testid="speech-bar">
    {#if phase.kind === 'unavailable'}
      <span class="msg">No offline voice is installed. Add one in Windows Settings, Time &amp; language, Speech.</span>
      <button title="Close" aria-label="Close" onclick={() => speaker.stop()}>{@render icon(ICONS.close)}</button>
    {:else if phase.kind === 'picking'}
      <span class="msg">Click a sentence to read from there</span>
      <button class="text" onclick={() => speaker.stop()}>Cancel</button>
    {:else if phase.kind === 'loading'}
      <span class="msg">Preparing…</span>
      <button title="Stop" aria-label="Stop" onclick={() => speaker.stop()}>{@render icon(ICONS.close)}</button>
    {:else}
      <button title="Previous sentence" aria-label="Previous sentence" onclick={() => speaker.step(-1)}>{@render icon(ICONS.back)}</button>
      {#if phase.kind === 'playing'}
        <button title="Pause (l)" aria-label="Pause" data-testid="speech-pause" onclick={() => speaker.pause()}>{@render icon(ICONS.pause)}</button>
      {:else}
        <button title="Resume (l)" aria-label="Resume" data-testid="speech-resume" onclick={() => speaker.resume()}>{@render icon(ICONS.play)}</button>
      {/if}
      <button title="Next sentence" aria-label="Next sentence" onclick={() => speaker.step(1)}>{@render icon(ICONS.forward)}</button>
      <button title="Stop" aria-label="Stop" data-testid="speech-stop" onclick={() => speaker.stop()}>{@render icon(ICONS.close)}</button>
      <span class="sep"></span>
      <select aria-label="Speed" data-testid="speech-rate" value={speaker.rate} onchange={(e) => speaker.setRate(Number(e.currentTarget.value))}>
        {#each RATES as r (r)}<option value={r}>{r}×</option>{/each}
      </select>
      <select aria-label="Voice" data-testid="speech-voice" value={speaker.voice?.voiceURI} onchange={(e) => speaker.setVoice(e.currentTarget.value)}>
        {#each speaker.voices as v (v.voiceURI)}<option value={v.voiceURI}>{label(v)}</option>{/each}
      </select>
      <span class="page muted">p. {phase.at.page}</span>
      {#if speaker.message}<span class="msg warn">{speaker.message}</span>
      {:else if speaker.unvoicedLang}<span class="msg muted" data-testid="speech-no-lang" title="Add a voice in Windows Settings, Time &amp; language, Speech">No offline {languageName(speaker.unvoicedLang)} voice installed</span>{/if}
    {/if}
  </div>
{/if}

<style>
  .speech-bar {
    position: absolute;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    z-index: 35;
    display: flex;
    align-items: center;
    gap: 2px;
    max-width: calc(100% - 24px);
    padding: 4px 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--pop-shadow);
    font-size: 12px;
    white-space: nowrap;
  }
  button { padding: 5px; color: var(--text); }
  button.text { padding: 4px 10px; }
  select { font-size: 12px; padding: 2px 4px; margin-left: 4px; min-width: 0; }
  select[aria-label='Voice'] { max-width: 180px; }
  .sep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
  .msg { padding: 0 8px; white-space: normal; }
  .warn { color: var(--danger); }
  .page { padding: 0 6px; font-variant-numeric: tabular-nums; }
  :global(.speech-hl) { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
  :global(.speech-hl > div) {
    position: absolute;
    margin: -1px;
    padding: 1px;
    border-radius: 2px;
    background: rgb(60 130 255 / 0.22);
    box-shadow: inset 0 -2px 0 rgb(60 130 255 / 0.7);
  }
  :global(.speech-picking .textLayer span) { cursor: pointer; }
</style>
