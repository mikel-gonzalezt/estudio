import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import { parsePopoutHash } from './lib/notebooksync';
import { pwa } from './lib/pwa.svelte';
import './styles/global.css';

const target = document.getElementById('app')!;
const popout = parsePopoutHash(location.hash);
if (popout) {
  void import('./reader/notebook/NotebookWindow.svelte').then((m) => mount(m.default, { target, props: { home: popout } }));
} else {
  pwa.listen();
  mount(App, { target });
}
if (import.meta.env.PROD) {
  const updateSW = registerSW({
    immediate: true,
    // Reloading while a document is open would drop the reader back to the library, so the
    // update waits; App applies it once no window shows a document and pending saves are done.
    onNeedRefresh: () => pwa.offerUpdate(() => updateSW(true)),
    // Another window applied the update. A pop-out reloads at once; the app waits for the library.
    onNeedReload: () => (popout ? location.reload() : pwa.needReload()),
  });
}
