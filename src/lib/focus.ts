/**
 * Focuses an element once it is mounted. The `autofocus` attribute only works on page
 * load, and a pointer interaction still in flight would steal focus back, hence the frame delay.
 */
export function focusOnMount(node: HTMLElement, enabled = true) {
  if (enabled) requestAnimationFrame(() => node.focus());
}
