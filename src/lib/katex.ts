import type katexType from 'katex';

let loading: Promise<typeof katexType> | undefined;

/** KaTeX and its stylesheet, fetched the first time a formula is shown. */
export function loadKatex(): Promise<typeof katexType> {
  loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default);
  return loading;
}

/** Renders `latex` into `el`; until KaTeX has loaded, and when the LaTeX is invalid, the source shows as text. */
export function renderMath(el: HTMLElement, latex: string, display: boolean): Promise<void> {
  el.textContent = latex;
  return loadKatex().then((k) => {
    try {
      k.render(latex, el, { displayMode: display, throwOnError: true, output: 'html' });
      el.classList.remove('math-error');
    } catch {
      el.textContent = latex;
      el.classList.add('math-error');
    }
  }, () => undefined);
}
