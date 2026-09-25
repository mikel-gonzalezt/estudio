interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Install and update state of the PWA. */
class Pwa {
  /** Set while the browser offers installation; the Install button shows only then. */
  installPrompt = $state.raw<InstallPromptEvent | null>(null);
  standalone = $state(false);
  /** A new version is downloaded and waits for a moment when reloading loses nothing. */
  updateReady = $state(false);
  #apply: (() => Promise<void>) | null = null;

  listen() {
    const mq = matchMedia('(display-mode: standalone)');
    this.standalone = mq.matches;
    mq.addEventListener('change', (e) => (this.standalone = e.matches));
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e as InstallPromptEvent;
    });
    addEventListener('appinstalled', () => (this.installPrompt = null));
  }

  async install() {
    const p = this.installPrompt;
    if (!p) return;
    await p.prompt();
    if ((await p.userChoice).outcome === 'accepted') this.installPrompt = null;
  }

  offerUpdate(apply: () => Promise<void>) {
    this.#apply = apply;
    this.updateReady = true;
  }

  applyUpdate(): Promise<void> {
    return this.#apply?.() ?? Promise.resolve();
  }
}

export const pwa = new Pwa();
