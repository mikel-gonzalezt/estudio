import type { Component } from 'svelte';
import { app } from '../../lib/app.svelte';
import { windows } from '../../lib/windows';
import type { Command } from '../../lib/registry';
import type { Reader } from '../session.svelte';
import { TOOLS } from '../tools';
import type { Speaker, Start } from './speaker.svelte';

interface Loaded { speaker: Speaker; Bar: Component<{ speaker: Speaker }> }

/** The selection inside the page view, copied now because loading the player is asynchronous. */
function selectedRange(reader: Reader): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  return reader.scroller?.contains(range.startContainer) ? range.cloneRange() : null;
}

/** The part of read aloud that is always loaded: entry points call it, and it fetches the player on first use. */
class ReadAloud {
  loaded = $state.raw<Loaded | null>(null);
  #loading: Promise<Loaded> | null = null;
  #generation = 0;

  get active() {
    return !!this.loaded?.speaker.active;
  }

  #load(reader: Reader): Promise<Loaded> {
    if (this.loaded?.speaker.reader === reader) return Promise.resolve(this.loaded);
    const gen = this.#generation;
    this.#loading ??= import('./index').then((m) => {
      const prefs = { settings: app.settings, save: () => app.saveSettings(), playing: () => windows.post({ t: 'speaking' }) };
      const l = { speaker: new m.Speaker(reader, prefs), Bar: m.SpeechBar };
      if (gen === this.#generation) this.loaded = l;
      else l.speaker.dispose();
      return l;
    });
    return this.#loading;
  }

  start(reader: Reader, how: 'here' | 'pick') {
    const range = how === 'here' ? selectedRange(reader) : null;
    if (how === 'pick' && TOOLS[reader.ann.tool].captures) reader.ann.setTool('select');
    const from: Start = how === 'pick' ? { kind: 'pick' } : range ? { kind: 'range', range } : { kind: 'page' };
    void this.#load(reader).then((l) => {
      if (this.loaded === l) void l.speaker.start(from);
    });
  }

  /** Starts reading, or pauses and resumes once it has started. */
  toggle(reader: Reader) {
    const s = this.loaded?.speaker;
    if (s?.phase.kind === 'playing') s.pause();
    else if (s?.phase.kind === 'paused') s.resume();
    else this.start(reader, 'here');
  }

  stop() {
    this.loaded?.speaker.stop();
  }

  /** Silences and forgets the player; the document is closing or the feature was switched off. */
  close() {
    this.#generation++;
    this.loaded?.speaker.dispose();
    this.loaded = null;
    this.#loading = null;
  }
}

export const readAloud = new ReadAloud();

windows.on((m) => {
  if (m.t === 'speaking') readAloud.stop();
});

function setEnabled(on: boolean) {
  app.settings.readAloud = on;
  app.saveSettings();
  if (!on) readAloud.close();
}

export function speechCommands(r: Reader): Command[] {
  const on = () => app.settings.readAloud;
  return [
    { id: 'speech.toggle', title: 'Read aloud / pause', group: 'Read aloud', keys: ['l'], when: on, run: () => readAloud.toggle(r) },
    { id: 'speech.pick', title: 'Read aloud from a sentence I click', group: 'Read aloud', when: on, run: () => readAloud.start(r, 'pick') },
    { id: 'speech.stop', title: 'Stop reading aloud', group: 'Read aloud', when: () => readAloud.active, run: () => readAloud.stop() },
    { id: 'speech.off', title: 'Turn off read aloud (hide its buttons)', group: 'Read aloud', when: on, run: () => setEnabled(false) },
    { id: 'speech.on', title: 'Turn on read aloud', group: 'Read aloud', when: () => !on(), run: () => setEnabled(true) },
  ];
}
