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

const VOICES_TIMEOUT_MS = 1500;

/** The browser fills its voice list asynchronously; waits briefly for `voiceschanged`. */
export function loadVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((done) => {
    const finish = () => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', finish);
      done(synth.getVoices());
    };
    const timer = setTimeout(finish, VOICES_TIMEOUT_MS);
    synth.addEventListener('voiceschanged', finish);
  });
}
