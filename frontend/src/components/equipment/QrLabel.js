import QRCode from 'qrcode';

/** QR Code do link público (SVG/PNG) e etiqueta imprimível. */

export const qrSvg = (url) => QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
export const qrPng = (url, size = 1024) => QRCode.toDataURL(url, { margin: 2, width: size, errorCorrectionLevel: 'M' });

export function download(href, filename) {
  const a = document.createElement('a'); a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}
export async function downloadSvg(url, name) {
  const svg = await qrSvg(url);
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  download(blobUrl, `${name}.svg`); setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
}
export async function downloadPng(url, name) { download(await qrPng(url), `${name}.png`); }

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Abre uma janela com a etiqueta (nome, foto, QR e link) e chama a impressão.
 * `imageDataUrl` é opcional (foto do equipamento já carregada).
 */
export async function printLabel({ name, location, url, imageDataUrl, caption, community, printText = 'Print' }) {
  const svg = await qrSvg(url);
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title>
<style>
  @page { size: A5 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, "Segoe UI", Arial, sans-serif; margin: 0; color: #111; text-align: center; }
  .label { padding: 8mm 6mm; }
  .comm { font-size: 11pt; color: #555; margin: 0 0 2mm; letter-spacing: .04em; text-transform: uppercase; }
  h1 { font-size: 24pt; margin: 0 0 2mm; line-height: 1.15; }
  .loc { font-size: 12pt; color: #444; margin: 0 0 5mm; }
  img.photo { max-width: 100%; max-height: 52mm; object-fit: contain; border-radius: 4mm; margin-bottom: 5mm; }
  .qr { width: 78mm; height: 78mm; margin: 0 auto; }
  .qr svg { width: 100%; height: 100%; }
  .cta { font-size: 15pt; font-weight: 700; margin: 5mm 0 2mm; }
  .url { font-size: 9.5pt; color: #333; word-break: break-all; }
  @media print { .noprint { display: none; } }
</style></head><body><div class="label">
  ${community ? `<p class="comm">${esc(community)}</p>` : ''}
  <h1>${esc(name)}</h1>
  ${location ? `<p class="loc">${esc(location)}</p>` : ''}
  ${imageDataUrl ? `<img class="photo" src="${imageDataUrl}" alt="">` : ''}
  <div class="qr">${svg}</div>
  <p class="cta">${esc(caption)}</p>
  <p class="url">${esc(url)}</p>
</div>
<p class="noprint"><button id="pbtn" style="padding:8px 16px;font-size:14px">${esc(printText)}</button></p>
</body></html>`);
  w.document.close();
  // sem <script> inline: a CSP do app bloqueia; o clique e a impressão partem da janela de origem
  w.document.getElementById('pbtn')?.addEventListener('click', () => w.print());
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* usuário fechou */ } }, 500);
  return true;
}
