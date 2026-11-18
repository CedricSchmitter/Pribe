import { useEffect, useRef } from 'react';

type DeckcraftApi = {
  execute(command: string, params?: unknown): Promise<unknown>;
  uiInspect(params?: unknown): Promise<unknown>;
};

const FILE_NAME = 'Praesentation.pptx';

/**
 * Plays a PPTX in the DeckCraft web build (`/deckcraft/`, D32). The host bridge (`?host=parent`)
 * only talks to a parent on its own origin, so this frame needs `allow-same-origin`.
 */
export function DeckcraftFrame({ url, onFailed }: { url: string; onFailed(): void }) {
  const iframe = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function onMessage(e: MessageEvent) {
      const frame = iframe.current?.contentWindow;
      if (!frame || e.origin !== location.origin || e.source !== frame) return;
      const type = (e.data as { type?: string } | null)?.type;
      if (type === 'deckcraft:failed') return onFailed();
      if (type !== 'deckcraft:ready') return;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = await res.arrayBuffer();
        if (cancelled) return;
        frame.postMessage({ type: 'deckcraft:open', name: FILE_NAME, bytes }, location.origin, [bytes]);
        await startShow(frame as Window & { deckcraft?: DeckcraftApi });
        // Keys only reach the show when its canvas has focus, not just the iframe.
        iframe.current?.focus();
        frame.document.getElementById('deckcraft_canvas')?.focus();
      } catch {
        if (!cancelled) onFailed();
      }
    }
    addEventListener('message', onMessage);
    return () => {
      cancelled = true;
      removeEventListener('message', onMessage);
    };
  }, [url]);

  return (
    <iframe
      ref={iframe}
      className="host-iframe"
      title="Präsentation"
      src="/deckcraft/?host=parent"
      sandbox="allow-scripts allow-same-origin"
      allow="fullscreen"
    />
  );
}

/** `deckcraft:open` loads asynchronously; starting the show before it lands would play the empty deck. */
async function startShow(frame: Window & { deckcraft?: DeckcraftApi }) {
  const api = frame.deckcraft;
  if (!api) throw new Error('window.deckcraft missing');
  for (let i = 0; i < 100; i++) {
    const ui = (await api.uiInspect({})) as { documents?: { path?: string }[] };
    if (ui.documents?.some((d) => d.path === FILE_NAME)) {
      // The browser build draws presenter view as a blocked popup with a retry button over the slide.
      await api.execute('show.presenter', { on: false });
      await api.execute('show.start', {});
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('presentation did not open');
}
