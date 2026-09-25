import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import { POPOUT_ROUTE } from './lib/notebooksync';
import './styles/global.css';

const target = document.getElementById('app')!;
if (POPOUT_ROUTE.test(location.hash)) {
  void import('./reader/notebook/NotebookWindow.svelte').then((m) => mount(m.default, { target }));
} else {
  mount(App, { target });
}
if (import.meta.env.PROD) registerSW({ immediate: true });
