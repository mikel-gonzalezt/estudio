import type katexType from 'katex';

let loading: Promise<typeof katexType> | undefined;

/** KaTeX and its stylesheet, fetched the first time a formula is shown. */
export function loadKatex(): Promise<typeof katexType> {
  loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default);
  return loading;
}

const reason = (k: typeof katexType, e: unknown) => (e instanceof k.ParseError ? e.rawMessage : String(e));

/** What KaTeX objects to in `latex`, or null when it typesets. */
export function mathError(k: typeof katexType, latex: string, display: boolean): string | null {
  try {
    k.renderToString(latex, { displayMode: display, throwOnError: true, output: 'html' });
    return null;
  } catch (e) {
    return reason(k, e);
  }
}

/**
 * Renders `latex` into `el`. Until KaTeX has loaded the source shows as text; when the LaTeX is
 * invalid it stays as text, marked `math-error`, with KaTeX's message as its tooltip.
 */
export function renderMath(el: HTMLElement, latex: string, display: boolean): Promise<void> {
  el.textContent = latex;
  return loadKatex().then((k) => {
    try {
      k.render(latex, el, { displayMode: display, throwOnError: true, output: 'html' });
    } catch (e) {
      el.textContent = latex;
      el.classList.add('math-error');
      el.setAttribute('aria-invalid', 'true');
      el.title = `Formula error: ${reason(k, e)}`;
    }
  }, () => undefined);
}
