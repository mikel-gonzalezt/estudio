import { app } from '../lib/app.svelte';
import type { Command } from '../lib/registry';
import type { Reader } from './session.svelte';

const focusGoto = () => {
  const el = document.getElementById('goto-page') as HTMLInputElement | null;
  el?.focus();
  el?.select();
};

export function readerCommands(r: Reader): Command[] {
  const line = () => 60;
  return [
    { id: 'nav.down', title: 'Scroll down', group: 'Navigate', keys: ['j', 'ArrowDown'], run: () => r.scrollBy(line()) },
    { id: 'nav.up', title: 'Scroll up', group: 'Navigate', keys: ['k', 'ArrowUp'], run: () => r.scrollBy(-line()) },
    { id: 'nav.nextPage', title: 'Next page', group: 'Navigate', keys: ['J', 'PageDown'], run: () => r.pageStep(1) },
    { id: 'nav.prevPage', title: 'Previous page', group: 'Navigate', keys: ['K', 'PageUp'], run: () => r.pageStep(-1) },
    { id: 'nav.first', title: 'First page', group: 'Navigate', keys: ['Home'], run: () => r.jump({ page: 1, y: 0 }) },
    { id: 'nav.last', title: 'Last page', group: 'Navigate', keys: ['End'], run: () => r.jump({ page: r.pageCount, y: 0 }) },
    { id: 'nav.goto', title: 'Go to page…', group: 'Navigate', keys: ['g'], run: focusGoto },
    { id: 'nav.back', title: 'Back (previous position)', group: 'Navigate', keys: ['Alt+ArrowLeft'], when: () => r.back.length > 0, run: () => r.goBack() },
    { id: 'nav.forward', title: 'Forward', group: 'Navigate', keys: ['Alt+ArrowRight'], when: () => r.forward.length > 0, run: () => r.goForward() },

    { id: 'view.zoomIn', title: 'Zoom in', group: 'View', keys: ['Ctrl+=', 'Ctrl++'], run: () => r.zoomStep(1) },
    { id: 'view.zoomOut', title: 'Zoom out', group: 'View', keys: ['Ctrl+-'], run: () => r.zoomStep(-1) },
    { id: 'view.fitWidth', title: 'Fit width', group: 'View', keys: ['Ctrl+0'], run: () => r.fitWidth() },
    { id: 'view.fitPage', title: 'Fit page', group: 'View', keys: ['Ctrl+9'], run: () => void r.fitPage() },
    { id: 'view.sidebar', title: 'Toggle sidebar', group: 'View', keys: ['b'], run: () => (r.leftOpen = !r.leftOpen) },
    { id: 'view.outline', title: 'Show outline', group: 'View', run: () => r.showLeft('outline') },
    { id: 'view.theme', title: 'Toggle light / dark theme', group: 'View', run: () => app.toggleTheme() },

    { id: 'app.library', title: 'Close document (back to library)', group: 'App', run: () => app.close() },
  ];
}
