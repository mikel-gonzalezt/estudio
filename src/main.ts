import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import './styles/global.css';

mount(App, { target: document.getElementById('app')! });
if (import.meta.env.PROD) registerSW({ immediate: true });
