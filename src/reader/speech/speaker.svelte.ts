import type { Settings } from '../../lib/types';
import type { Reader } from '../session.svelte';
import { Follower, pagePoint, pointAt, type PagePoint } from './follow';
import { detectLanguage, edgeKeys, pageLines, pageSentences, primaryLang, type RawItem, type Sentence } from './text';
import { loadVoices, offlineVoices, pickVoice } from './voices';

export interface Cursor { page: number; index: number; sentence: Sentence }

export type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'picking' }
  | { kind: 'playing' | 'paused'; at: Cursor }
  | { kind: 'unavailable' };

/** Where reading starts: the start of a selection, the top of the current page, or a sentence the reader clicks. */
export type Start = { kind: 'range'; range: Range } | { kind: 'page' } | { kind: 'pick' };

export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/**
 * The settings read aloud keeps, how to persist them, and whom to tell when speech starts (other
 * windows fall silent); handed in so this lazy chunk shares no module with the app shell.
 */
export interface Prefs { settings: Pick<Settings, 'speechRate' | 'speechVoices'>; save: () => void; playing: () => void }

/** Neighbours whose first and last lines reveal running headers and footers (odd and even pages differ). */
const FURNITURE_NEIGHBOURS = [-2, -1, 1, 2];
const WATCHDOG_MS = 1000;
/** The engine went quiet without an `end` event for this long: speak the sentence again. */
const STALL_MS = 3000;
const PREFETCH_WITHIN = 3;

/**
 * Reads the document one sentence per utterance, so Chromium's cut-off of long utterances never
 * applies and pausing is a cancel that resumes at the start of the sentence.
 */
export class Speaker {
  readonly reader: Reader;
  phase = $state.raw<Phase>({ kind: 'idle' });
  voices = $state.raw<SpeechSynthesisVoice[]>([]);
  voice = $state.raw<SpeechSynthesisVoice | null>(null);
  rate: number;
  /** Document language, from metadata or the text; null when neither tells. */
  lang = $state<string | null>(null);
  message = $state('');

  readonly #synth = window.speechSynthesis;
  readonly #follower: Follower;
  readonly #items = new Map<number, Promise<RawItem[]>>();
  readonly #sentences = new Map<number, Promise<Sentence[]>>();
  /** Held so the engine cannot garbage-collect a speaking utterance and drop its `end` event. */
  #utterance: SpeechSynthesisUtterance | null = null;
  #token = 0;
  #quietSince = 0;
  #watchdog: ReturnType<typeof setInterval> | undefined;
  #langReady: Promise<void> | null = null;
  /** Leaves click-to-pick mode; set while it is on. */
  #unpick: (() => void) | null = null;
  readonly #prefs: Prefs;

  constructor(reader: Reader, prefs: Prefs) {
    this.reader = reader;
    this.#prefs = prefs;
    this.rate = $state(prefs.settings.speechRate);
    this.#follower = new Follower(reader);
    document.addEventListener('visibilitychange', this.#onVisible);
    this.#synth.addEventListener('voiceschanged', this.#onVoices);
  }

  get active() {
    return this.phase.kind !== 'idle';
  }

  /** The document's language when no offline voice speaks it. */
  get unvoicedLang(): string | null {
    const lang = this.lang;
    return lang && this.voices.length && !this.voices.some((v) => primaryLang(v.lang) === lang) ? lang : null;
  }

  #pageItems(n: number): Promise<RawItem[]> {
    let p = this.#items.get(n);
    if (!p) {
      p = this.reader.page(n).then((pg) => pg.getTextContent()).then((tc) => tc.items as RawItem[]);
      this.#items.set(n, p);
    }
    return p;
  }

  sentences(n: number): Promise<Sentence[]> {
    let p = this.#sentences.get(n);
    if (!p) {
      const around = FURNITURE_NEIGHBOURS.map((d) => n + d).filter((m) => m >= 1 && m <= this.reader.pageCount);
      p = Promise.all([this.#pageItems(n), ...around.map((m) => this.#pageItems(m))]).then(([own, ...others]) =>
        pageSentences(own!, new Set(others.flatMap((items) => edgeKeys(pageLines(items))))));
      this.#sentences.set(n, p);
    }
    return p;
  }

  async #detectLanguage(page: number): Promise<void> {
    const md = await this.reader.pdf.getMetadata().catch(() => null);
    const info = md?.info as { Language?: unknown } | undefined;
    const dc = md?.metadata?.get('dc:language') as unknown;
    const tagged = primaryLang(info?.Language) ?? primaryLang(Array.isArray(dc) ? dc[0] : dc);
    if (tagged) {
      this.lang = tagged;
      return;
    }
    const pages = [page, page + 1, 1].filter((n, i, all) => n <= this.reader.pageCount && all.indexOf(n) === i);
    const text = (await Promise.all(pages.map((n) => this.sentences(n)))).flat().map((s) => s.text).join(' ');
    this.lang = detectLanguage(text);
  }

  #pickVoices(all: SpeechSynthesisVoice[]) {
    this.voices = offlineVoices(all);
    const kept = this.voices.find((v) => v.voiceURI === this.voice?.voiceURI);
    this.voice = kept ?? pickVoice(this.voices, this.lang, this.#prefs.settings.speechVoices[this.lang ?? '']);
  }

  /** Voices installed or removed while reading show up in the picker. */
  #onVoices = () => {
    if (this.voices.length) this.#pickVoices(this.#synth.getVoices());
  };

  /** Loads voices and the document language; false when there is no offline voice, in which case the next start asks again. */
  async #prepare(page: number): Promise<boolean> {
    this.#langReady ??= this.#detectLanguage(page);
    const [all] = await Promise.all([loadVoices(this.#synth), this.#langReady]);
    this.#pickVoices(all);
    return this.voices.length > 0;
  }

  async start(from: Start) {
    this.#halt();
    this.message = '';
    if (from.kind === 'pick') {
      this.#pick();
      return;
    }
    const point = from.kind === 'range' ? pagePoint(from.range.startContainer, from.range.startOffset) : null;
    const at = point ?? { page: this.reader.currentPage, offset: 0 };
    await this.#startAt(at);
  }

  async #startAt(at: PagePoint) {
    this.#unpick?.();
    const phase = { kind: 'loading' } as const;
    this.phase = phase;
    if (!(await this.#prepare(at.page))) {
      if (this.phase === phase) this.phase = { kind: 'unavailable' };
      return;
    }
    const list = await this.sentences(at.page);
    const index = list.findIndex((s) => s.end > at.offset);
    const cursor = index >= 0 ? { page: at.page, index, sentence: list[index]! } : await this.#neighbour({ page: at.page, index: list.length - 1 }, 1);
    if (this.phase !== phase) return;
    if (!cursor) {
      this.phase = { kind: 'idle' };
      return;
    }
    this.phase = { kind: 'playing', at: cursor };
    this.#prefs.playing();
    this.#speak();
  }

  #pick() {
    const scroller = this.reader.scroller;
    if (!scroller) return;
    this.phase = { kind: 'picking' };
    scroller.classList.add('speech-picking');
    const onClick = (e: MouseEvent) => {
      const point = pointAt(e.clientX, e.clientY, e.target);
      if (!point) return;
      e.preventDefault();
      e.stopPropagation();
      void this.#startAt(point);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.stop();
    };
    scroller.addEventListener('click', onClick, { capture: true });
    window.addEventListener('keydown', onKey);
    this.#unpick = () => {
      scroller.classList.remove('speech-picking');
      scroller.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('keydown', onKey);
      this.#unpick = null;
    };
  }

  async #neighbour(at: { page: number; index: number }, dir: 1 | -1): Promise<Cursor | null> {
    const list = await this.sentences(at.page);
    const i = at.index + dir;
    if (i >= 0 && i < list.length) return { page: at.page, index: i, sentence: list[i]! };
    for (let n = at.page + dir; n >= 1 && n <= this.reader.pageCount; n += dir) {
      const next = await this.sentences(n);
      if (next.length) {
        const index = dir > 0 ? 0 : next.length - 1;
        return { page: n, index, sentence: next[index]! };
      }
    }
    return null;
  }

  #speak() {
    const p = this.phase;
    if (p.kind !== 'playing') return;
    const token = ++this.#token;
    this.#synth.cancel();
    const u = new SpeechSynthesisUtterance(p.at.sentence.text);
    if (this.voice) {
      u.voice = this.voice;
      u.lang = this.voice.lang;
    }
    u.rate = this.rate;
    u.onend = () => {
      if (token === this.#token) void this.#advance(1);
    };
    u.onerror = (e) => {
      if (token !== this.#token || e.error === 'interrupted' || e.error === 'canceled') return;
      this.#token++;
      this.message = `The voice stopped (${e.error}).`;
      if (this.phase.kind === 'playing') this.phase = { kind: 'paused', at: this.phase.at };
    };
    this.#utterance = u;
    this.#quietSince = 0;
    this.#synth.speak(u);
    this.#watch();
    this.#follower.show(p.at.page, p.at.sentence.start, p.at.sentence.end);
    const list = this.#sentences.get(p.at.page);
    void list?.then((l) => {
      if (l.length - p.at.index <= PREFETCH_WITHIN && p.at.page < this.reader.pageCount) void this.sentences(p.at.page + 1);
    });
  }

  async #advance(dir: 1 | -1) {
    const p = this.phase;
    if (p.kind !== 'playing' && p.kind !== 'paused') return;
    const next = await this.#neighbour(p.at, dir);
    if (this.phase !== p) return;
    if (!next) {
      if (dir > 0) this.stop();
      return;
    }
    this.phase = { kind: p.kind, at: next };
    if (p.kind === 'playing') this.#speak();
    else this.#follower.show(next.page, next.sentence.start, next.sentence.end);
  }

  /** Recovers when the engine goes quiet without an `end` event. */
  #watch() {
    if (this.#watchdog) return;
    this.#watchdog = setInterval(() => {
      if (this.phase.kind !== 'playing') {
        clearInterval(this.#watchdog);
        this.#watchdog = undefined;
        return;
      }
      if (document.hidden || this.#synth.speaking || this.#synth.pending) {
        this.#quietSince = 0;
        return;
      }
      this.#quietSince ||= Date.now();
      if (Date.now() - this.#quietSince > STALL_MS) this.#speak();
    }, WATCHDOG_MS);
  }

  #onVisible = () => {
    if (document.hidden || this.phase.kind !== 'playing') return;
    if (this.#synth.paused) this.#synth.resume();
    if (!this.#synth.speaking && !this.#synth.pending) this.#speak();
  };

  step(dir: 1 | -1) {
    this.message = '';
    void this.#advance(dir);
  }

  pause() {
    const p = this.phase;
    if (p.kind !== 'playing') return;
    this.#token++;
    this.#synth.cancel();
    this.phase = { kind: 'paused', at: p.at };
  }

  resume() {
    const p = this.phase;
    if (p.kind !== 'paused') return;
    this.message = '';
    this.phase = { kind: 'playing', at: p.at };
    this.#prefs.playing();
    this.#speak();
  }

  setRate(rate: number) {
    this.rate = rate;
    this.#prefs.settings.speechRate = rate;
    this.#prefs.save();
    if (this.phase.kind === 'playing') this.#speak();
  }

  setVoice(uri: string) {
    const v = this.voices.find((x) => x.voiceURI === uri);
    if (!v) return;
    this.voice = v;
    const s = this.#prefs.settings;
    s.speechVoices = { ...s.speechVoices, [this.lang ?? '']: uri };
    this.#prefs.save();
    if (this.phase.kind === 'playing') this.#speak();
  }

  /** Silences the engine and forgets the position, keeping caches and listeners. */
  #halt() {
    this.#token++;
    this.#unpick?.();
    if (this.phase.kind === 'playing' || this.phase.kind === 'paused') this.#synth.cancel();
    this.#utterance = null;
    this.#follower.clear();
  }

  stop() {
    this.#halt();
    this.message = '';
    this.phase = { kind: 'idle' };
  }

  dispose() {
    this.stop();
    clearInterval(this.#watchdog);
    this.#watchdog = undefined;
    this.#follower.dispose();
    document.removeEventListener('visibilitychange', this.#onVisible);
    this.#synth.removeEventListener('voiceschanged', this.#onVoices);
  }
}
