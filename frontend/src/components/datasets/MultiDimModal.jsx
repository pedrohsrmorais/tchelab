/**
 * MultiDimModal — visualização multidimensional unificada, sem @react-three/fiber.
 * 3D implementado com Three.js puro via canvas imperativo (sem R3F).
 *
 * Em vez de impor um gráfico fixo por número de dimensões do tensor, o
 * analista escolhe quais eixos do tensor viram X / Y / Z (ou nenhum, isto é,
 * "fixo" num índice) e qual o modo de visualização para esses eixos:
 *   - Linha      (1 eixo livre)  → espectro / perfil, com overlay de fatias
 *   - Heatmap    (2 eixos livres) → cor = valor
 *   - Surface 3D (2 eixos livres) → altura + cor = valor
 *   - Matriz     (2 eixos livres) → números reais entre colchetes, com
 *                                   comparação "linha A × linha B"
 *   - Voxel 3D   (3 eixos livres) → células coloridas no espaço
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Info, Layers, Download, Grid3X3, Box, Waves, Rows3, LineChart as LineChartIcon } from 'lucide-react';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

function viridis(t) {
  const stops = [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[Math.min(i, stops.length - 1)];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  return [
    Math.round(a[0] + f * (b[0] - a[0])),
    Math.round(a[1] + f * (b[1] - a[1])),
    Math.round(a[2] + f * (b[2] - a[2])),
  ];
}

const SERIES_COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#38bdf8', '#f87171'];

function flatten(arr) {
  if (!Array.isArray(arr)) return [arr];
  return arr.flatMap(flatten);
}

function getVal(arr, ...indices) {
  let cur = arr;
  for (const idx of indices) {
    if (!Array.isArray(cur)) return NaN;
    cur = cur[idx];
  }
  return typeof cur === 'number' ? cur : NaN;
}

/**
 * Fatia genérica do tensor a partir de um "axisOrder" explícito (índices de
 * dimensão escolhidos pelo usuário para X, [Y, [Z]]) e dos índices fixos das
 * demais dimensões. Substitui a heurística antiga de "sempre os últimos N
 * eixos livres": agora o analista decide exatamente qual dimensão é qual.
 */
function sliceGeneric(tensor, dims, axisOrder, fixedIdx) {
  if (!axisOrder.length) return null;
  const buildIndex = (coords) => dims.map((_, di) => {
    const pos = axisOrder.indexOf(di);
    if (pos !== -1) return coords[pos];
    return fixedIdx[di] ?? 0;
  });

  if (axisOrder.length === 1) {
    const [xDim] = axisOrder;
    const size = dims[xDim];
    const values = [];
    for (let i = 0; i < size; i++) values.push(getVal(tensor, ...buildIndex([i])));
    return { kind: 'line', values, size, xDim };
  }

  if (axisOrder.length === 2) {
    const [xDim, yDim] = axisOrder;
    const cols = dims[xDim], rows = dims[yDim];
    const matrix = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(getVal(tensor, ...buildIndex([c, r])));
      matrix.push(row);
    }
    return { kind: '2d', matrix, rows, cols, xDim, yDim };
  }

  const [xDim, yDim, zDim] = axisOrder;
  const sizes = [dims[xDim], dims[yDim], dims[zDim]];
  const values = [];
  for (let a = 0; a < sizes[0]; a++)
    for (let b = 0; b < sizes[1]; b++)
      for (let c = 0; c < sizes[2]; c++)
        values.push({ a, b, c, v: getVal(tensor, ...buildIndex([a, b, c])) });
  return { kind: '3d', values, sizes, xDim, yDim, zDim };
}

/** Linha 1D de um tensor, com um eixo fixo substituído por `overrideIdx`. */
function sliceLineWithOverride(tensor, dims, xDim, fixedIdx, overrideDim, overrideIdx) {
  const size = dims[xDim];
  const fx = overrideDim != null ? { ...fixedIdx, [overrideDim]: overrideIdx } : fixedIdx;
  const values = [];
  for (let i = 0; i < size; i++) {
    const idx = dims.map((_, di) => (di === xDim ? i : fx[di] ?? 0));
    values.push(getVal(tensor, ...idx));
  }
  return values;
}

// ---------------------------------------------------------------------------
// PDF EXPORT
// ---------------------------------------------------------------------------

function exportToPDF(dataUrl, filename) {
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth || 800;
    const h = img.naturalHeight || 600;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    const jpegUrl = tmp.toDataURL('image/jpeg', 0.92);
    const b64 = jpegUrl.split(',')[1];
    const imgBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const enc = new TextEncoder();
    const stream = `q ${w} 0 0 ${h} 0 0 cm /Im1 Do Q`;
    const streamB = enc.encode(stream);
    const obj1 = enc.encode('1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj\n');
    const obj2 = enc.encode('2 0 obj<</Type /Pages /Kids[3 0 R]/Count 1>>endobj\n');
    const obj3 = enc.encode(`3 0 obj<</Type /Page /Parent 2 0 R /MediaBox[0 0 ${w} ${h}] /Contents 4 0 R /Resources<</XObject<</Im1 5 0 R>>>>>>endobj\n`);
    const obj4 = enc.encode(`4 0 obj<</Length ${streamB.length}>>\nstream\n${stream}\nendstream\nendobj\n`);
    const obj5h = enc.encode(`5 0 obj<</Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length}>>\nstream\n`);
    const obj5e = enc.encode('\nendstream\nendobj\n');
    const hdr = enc.encode('%PDF-1.4\n');
    const offsets = [];
    let off = hdr.length;
    for (const o of [obj1, obj2, obj3, obj4]) { offsets.push(off); off += o.length; }
    offsets.push(off);
    const xrefOff = off + obj5h.length + imgBytes.length + obj5e.length;
    const xref = enc.encode(
      `xref\n0 6\n0000000000 65535 f \n` +
      offsets.map(o => String(o).padStart(10, '0') + ' 00000 n ').join('\n') + '\n' +
      `trailer<</Size 6 /Root 1 0 R>>\nstartxref\n${xrefOff}\n%%EOF`
    );
    const blob = new Blob([hdr, obj1, obj2, obj3, obj4, obj5h, imgBytes, obj5e, xref], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  };
  img.src = dataUrl;
}

// ---------------------------------------------------------------------------
// LINE CHART (Canvas 2D) — espectros / perfis, com overlay de múltiplas fatias
// ---------------------------------------------------------------------------

function LineChart({ series, xLabels, exportRef }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [size, setSize] = useState({ w: 700, h: 480 });

  useEffect(() => {
    if (exportRef) exportRef.current = canvasRef.current;
    return () => { if (exportRef) exportRef.current = null; };
  }, [exportRef]);

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setSize({ w: e.contentRect.width || 700, h: e.contentRect.height || 480 });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const [gMin, gMax, n] = useMemo(() => {
    const all = series.flatMap(s => s.values).filter(v => !isNaN(v));
    const n = Math.max(...series.map(s => s.values.length), 1);
    if (!all.length) return [0, 1, n];
    return [Math.min(...all), Math.max(...all), n];
  }, [series]);

  const PAD = { top: 20, left: 60, right: 20, bottom: 46 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = size.w, H = size.h;
    canvas.width = W; canvas.height = H;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = PAD.top + (plotH * i) / gridLines;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
    }

    const xAt = i => PAD.left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const yAt = v => {
      const t = gMax === gMin ? 0.5 : (v - gMin) / (gMax - gMin);
      return PAD.top + plotH - t * plotH;
    };

    series.forEach((s, si) => {
      const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      s.values.forEach((v, i) => {
        if (isNaN(v)) return;
        const x = xAt(i), y = yAt(v);
        if (i === 0 || isNaN(s.values[i - 1])) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // axes
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridLines; i++) {
      const v = gMax - ((gMax - gMin) * i) / gridLines;
      ctx.fillText(v.toPrecision(3), PAD.left - 8, PAD.top + (plotH * i) / gridLines + 3);
    }
    ctx.textAlign = 'center';
    const xTicks = Math.min(8, n);
    for (let i = 0; i <= xTicks; i++) {
      const idx = Math.round((i * (n - 1)) / Math.max(xTicks, 1));
      ctx.fillText(String(xLabels?.[idx] ?? idx), xAt(idx), H - PAD.bottom + 16);
    }

    // legend
    if (series.length > 1) {
      let lx = PAD.left;
      const ly = 12;
      ctx.font = '10px sans-serif';
      series.forEach((s, si) => {
        const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
        ctx.fillStyle = color;
        ctx.fillRect(lx, ly - 7, 10, 3);
        ctx.fillStyle = 'rgba(226,232,240,0.9)';
        ctx.textAlign = 'left';
        ctx.fillText(s.label, lx + 14, ly - 2);
        lx += ctx.measureText(s.label).width + 34;
      });
    }
  }, [series, size, gMin, gMax, n, xLabels]);

  const handleMouseMove = useCallback(e => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const plotW = size.w - PAD.left - PAD.right;
    const idx = Math.round(((mx - PAD.left) / plotW) * (n - 1));
    if (idx >= 0 && idx < n) {
      setTooltip({
        x: e.clientX, y: e.clientY, idx,
        entries: series.map((s, si) => ({ label: s.label, v: s.values[idx], color: s.color || SERIES_COLORS[si % SERIES_COLORS.length] })),
      });
    } else setTooltip(null);
  }, [size, n, series]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: '100%', minHeight: 400 }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', borderRadius: 8, display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div className="fixed z-[200] pointer-events-none px-3 py-1.5 rounded-lg text-xs space-y-0.5"
          style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.15)',
            left: tooltip.x + 12, top: tooltip.y - 28, color: '#e2e8f0', fontFamily: 'monospace' }}>
          <div className="text-slate-400">[{tooltip.idx}]</div>
          {tooltip.entries.map((en, i) => (
            <div key={i} style={{ color: en.color }}>{en.label}: {isNaN(en.v) ? '—' : Number(en.v).toPrecision(6)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2D HEATMAP (Canvas 2D)
// ---------------------------------------------------------------------------

const CELL_MAX = 80;

function HeatMap2D({ matrix, rows, cols, axisLabels, exportRef }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [size, setSize] = useState({ w: 700, h: 480 });

  useEffect(() => {
    if (exportRef) exportRef.current = canvasRef.current;
    return () => { if (exportRef) exportRef.current = null; };
  }, [exportRef]);

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setSize({ w: e.contentRect.width || 700, h: e.contentRect.height || 480 });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const [gMin, gMax] = useMemo(() => {
    const flat = matrix.flatMap(r => r).filter(v => !isNaN(v));
    if (!flat.length) return [0, 1];
    return [Math.min(...flat), Math.max(...flat)];
  }, [matrix]);

  const { dm, dr, dc, sr, sc } = useMemo(() => {
    const sr = rows > CELL_MAX ? Math.ceil(rows / CELL_MAX) : 1;
    const sc = cols > CELL_MAX ? Math.ceil(cols / CELL_MAX) : 1;
    const dm = [];
    for (let r = 0; r < rows; r += sr) {
      const row = [];
      for (let c = 0; c < cols; c += sc) row.push(matrix[r]?.[c] ?? NaN);
      dm.push(row);
    }
    return { dm, dr: Math.ceil(rows / sr), dc: Math.ceil(cols / sc), sr, sc };
  }, [matrix, rows, cols]);

  const PAD = { top: 20, left: 55, right: 20, bottom: 50 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dm.length) return;
    const ctx = canvas.getContext('2d');
    const W = size.w, H = size.h;
    canvas.width = W; canvas.height = H;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const cw = plotW / dc, ch = plotH / dr;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < dr; r++) {
      for (let c = 0; c < dc; c++) {
        const v = dm[r]?.[c];
        if (v == null || isNaN(v)) continue;
        const t = gMax === gMin ? 0.5 : (v - gMin) / (gMax - gMin);
        const [rr, gg, bb] = viridis(t);
        ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
        ctx.fillRect(PAD.left + c * cw, PAD.top + r * ch, cw + 0.5, ch + 0.5);
      }
    }
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = '10px monospace';
    const xTicks = Math.min(8, dc);
    for (let i = 0; i <= xTicks; i++) {
      const c = Math.round(i * (dc - 1) / Math.max(xTicks, 1));
      ctx.textAlign = 'center';
      ctx.fillText(String(axisLabels?.x?.[c * sc] ?? c * sc).slice(0, 8), PAD.left + (c + 0.5) * cw, H - PAD.bottom + 14);
    }
    const yTicks = Math.min(8, dr);
    for (let i = 0; i <= yTicks; i++) {
      const r = Math.round(i * (dr - 1) / Math.max(yTicks, 1));
      ctx.textAlign = 'right';
      ctx.fillText(String(axisLabels?.y?.[r * sr] ?? r * sr).slice(0, 8), PAD.left - 6, PAD.top + (r + 0.5) * ch + 4);
    }
    const barX = PAD.left, barY = H - PAD.bottom + 24, barW = plotW;
    for (let x = 0; x < barW; x++) {
      const [rr, gg, bb] = viridis(x / barW);
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(barX + x, barY, 1, 10);
    }
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(gMin.toPrecision(4), barX, barY + 22);
    ctx.textAlign = 'right';
    ctx.fillText(gMax.toPrecision(4), barX + barW, barY + 22);
  }, [dm, dr, dc, gMin, gMax, size, axisLabels, sc, sr]);

  const handleMouseMove = useCallback(e => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const plotW = size.w - PAD.left - PAD.right;
    const plotH = size.h - PAD.top - PAD.bottom;
    const c = Math.floor((mx - PAD.left) / (plotW / dc));
    const r = Math.floor((my - PAD.top) / (plotH / dr));
    if (c >= 0 && c < dc && r >= 0 && r < dr) {
      setTooltip({ x: e.clientX, y: e.clientY, r: r * sr, c: c * sc, v: matrix[r * sr]?.[c * sc] });
    } else setTooltip(null);
  }, [size, dc, dr, matrix, sr, sc]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: '100%', minHeight: 400 }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', borderRadius: 8, display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div className="fixed z-[200] pointer-events-none px-3 py-1.5 rounded-lg text-xs"
          style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.15)',
            left: tooltip.x + 12, top: tooltip.y - 28, color: '#e2e8f0', fontFamily: 'monospace' }}>
          [{tooltip.r}, {tooltip.c}] = {isNaN(tooltip.v) ? '—' : Number(tooltip.v).toPrecision(6)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MATRIZ NUMÉRICA — números reais entre colchetes + comparação de linhas/colunas
// ---------------------------------------------------------------------------

const MATRIX_CELL_LIMIT = 2000;

function MatrixView({ matrix, rows, cols, axisLabels }) {
  const [compareMode, setCompareMode] = useState('rows'); // rows | cols
  const lineCount = compareMode === 'rows' ? rows : cols;
  const [idxA, setIdxA] = useState(0);
  const [idxB, setIdxB] = useState(Math.min(1, lineCount - 1));

  useEffect(() => {
    setIdxA(0);
    setIdxB(Math.min(1, lineCount - 1));
  }, [compareMode, rows, cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const tooBig = rows * cols > MATRIX_CELL_LIMIT;

  const getLine = (i) => compareMode === 'rows'
    ? matrix[i] ?? []
    : matrix.map(r => r[i]);

  const fmt = (v) => isNaN(v) ? '—' : Number(v).toPrecision(4);
  const colWidth = compareMode === 'rows' ? cols : rows;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button onClick={() => setCompareMode('rows')}
            className={`px-3 py-1.5 text-xs transition-colors ${compareMode === 'rows' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            Comparar linhas
          </button>
          <button onClick={() => setCompareMode('cols')}
            className={`px-3 py-1.5 text-xs transition-colors ${compareMode === 'cols' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            Comparar colunas
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span style={{ color: '#fbbf24' }}>■</span> {compareMode === 'rows' ? 'Linha' : 'Coluna'} A
          <select className="input-field py-1 px-2 text-xs" style={{ width: 70 }} value={idxA} onChange={e => setIdxA(Number(e.target.value))}>
            {Array.from({ length: lineCount }, (_, i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <span style={{ color: '#38bdf8' }}>■</span> {compareMode === 'rows' ? 'Linha' : 'Coluna'} B
          <select className="input-field py-1 px-2 text-xs" style={{ width: 70 }} value={idxB} onChange={e => setIdxB(Number(e.target.value))}>
            {Array.from({ length: lineCount }, (_, i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-rows-[1fr_auto] gap-4">
        <div className="rounded-xl border border-white/10 overflow-auto p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {tooBig ? (
            <div className="flex items-center justify-center h-full text-sm text-slate-500 text-center px-6">
              Matriz grande demais ({rows}×{cols} = {rows * cols} valores) para exibir como números — use o Heatmap para esta fatia.
            </div>
          ) : (
            <div className="inline-flex items-stretch font-mono text-xs" style={{ color: '#cbd5e1' }}>
              <span className="flex flex-col justify-between text-slate-600" style={{ fontSize: 28, lineHeight: 1 }}>
                <span>⎡</span><span style={{ flex: 1 }}>⎢</span><span>⎣</span>
              </span>
              <table className="border-collapse">
                <tbody>
                  {matrix.map((row, ri) => {
                    const isA = compareMode === 'rows' && ri === idxA;
                    const isB = compareMode === 'rows' && ri === idxB;
                    return (
                      <tr key={ri} style={{ background: isA ? 'rgba(251,191,36,0.12)' : isB ? 'rgba(56,189,248,0.12)' : 'transparent' }}>
                        {row.map((v, ci) => {
                          const isAc = compareMode === 'cols' && ci === idxA;
                          const isBc = compareMode === 'cols' && ci === idxB;
                          return (
                            <td key={ci} className="px-2 py-0.5 text-right whitespace-nowrap"
                              style={{ background: isAc ? 'rgba(251,191,36,0.12)' : isBc ? 'rgba(56,189,248,0.12)' : 'transparent' }}>
                              {fmt(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <span className="flex flex-col justify-between text-slate-600" style={{ fontSize: 28, lineHeight: 1 }}>
                <span>⎤</span><span style={{ flex: 1 }}>⎥</span><span>⎦</span>
              </span>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 rounded-xl border border-white/10 p-3" style={{ height: 180, background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-xs text-slate-500 mb-1">
            {compareMode === 'rows' ? 'Linha' : 'Coluna'} {idxA} × {compareMode === 'rows' ? 'Linha' : 'Coluna'} {idxB}
          </p>
          <div style={{ height: 'calc(100% - 18px)' }}>
            <LineChart
              series={[
                { label: `${compareMode === 'rows' ? 'Linha' : 'Coluna'} ${idxA}`, values: getLine(idxA), color: '#fbbf24' },
                { label: `${compareMode === 'rows' ? 'Linha' : 'Coluna'} ${idxB}`, values: getLine(idxB), color: '#38bdf8' },
              ]}
              xLabels={Array.from({ length: colWidth }, (_, i) => i)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3D BASE — câmera, luz, rotação, zoom e resize compartilhados por Voxel/Surface
// ---------------------------------------------------------------------------

function Scene3D({ sizesForCamera, buildGroup, deps, exportRef }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth || 700;
    const H = el.clientHeight || 440;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0f172a, 1);
    el.appendChild(renderer.domElement);
    if (exportRef) exportRef.current = renderer.domElement;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000);
    const maxDim = Math.max(...sizesForCamera, 1);
    camera.position.set(maxDim * 1.8, maxDim * 1.4, maxDim * 1.8);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-5, -3, -5);
    scene.add(dirLight2);

    scene.add(new THREE.AxesHelper(maxDim * 0.6));

    // Grupo que recebe a geometria específica do modo (voxels ou superfície)
    // e tudo o que deve rotacionar junto (inclusive seu próprio wireframe).
    const group = buildGroup(THREE);
    scene.add(group);

    const state = { renderer, scene, camera, animId: null, isDragging: false, lastX: 0, lastY: 0, rotX: 0.4, rotY: 0.6, group };

    let autoRotate = true;
    const animate = () => {
      state.animId = requestAnimationFrame(animate);
      if (autoRotate && !state.isDragging) state.rotY += 0.006;
      group.rotation.y = state.rotY;
      group.rotation.x = state.rotX;
      renderer.render(scene, camera);
    };
    animate();

    const onMouseDown = e => { state.isDragging = true; autoRotate = false; state.lastX = e.clientX; state.lastY = e.clientY; };
    const onMouseMove = e => {
      if (!state.isDragging) return;
      const dx = e.clientX - state.lastX, dy = e.clientY - state.lastY;
      state.rotY += dx * 0.01; state.rotX += dy * 0.01;
      state.lastX = e.clientX; state.lastY = e.clientY;
    };
    const onMouseUp = () => { state.isDragging = false; };

    const onTouchStart = e => {
      if (e.touches.length !== 1) return;
      state.isDragging = true; autoRotate = false;
      state.lastX = e.touches[0].clientX; state.lastY = e.touches[0].clientY;
    };
    const onTouchMove = e => {
      if (!state.isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - state.lastX, dy = e.touches[0].clientY - state.lastY;
      state.rotY += dx * 0.01; state.rotX += dy * 0.01;
      state.lastX = e.touches[0].clientX; state.lastY = e.touches[0].clientY;
    };
    const onTouchEnd = () => { state.isDragging = false; };

    const onWheel = e => { camera.position.multiplyScalar(e.deltaY > 0 ? 1.1 : 0.9); };

    const onResize = () => {
      const W2 = el.clientWidth || 700, H2 = el.clientHeight || 440;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: true });
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(state.animId);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      if (exportRef) exportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <div className="relative w-full" style={{ height: '100%', minHeight: 400 }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden', cursor: 'grab' }} />
      <div className="absolute top-3 right-4 text-xs text-slate-500 pointer-events-none">
        Arraste para rotacionar · scroll para zoom
      </div>
    </div>
  );
}

function ColorScaleBar({ gMin, gMax }) {
  return (
    <div className="absolute bottom-3 left-4 right-4 flex items-center gap-3 pointer-events-none">
      <span className="text-xs text-slate-400 font-mono">{gMin.toPrecision(3)}</span>
      <div className="flex-1 h-3 rounded" style={{ background: 'linear-gradient(to right,#440154,#3b518b,#21918c,#5ec962,#fde725)' }} />
      <span className="text-xs text-slate-400 font-mono">{gMax.toPrecision(3)}</span>
    </div>
  );
}

function Voxel3D({ values, sizes, gMin, gMax, exportRef }) {
  const buildGroup = useCallback((THREE_) => {
    const [sx, sy, sz] = sizes;
    const boxGeo = new THREE_.BoxGeometry(sx, sy, sz);
    const edges = new THREE_.EdgesGeometry(boxGeo);
    const lineMat = new THREE_.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.5 });

    const MAX_VOXELS = 2000;
    const visible = values.length <= MAX_VOXELS
      ? values
      : values.filter((_, i) => i % Math.ceil(values.length / MAX_VOXELS) === 0);

    const voxelGeo = new THREE_.BoxGeometry(0.85, 0.85, 0.85);
    const voxelMat = new THREE_.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    const mesh = new THREE_.InstancedMesh(voxelGeo, voxelMat, visible.length);

    const dummy = new THREE_.Object3D();
    const color = new THREE_.Color();
    for (let i = 0; i < visible.length; i++) {
      const { a, b, c, v } = visible[i];
      dummy.position.set(a - sx / 2, b - sy / 2, c - sz / 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const t = gMax === gMin ? 0.5 : (v - gMin) / (gMax - gMin);
      const [rr, gg, bb] = viridis(isNaN(v) ? 0 : t);
      color.setRGB(rr / 255, gg / 255, bb / 255);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Mesh e wireframe vivem só dentro deste group — nada é adicionado
    // diretamente na scene, então rotacionam juntos sem ficar órfãos.
    const group = new THREE_.Group();
    group.add(mesh);
    group.add(new THREE_.LineSegments(edges, lineMat));
    return group;
  }, [values, sizes, gMin, gMax]);

  return (
    <div className="relative w-full h-full">
      <Scene3D sizesForCamera={sizes} buildGroup={buildGroup} deps={[values, sizes, gMin, gMax]} exportRef={exportRef} />
      <ColorScaleBar gMin={gMin} gMax={gMax} />
    </div>
  );
}

function Surface3D({ matrix, rows, cols, gMin, gMax, exportRef }) {
  const buildGroup = useCallback((THREE_) => {
    const heightScale = Math.max(rows, cols, 1) * 0.6;
    const geo = new THREE_.PlaneGeometry(cols - 1 || 1, rows - 1 || 1, Math.max(cols - 1, 1), Math.max(rows - 1, 1));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const color = new THREE_.Color();
    let vi = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = matrix[r]?.[c];
        const t = gMax === gMin ? 0.5 : (v - gMin) / (gMax - gMin);
        const h = isNaN(v) ? 0 : (t - 0.5) * heightScale;
        pos.setY(vi, h);
        const [rr, gg, bb] = viridis(isNaN(v) ? 0 : t);
        color.setRGB(rr / 255, gg / 255, bb / 255);
        color.toArray(colors, vi * 3);
        vi++;
      }
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE_.BufferAttribute(colors, 3));

    const mat = new THREE_.MeshStandardMaterial({ vertexColors: true, side: THREE_.DoubleSide, flatShading: false });
    const mesh = new THREE_.Mesh(geo, mat);

    const wireMat = new THREE_.MeshBasicMaterial({ color: 0x0f172a, wireframe: true, transparent: true, opacity: 0.15 });
    const wireMesh = new THREE_.Mesh(geo, wireMat);

    const boxGeo = new THREE_.BoxGeometry(cols - 1 || 1, heightScale, rows - 1 || 1);
    const edges = new THREE_.EdgesGeometry(boxGeo);
    const lineMat = new THREE_.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.35 });

    const group = new THREE_.Group();
    group.add(mesh);
    group.add(wireMesh);
    group.add(new THREE_.LineSegments(edges, lineMat));
    return group;
  }, [matrix, rows, cols, gMin, gMax]);

  return (
    <div className="relative w-full h-full">
      <Scene3D sizesForCamera={[cols, rows]} buildGroup={buildGroup} deps={[matrix, rows, cols, gMin, gMax]} exportRef={exportRef} />
      <ColorScaleBar gMin={gMin} gMax={gMax} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SELEÇÃO DE EIXOS — o analista escolhe quais dimensões viram X/Y/Z e os
// índices das dimensões restantes ("fixas").
// ---------------------------------------------------------------------------

const ROLE_LABEL = { x: 'X', y: 'Y', z: 'Z' };
const ROLE_COLOR = { x: '#60a5fa', y: '#f472b6', z: '#34d399' };

function AxisPanel({ dims, roles, need, fixedIdx, onAssign, onFixedChange, onSwapXY }) {
  const roleOf = (di) => (['x', 'y', 'z'].slice(0, need).find(rn => roles[rn] === di)) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dims.map((size, di) => {
        const role = roleOf(di);
        return (
          <div key={di} className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: role ? `${ROLE_COLOR[role]}1f` : 'rgba(255,255,255,0.05)', border: `1px solid ${role ? ROLE_COLOR[role] + '55' : 'rgba(255,255,255,0.1)'}` }}>
            <span className="text-xs font-semibold text-slate-400">Dim {di}</span>
            <span className="text-xs text-slate-500">({size})</span>
            <select
              value={role ?? 'fixed'}
              onChange={e => onAssign(di, e.target.value)}
              className="text-xs bg-transparent border-b focus:outline-none"
              style={{ color: role ? ROLE_COLOR[role] : '#93c5fd', borderColor: role ? ROLE_COLOR[role] + '55' : 'rgba(59,130,246,0.3)' }}>
              <option value="fixed" style={{ background: '#1e293b' }}>Fixo</option>
              {['x', 'y', 'z'].slice(0, need).map(rn => (
                <option key={rn} value={rn} style={{ background: '#1e293b' }}>Eixo {ROLE_LABEL[rn]}</option>
              ))}
            </select>
            {!role && (
              <select value={fixedIdx[di] ?? 0} onChange={e => onFixedChange(di, Number(e.target.value))}
                className="text-xs bg-transparent text-slate-300 border-b border-white/15 focus:outline-none">
                {Array.from({ length: size }, (_, i) => (
                  <option key={i} value={i} style={{ background: '#1e293b' }}>índice {i}</option>
                ))}
              </select>
            )}
          </div>
        );
      })}
      {need === 2 && (
        <button onClick={onSwapXY} className="text-xs text-blue-400 hover:text-blue-300 underline ml-1">
          ↔ trocar X/Y
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MODOS DE VISUALIZAÇÃO
// ---------------------------------------------------------------------------

const MODES = [
  { key: 'line', label: 'Linha', need: 1, icon: LineChartIcon, color: '#38bdf8', desc: 'Espectro/perfil ao longo de 1 eixo' },
  { key: 'heatmap', label: 'Heatmap', need: 2, icon: Grid3X3, color: '#3b82f6', desc: 'Cor representa o valor' },
  { key: 'surface', label: 'Surface 3D', need: 2, icon: Waves, color: '#22d3ee', desc: 'Altura + cor representam o valor' },
  { key: 'matrix', label: 'Matriz', need: 2, icon: Rows3, color: '#a78bfa', desc: 'Números reais, compare linhas ou colunas' },
  { key: 'voxel', need: 3, label: 'Voxel 3D', icon: Box, color: '#f472b6', desc: 'Células coloridas no espaço (3 eixos espaciais)' },
];

function defaultRoles(ndim, need) {
  // Prioriza o último eixo do tensor como X (colunas), o penúltimo como Y
  // (linhas) e o antepenúltimo como Z — convenção comum de heatmap/matriz,
  // onde o índice mais "interno" do tensor vira o eixo das colunas.
  const roles = { x: null, y: null, z: null };
  const names = ['x', 'y', 'z'];
  for (let i = 0; i < need; i++) roles[names[i]] = ndim - 1 - i;
  return roles;
}

function adjustRolesForNeed(prevRoles, need, ndim) {
  const names = ['x', 'y', 'z'];
  const next = { x: null, y: null, z: null };
  const used = new Set();
  for (let i = 0; i < need; i++) {
    const rn = names[i];
    if (prevRoles[rn] != null && prevRoles[rn] < ndim) { next[rn] = prevRoles[rn]; used.add(prevRoles[rn]); }
  }
  for (let i = 0; i < need; i++) {
    const rn = names[i];
    if (next[rn] == null) {
      for (let d = ndim - 1; d >= 0; d--) {
        if (!used.has(d)) { next[rn] = d; used.add(d); break; }
      }
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// VIZ MODAL — fullscreen
// ---------------------------------------------------------------------------

function VizModal({ title, subtitle, onClose, onExport, exporting, exportDisabled, children }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: '#0a0f1e' }}>
      <div className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onExport} disabled={exporting || exportDisabled} title={exportDisabled ? 'Exportação indisponível na visão matricial' : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}>
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exportando…' : 'Salvar PDF'}
          </button>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-6">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN MODAL
// ---------------------------------------------------------------------------

export default function MultiDimModal({ dataset, onClose }) {
  const canvasExportRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const { dims, tensor } = useMemo(() => {
    const meta = dataset?.metadata;
    const m = typeof meta === 'string' ? (() => { try { return JSON.parse(meta); } catch { return null; } })() : meta;
    const rawDims = dataset?.dimensions;
    const d = typeof rawDims === 'string'
      ? (() => { try { return JSON.parse(rawDims); } catch { return null; } })()
      : rawDims;
    const t = m?.data?.tensor ?? m?.data?.matrix ?? null;
    return { dims: Array.isArray(d) ? d : null, tensor: t };
  }, [dataset]);

  const ndim = dims ? dims.length : null;
  const hasData = !!(tensor && dims);

  const availableModes = useMemo(() => MODES.filter(m => ndim >= m.need), [ndim]);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    if (!hasData) return;
    // modo inicial: heatmap se possível, senão o mais simples disponível
    const preferred = availableModes.find(m => m.key === 'heatmap') || availableModes[0];
    setMode(preferred?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, ndim]);

  const modeInfo = MODES.find(m => m.key === mode);
  const need = modeInfo?.need ?? 2;

  const [roles, setRoles] = useState(() => (dims ? defaultRoles(ndim, 2) : { x: null, y: null, z: null }));
  const [fixedIdx, setFixedIdx] = useState({});

  useEffect(() => {
    if (!dims || !modeInfo) return;
    setRoles(prev => adjustRolesForNeed(prev, modeInfo.need, ndim));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ndim]);

  const assignRole = useCallback((dim, role) => {
    setRoles(prev => {
      const next = { ...prev };
      for (const rn of ['x', 'y', 'z']) if (next[rn] === dim) next[rn] = null;
      if (role !== 'fixed') next[role] = dim;
      return next;
    });
    setFixedIdx(prev => ({ ...prev, [dim]: prev[dim] ?? 0 }));
  }, []);

  const swapXY = useCallback(() => {
    setRoles(prev => ({ ...prev, x: prev.y, y: prev.x }));
  }, []);

  const axisOrder = useMemo(() => {
    const names = ['x', 'y', 'z'].slice(0, need);
    const order = names.map(rn => roles[rn]).filter(v => v != null);
    return order.length === need ? order : null;
  }, [roles, need]);

  const sliced = useMemo(() => (
    hasData && axisOrder ? sliceGeneric(tensor, dims, axisOrder, fixedIdx) : null
  ), [hasData, tensor, dims, axisOrder, fixedIdx]);

  const [gMin, gMax] = useMemo(() => {
    if (!tensor) return [0, 1];
    const flat = flatten(tensor).filter(v => !isNaN(v));
    return flat.length ? [Math.min(...flat), Math.max(...flat)] : [0, 1];
  }, [tensor]);

  const axisLabels = useMemo(() => {
    const meta = dataset?.metadata;
    const m = typeof meta === 'string' ? (() => { try { return JSON.parse(meta); } catch { return null; } })() : meta;
    return { x: m?.data?.columns ?? m?.feature_headers ?? null, y: m?.data?.row_labels ?? null };
  }, [dataset]);

  // --- Comparação de fatias no modo Linha ------------------------------------
  const fixedDims = useMemo(() => {
    if (!dims || !axisOrder) return [];
    return dims.map((_, i) => i).filter(i => !axisOrder.includes(i));
  }, [dims, axisOrder]);
  const [overlayDim, setOverlayDim] = useState(null);
  const [overlayIndices, setOverlayIndices] = useState([]);

  useEffect(() => { setOverlayDim(null); setOverlayIndices([]); }, [mode, roles.x]);

  const lineSeries = useMemo(() => {
    if (mode !== 'line' || !sliced || sliced.kind !== 'line') return [];
    if (overlayDim == null || !overlayIndices.length) {
      return [{ label: `fixo: ${fixedDims.map(d => `dim${d}=${fixedIdx[d] ?? 0}`).join(', ') || '—'}`, values: sliced.values }];
    }
    return overlayIndices.map((idx, i) => ({
      label: `dim${overlayDim}=${idx}`,
      values: sliceLineWithOverride(tensor, dims, axisOrder[0], fixedIdx, overlayDim, idx),
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    }));
  }, [mode, sliced, overlayDim, overlayIndices, fixedDims, fixedIdx, tensor, dims, axisOrder]);

  const handleExport = useCallback(() => {
    setExporting(true);
    try {
      const safe = (dataset?.name ?? 'dataset').replace(/[^a-z0-9]/gi, '_');
      const el = canvasExportRef.current;
      if (el) {
        const dataUrl = el.toDataURL('image/png');
        exportToPDF(dataUrl, `${safe}_${mode}_viz.pdf`);
      }
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [dataset, mode]);

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!hasData) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="relative w-full max-w-md rounded-2xl overflow-hidden p-6"
          style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1a2540 100%)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
          <div className="flex flex-col items-center justify-center py-6 gap-3 text-slate-500">
            <Info className="w-10 h-10 opacity-40" />
            <p className="text-sm text-center">
              {!tensor
                ? 'Os dados numéricos deste dataset não foram carregados ou não suportam visualização matricial.'
                : 'Dimensões do dataset não encontradas nos metadados.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <VizModal
      title="Visualização Multidimensional"
      subtitle={`${dataset?.name} · ${dims.join(' × ')} (${ndim}D)`}
      onClose={onClose}
      onExport={handleExport}
      exporting={exporting}
      exportDisabled={mode === 'matrix'}>
      <div className="flex flex-col h-full gap-4">
        {/* Seletor de modo */}
        <div className="flex-shrink-0 flex flex-wrap gap-2">
          {availableModes.map(m => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button key={m.key} onClick={() => setMode(m.key)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
                style={{
                  background: active ? `${m.color}26` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? m.color + '77' : 'rgba(255,255,255,0.08)'}`,
                  color: active ? m.color : '#94a3b8',
                }}
                title={m.desc}>
                <Icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Seleção de eixos */}
        <div className="flex-shrink-0 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Eixos ({modeInfo?.desc})</p>
          <AxisPanel dims={dims} roles={roles} need={need} fixedIdx={fixedIdx}
            onAssign={assignRole}
            onFixedChange={(di, v) => setFixedIdx(prev => ({ ...prev, [di]: v }))}
            onSwapXY={swapXY} />

          {mode === 'line' && fixedDims.length > 0 && (
            <div className="mt-3 pt-3 flex flex-wrap items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-xs text-slate-500">Comparar múltiplas fatias:</span>
              <select className="input-field py-1 px-2 text-xs" style={{ width: 140 }}
                value={overlayDim ?? ''} onChange={e => {
                  const v = e.target.value === '' ? null : Number(e.target.value);
                  setOverlayDim(v);
                  setOverlayIndices(v == null ? [] : [fixedIdx[v] ?? 0]);
                }}>
                <option value="">nenhuma</option>
                {fixedDims.map(d => <option key={d} value={d}>dim {d} ({dims[d]})</option>)}
              </select>
              {overlayDim != null && (
                <div className="flex flex-wrap gap-1.5 max-w-xl">
                  {Array.from({ length: Math.min(dims[overlayDim], 24) }, (_, i) => i).map(i => {
                    const checked = overlayIndices.includes(i);
                    return (
                      <button key={i} onClick={() => setOverlayIndices(prev => checked ? prev.filter(x => x !== i) : [...prev, i])}
                        className="px-2 py-0.5 rounded text-[11px] font-mono transition-colors"
                        style={{ background: checked ? SERIES_COLORS[overlayIndices.indexOf(i) % SERIES_COLORS.length] + '33' : 'rgba(255,255,255,0.05)',
                          color: checked ? SERIES_COLORS[overlayIndices.indexOf(i) % SERIES_COLORS.length] : '#64748b',
                          border: `1px solid ${checked ? SERIES_COLORS[overlayIndices.indexOf(i) % SERIES_COLORS.length] + '55' : 'rgba(255,255,255,0.08)'}` }}>
                        {i}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Conteúdo do modo */}
        <div className="flex-1 min-h-0">
          {!sliced ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              Escolha {need} eixo{need > 1 ? 's' : ''} ({['X', 'Y', 'Z'].slice(0, need).join(', ')}) para visualizar.
            </div>
          ) : mode === 'line' ? (
            <LineChart series={lineSeries} xLabels={axisLabels?.x} exportRef={canvasExportRef} />
          ) : mode === 'heatmap' && sliced.kind === '2d' ? (
            <HeatMap2D matrix={sliced.matrix} rows={sliced.rows} cols={sliced.cols} axisLabels={axisLabels} exportRef={canvasExportRef} />
          ) : mode === 'surface' && sliced.kind === '2d' ? (
            <Surface3D matrix={sliced.matrix} rows={sliced.rows} cols={sliced.cols} gMin={gMin} gMax={gMax} exportRef={canvasExportRef} />
          ) : mode === 'matrix' && sliced.kind === '2d' ? (
            <MatrixView matrix={sliced.matrix} rows={sliced.rows} cols={sliced.cols} axisLabels={axisLabels} />
          ) : mode === 'voxel' && sliced.kind === '3d' ? (
            <Voxel3D values={sliced.values} sizes={sliced.sizes} gMin={gMin} gMax={gMax} exportRef={canvasExportRef} />
          ) : null}
        </div>
      </div>
    </VizModal>
  );
}
