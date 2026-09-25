import { describe, expect, it } from 'vitest';
import { chordFromEvent, formatChord } from './keys';
import { buildKeymap, commandForEvent, DuplicateKeyError, fuzzyScore, type Command } from './registry';

const ev = (key: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({
  key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, target: null, ...mods,
});

describe('chordFromEvent', () => {
  it('keeps printable case and folds Shift into it', () => {
    expect(chordFromEvent(ev('j'))).toBe('j');
    expect(chordFromEvent(ev('J', { shiftKey: true }))).toBe('J');
    expect(chordFromEvent(ev('/'))).toBe('/');
  });

  it('upper-cases letters under Ctrl and records Shift explicitly', () => {
    expect(chordFromEvent(ev('k', { ctrlKey: true }))).toBe('Ctrl+K');
    expect(chordFromEvent(ev('z', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Z');
    expect(chordFromEvent(ev('k', { metaKey: true }))).toBe('Ctrl+K');
  });

  it('does not add Shift to symbols that need it on the layout', () => {
    expect(chordFromEvent(ev('+', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl++');
  });

  it('names special keys and records Shift on them', () => {
    expect(chordFromEvent(ev('ArrowLeft', { altKey: true }))).toBe('Alt+ArrowLeft');
    expect(chordFromEvent(ev('PageDown', { shiftKey: true }))).toBe('Shift+PageDown');
    expect(chordFromEvent(ev(' '))).toBe('Space');
  });

  it('formats chords for display', () => {
    expect(formatChord('Alt+ArrowLeft')).toBe('Alt+←');
    expect(formatChord('Ctrl++')).toBe('Ctrl++');
  });
});

describe('keymap', () => {
  const run = () => {};
  const cmds: Command[] = [
    { id: 'palette', title: 'Command palette', group: 'App', keys: ['Ctrl+K'], run },
    { id: 'down', title: 'Scroll down', group: 'View', keys: ['j'], run },
    { id: 'off', title: 'Disabled', group: 'View', keys: ['x'], when: () => false, run },
  ];
  const map = buildKeymap(cmds);

  it('rejects two commands on one chord', () => {
    expect(() => buildKeymap([...cmds, { id: 'dup', title: 'Dup', group: 'x', keys: ['j'], run }])).toThrow(DuplicateKeyError);
  });

  it('resolves events, honouring when()', () => {
    expect(commandForEvent(map, ev('k', { ctrlKey: true }))?.id).toBe('palette');
    expect(commandForEvent(map, ev('x'))).toBeUndefined();
  });

  it('ranks substring matches above scattered ones and rejects non-matches', () => {
    expect(fuzzyScore('zoom', 'Zoom in')).toBeGreaterThan(fuzzyScore('zmi', 'Zoom in'));
    expect(fuzzyScore('qqq', 'Zoom in')).toBe(0);
  });
});
