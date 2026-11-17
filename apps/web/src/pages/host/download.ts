/** The server sends the PPTX as an attachment, so following the link only downloads it (D23). */
export function downloadPptx(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
