import type { Command } from '../../lib/registry';
import type { Reader } from '../session.svelte';
import { pinsFor } from './pins.svelte';

export function pinCommands(r: Reader): Command[] {
  const pins = pinsFor(r);
  const selectedArea = () => {
    const a = r.ann.selected ? r.ann.items.get(r.ann.selected) : undefined;
    return a?.kind === 'area' ? a : undefined;
  };
  const any = () => pins.enabled && pins.figures.length > 0;
  return [
    { id: 'pins.panel', title: 'Show / hide pinned figures', group: 'View', keys: ['P'], when: any, run: () => pins.togglePanel() },
    {
      id: 'pins.pin', title: 'Pin / unpin the selected area clip', group: 'Annotate', keys: ['Alt+P'], global: true,
      when: () => pins.enabled && !!selectedArea(), run: () => pins.toggle(selectedArea()!.id),
    },
    {
      id: 'pins.popOut', title: 'Open pinned figures in their own window', group: 'View', when: () => any() && !pins.poppedOut,
      run: () => pins.popOut() || alert('The browser blocked the window. Allow pop-ups for Estudio and try again.'),
    },
    { id: 'pins.bringBack', title: 'Bring pinned figures back into the reader', group: 'View', when: () => pins.poppedOut, run: () => pins.bringBack() },
    {
      id: 'pins.feature', title: pins.enabled ? 'Pinned figures: turn off' : 'Pinned figures: turn on', group: 'View',
      run: () => pins.setEnabled(!pins.enabled),
    },
  ];
}
