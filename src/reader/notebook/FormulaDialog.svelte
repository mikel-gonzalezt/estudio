<script lang="ts">
  import type { MathfieldElement } from 'mathlive';
  import { formula } from './formula.svelte';

  let host: HTMLDivElement | undefined = $state();
  let latex = $state('');
  let display = $state(false);
  let failed = $state('');
  let field: MathfieldElement | null = null;

  /** MathLive is heavy: it is fetched the first time the editor opens, with its fonts served from `/mathlive/`. */
  async function loadField(): Promise<typeof MathfieldElement> {
    const { MathfieldElement } = await import('mathlive');
    MathfieldElement.fontsDirectory = new URL('mathlive/fonts/', document.baseURI).href;
    MathfieldElement.soundsDirectory = null;
    return MathfieldElement;
  }

  $effect(() => {
    const req = formula.request;
    if (!req || !host) return;
    latex = req.init.latex;
    display = req.init.display;
    failed = '';
    let dead = false;
    const box = host;
    void loadField().then((MF) => {
      if (dead) return;
      const mf = new MF();
      mf.mathVirtualKeyboardPolicy = 'manual';
      mf.value = latex;
      mf.addEventListener('input', () => (latex = mf.value));
      mf.addEventListener('focusin', () => window.mathVirtualKeyboard.show());
      mf.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          done();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });
      box.replaceChildren(mf);
      field = mf;
      mf.focus();
      window.mathVirtualKeyboard.show();
    }, (e: unknown) => (failed = String(e)));
    return () => {
      dead = true;
      field = null;
      window.mathVirtualKeyboard?.hide();
    };
  });

  function typed(v: string) {
    latex = v;
    if (field && field.value !== v) field.value = v;
  }

  function done() {
    formula.close({ latex, display });
  }

  function cancel() {
    formula.close(null);
  }
</script>

{#if formula.request}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Formula" data-testid="formula-dialog">
      <strong>Formula</strong>
      <p class="muted">Type with the keyboard below, or in LaTeX if you know it.</p>
      <div class="field" bind:this={host}>{#if failed}<p class="error">Could not load the formula editor: {failed}</p>{/if}</div>
      <label class="latex">LaTeX
        <input type="text" value={latex} oninput={(e) => typed(e.currentTarget.value)} spellcheck="false" data-testid="formula-latex"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') cancel(); }} />
      </label>
      <label class="own"><input type="checkbox" bind:checked={display} data-testid="formula-display" /> On its own line</label>
      <div class="row">
        <button class="btn" onclick={cancel}>Cancel</button>
        <button class="btn primary" onclick={done} disabled={!latex.trim()} data-testid="formula-done">Done</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 900; display: grid; place-items: start center; padding-top: 10vh; background: rgb(0 0 0 / 0.25); }
  .dialog { width: min(560px, calc(100vw - 24px)); display: grid; gap: 8px; padding: 14px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--pop-shadow); font-size: 13px; }
  p { margin: 0; }
  .field { min-height: 48px; border: 1px solid var(--border); border-radius: 6px; padding: 4px 6px; font-size: 20px; }
  .field :global(math-field) { width: 100%; font-size: 22px; outline: none; }
  .latex { display: grid; gap: 3px; font-size: 12px; color: var(--muted); }
  .latex input { font: 13px var(--mono); }
  .own { display: flex; align-items: center; gap: 6px; }
  .row { display: flex; justify-content: flex-end; gap: 6px; }
  .error { color: var(--danger); font-size: 12px; }
</style>
