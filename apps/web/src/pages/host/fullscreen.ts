/** Must be called from a click; a refusal (e.g. iframe embedding) just keeps the window mode. */
export function enterFullscreen(): void {
  if (document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.().catch(() => {});
}
