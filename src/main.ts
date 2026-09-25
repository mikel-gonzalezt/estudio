import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import { pwa } from './lib/pwa.svelte';
import './styles/global.css';

pwa.listen();
mount(App, { target: document.getElementById('app')! });
if (import.meta.env.PROD) {
  const updateSW = registerSW({
    immediate: true,
    // Reloading while a document is open would drop the reader back to the library, so the
    // update waits; App applies it once the library is showing and pending saves are done.
    onNeedRefresh: () => pwa.offerUpdate(() => updateSW(true)),
  });
}
