import { describe, expect, it } from 'vitest';
import { offlineVoices, pickVoice, type VoiceLike } from './voices';

const voice = (name: string, lang: string, localService = true, isDefault = false): VoiceLike =>
  ({ name, lang, voiceURI: name, localService, default: isDefault });

const EDGE = [
  voice('Microsoft Helena - Spanish (Spain)', 'es-ES'),
  voice('Microsoft Laura - Spanish (Spain)', 'es-ES'),
  voice('Microsoft Pablo - Spanish (Spain)', 'es-ES', true, true),
  voice('Microsoft Zira - English (United States)', 'en-US'),
  voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false),
  voice('Microsoft Elvira Online (Natural) - Spanish (Spain)', 'es-ES', false),
];

describe('offlineVoices', () => {
  it('keeps only voices that run on the device', () => {
    expect(offlineVoices(EDGE).map((v) => v.name)).toEqual([
      'Microsoft Helena - Spanish (Spain)', 'Microsoft Laura - Spanish (Spain)', 'Microsoft Pablo - Spanish (Spain)', 'Microsoft Zira - English (United States)',
    ]);
  });

  it('drops a voice named Online even when it claims to be local', () => {
    expect(offlineVoices([voice('Microsoft Jenny Online (Natural)', 'en-US', true)])).toEqual([]);
  });
});

describe('pickVoice', () => {
  const local = offlineVoices(EDGE);

  it('matches the document language', () => {
    expect(pickVoice(local, 'en')?.name).toBe('Microsoft Zira - English (United States)');
  });

  it('prefers the default voice among those speaking the language', () => {
    expect(pickVoice(local, 'es')?.name).toBe('Microsoft Pablo - Spanish (Spain)');
  });

  it('uses the remembered voice while it is installed', () => {
    expect(pickVoice(local, 'es', 'Microsoft Laura - Spanish (Spain)')?.name).toBe('Microsoft Laura - Spanish (Spain)');
    expect(pickVoice(local, 'es', 'Gone')?.name).toBe('Microsoft Pablo - Spanish (Spain)');
  });

  it('falls back to any offline voice, and to none', () => {
    expect(pickVoice(local, 'fr')?.name).toBe('Microsoft Pablo - Spanish (Spain)');
    expect(pickVoice([], 'en')).toBeNull();
  });
});
