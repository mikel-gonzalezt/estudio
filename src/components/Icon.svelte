<script lang="ts" module>
  const PATHS = {
    open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    library: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.5l3.8 1-4 15-3.8-1z',
    select: 'M5 3l14 7-6 2-2 6z',
    highlight: 'M9 11l-5 5v3h3l5-5M9 11l6-6 4 4-6 6M9 11l4 4M14 20h7',
    underline: 'M7 4v6a5 5 0 0 0 10 0V4M5 20h14',
    strike: 'M5 12h14M16 6.5A4 4 0 0 0 12 5c-2.5 0-4 1.3-4 3 0 3.5 8 2.5 8 7 0 1.9-1.8 3-4 3a4.5 4.5 0 0 1-4.3-2.5',
    pen: 'M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16zM14 7l3 3',
    eraser: 'M8 20h12M5 15l9-9a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3l-8 8H9z M10 10l5 5',
    note: 'M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM15 20v-5h5M8 9h8M8 13h5',
    area: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
    zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6',
    zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
    sidebar: 'M4 5h16v14H4zM9 5v14',
    panel: 'M4 5h16v14H4zM15 5v14',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
    focus: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    ruler: 'M3 9h18v6H3zM7 9v3M11 9v3M15 9v3M19 9v2',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    command: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
    card: 'M3 7h14v12H3zM7 4h14v12',
    notebook: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM6 3v18M3 7h3M3 12h3M3 17h3M10 8h6M10 12h6',
    back: 'M15 18l-6-6 6-6',
    forward: 'M9 18l6-6-6-6',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
    close: 'M6 6l12 12M18 6L6 18',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    quote: 'M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6',
    fitWidth: 'M4 6v12M20 6v12M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3',
    fitPage: 'M7 3h10v18H7zM10 8h4M10 12h4',
    fitText: 'M3 4v16M21 4v16M7 8h10M7 12h10M7 16h7',
    timer: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    copy: 'M9 9h11v11H9zM5 15V4h11',
    popout: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    widen: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    tag: 'M3 12V4h8l9 9-8 8zM7.5 7.5h.01',
    play: 'M7 5l12 7-12 7z',
    pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
    speak: 'M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11',
    reset: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4',
    palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.2-1.7-.4-1.1.3-2.3 1.5-2.3H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
    check: 'M5 12l5 5 9-10',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    folderPlus: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13h6',
    file: 'M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5',
    filePlus: 'M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M12 11v6M9 14h6',
    chevron: 'M9 6l6 6-6 6',
    vault: 'M4 4h16v16H4zM4 9h16M9 9v11',
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={PATHS[name]} />
</svg>
