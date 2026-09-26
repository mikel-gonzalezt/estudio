import { primaryLang } from './text';

export type VoiceLike = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'voiceURI' | 'localService' | 'default'>;

/**
 * Voices that synthesise on this device. Edge also lists "Online (Natural)" voices that send the
 * text to a server; they are never offered, even if a browser marks one local by mistake.
 */
export function offlineVoices<V extends VoiceLike>(all: readonly V[]): V[] {
  return all.filter((v) => v.localService && !/\bonline\b/i.test(v.name));
}

/** The remembered voice for `lang` if still installed, else the default or first voice speaking it, else any voice. */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string | null, remembered?: string): V | null {
  const own = voices.find((v) => v.voiceURI === remembered);
  if (own) return own;
  const speaking = lang ? voices.filter((v) => primaryLang(v.lang) === lang) : [];
  return speaking.find((v) => v.default) ?? speaking[0] ?? voices.find((v) => v.default) ?? voices[0] ?? null;
}

const VOICES_TIMEOUT_MS = 2000;

/**
 * The browser fills its voice list asynchronously, and Edge lists its online voices a moment
 * before the offline ones; waits briefly for `voiceschanged` to bring an offline voice.
 */
export function loadVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const ready = () => offlineVoices(synth.getVoices()).length > 0;
  if (ready()) return Promise.resolve(synth.getVoices());
  return new Promise((done) => {
    const finish = () => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', check);
      done(synth.getVoices());
    };
    const check = () => {
      if (ready()) finish();
    };
    const timer = setTimeout(finish, VOICES_TIMEOUT_MS);
    synth.addEventListener('voiceschanged', check);
  });
}
