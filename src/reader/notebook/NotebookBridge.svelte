<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import type { Reader } from '../session.svelte';

  let { reader }: { reader: Reader } = $props();

  $effect(() => {
    const study = reader.study;
    return study.notebook.channel.on((m) => {
      if (m.t === 'hello') study.notebook.channel.post({ t: 'context', ctx: $state.snapshot(reader.notebookHost.context) });
      else if (m.t === 'jump') reader.notebookHost.jump(m.page);
      else if (m.t === 'autoLinks') app.settings.autoPageLinks = m.on;
    });
  });

  $effect(() => {
    if (!reader.study.poppedOut) return;
    reader.study.notebook.channel.post({ t: 'context', ctx: $state.snapshot(reader.notebookHost.context) });
  });
</script>
