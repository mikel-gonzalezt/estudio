import { app } from '../lib/app.svelte';
import type { Command } from '../lib/registry';
import { COLOR_IDS, type PageMode } from '../lib/types';
import type { Reader } from './session.svelte';
import { TOOL_IDS, TOOLS } from './tools';
import { exportMarkdownFile, exportPdfFile } from './exports';
import { downloadBackup } from '../lib/backupio';

const focusGoto = () => {
  const el = document.getElementById('goto-page') as HTMLInputElement | null;
  el?.focus();
  el?.select();
};

export interface ReaderUi { openPalette: () => void }

function setPageMode(m: PageMode) {
  app.settings.pageMode = m;
  app.saveSettings();
}

export function toggleWideNotebook(r: Reader) {
  app.settings.wideNotebook = !app.settings.wideNotebook;
  app.saveSettings();
  if (app.settings.wideNotebook) r.study.showRight('notebook');
}

export function popOutNotebook(r: Reader) {
  if (!r.study.popOut()) alert('The browser blocked the notebook window. Allow pop-ups for Estudio and try again.');
}

export function readerCommands(r: Reader, ui: ReaderUi): Command[] {
  const line = () => 60;
  const a = r.ann;
  return [
    ...TOOL_IDS.map((id): Command => ({
      id: `tool.${id}`, title: `Tool: ${TOOLS[id].label}`, group: 'Annotate', keys: [TOOLS[id].key], run: () => a.setTool(id),
    })),
    ...COLOR_IDS.map((c, i): Command => ({
      id: `color.${c}`, title: `Colour: ${c} (${app.settings.meanings[c]})`, group: 'Annotate', keys: [String(i + 1)], run: () => (a.color = c),
    })),
    { id: 'edit.escape', title: 'Close / back to select tool', group: 'Annotate', keys: ['Escape'], run: () => a.escape() },
    { id: 'edit.undo', title: 'Undo', group: 'Annotate', keys: ['Ctrl+Z'], when: () => a.canUndo, run: () => a.undo() },
    { id: 'edit.redo', title: 'Redo', group: 'Annotate', keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], when: () => a.canRedo, run: () => a.redo() },
    { id: 'edit.delete', title: 'Delete selected annotation', group: 'Annotate', keys: ['Delete'], when: () => !!a.selected, run: () => a.selected && a.remove(a.selected) },
    { id: 'study.notebook', title: 'Open notebook', group: 'Study', keys: ['N'], run: () => r.study.showRight('notebook') },
    { id: 'study.cards', title: 'Open flashcards', group: 'Study', keys: ['C'], run: () => r.study.showRight('cards') },
    { id: 'study.widenNotebook', title: 'Widen notebook / restore width', group: 'Study', keys: ['W'], run: () => toggleWideNotebook(r) },
    { id: 'study.popOut', title: 'Open notebook in its own window', group: 'Study', when: () => !r.study.poppedOut, run: () => popOutNotebook(r) },
    { id: 'study.bringBack', title: 'Bring notebook back into the pane', group: 'Study', when: () => r.study.poppedOut, run: () => r.study.bringBack() },
    { id: 'study.togglePane', title: 'Toggle study pane', group: 'Study', keys: ['B'], run: () => (r.study.rightOpen = !r.study.rightOpen) },
    { id: 'study.review', title: 'Review due cards (this document)', group: 'Study', keys: ['R'], when: () => r.study.dueHere > 0, run: () => (r.study.review = 'doc') },
    { id: 'study.reviewAll', title: 'Review due cards (all documents)', group: 'Study', when: () => r.study.dueAll > 0, run: () => (r.study.review = 'all') },
    { id: 'study.newCard', title: 'New flashcard', group: 'Study', run: () => (r.study.draft = { page: r.currentPage, text: '', cloze: false }) },
    { id: 'view.annotations', title: 'Show annotations list', group: 'View', run: () => r.showLeft('annotations') },

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
    { id: 'view.fitText', title: 'Fit text width (crop margins) / previous zoom', group: 'View', keys: ['w'], run: () => void r.toggleTextWidth() },
    { id: 'view.fitPage', title: 'Fit page', group: 'View', keys: ['Ctrl+9'], run: () => void r.fitPage() },
    { id: 'view.sidebar', title: 'Toggle sidebar', group: 'View', keys: ['b'], run: () => (r.leftOpen = !r.leftOpen) },
    { id: 'view.outline', title: 'Show outline', group: 'View', run: () => r.showLeft('outline') },
    { id: 'view.theme', title: 'Toggle light / dark theme', group: 'View', run: () => app.toggleTheme() },

    { id: 'app.palette', title: 'Command palette', group: 'App', keys: ['Ctrl+K'], global: true, run: ui.openPalette },
    { id: 'nav.search', title: 'Find in document', group: 'Navigate', keys: ['/', 'Ctrl+F'], run: () => r.search.show() },
    { id: 'nav.searchNext', title: 'Next search result', group: 'Navigate', keys: ['F3'], when: () => r.search.hits.length > 0, run: () => r.search.next() },
    { id: 'nav.searchPrev', title: 'Previous search result', group: 'Navigate', keys: ['Shift+F3'], when: () => r.search.hits.length > 0, run: () => r.search.prev() },
    { id: 'view.thumbnails', title: 'Show page thumbnails', group: 'View', run: () => r.showLeft('thumbnails') },
    { id: 'view.focus', title: 'Toggle focus mode', group: 'View', keys: ['f'], run: () => (r.focus = !r.focus) },
    { id: 'view.ruler', title: 'Toggle reading ruler', group: 'View', keys: ['r'], run: () => (r.ruler = !r.ruler) },
    { id: 'view.pageNormal', title: 'Page mode: normal', group: 'View', run: () => setPageMode('normal') },
    { id: 'view.pageDark', title: 'Page mode: dark (inverted pages)', group: 'View', run: () => setPageMode('dark') },
    { id: 'view.pageSepia', title: 'Page mode: sepia', group: 'View', run: () => setPageMode('sepia') },
    { id: 'export.markdown', title: 'Export highlights, notes and notebook to Markdown', group: 'Export', run: () => exportMarkdownFile(r) },
    { id: 'export.pdf', title: 'Export annotated PDF', group: 'Export', run: () => void exportPdfFile(r) },
    { id: 'export.backup', title: 'Download full JSON backup', group: 'Export', run: () => void downloadBackup() },
    { id: 'app.library', title: 'Close document (back to library)', group: 'App', run: () => app.close() },
  ];
}
