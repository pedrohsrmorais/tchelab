/**
 * MultiDimModal — visualização multidimensional de datasets.
 *
 * Fluxo:
 *   1. Botão "Visualizar" no card → abre este modal (seletor de modo)
 *   2. Usuário escolhe 2D / 3D / 4D+ → abre um modal de visualização dedicado
 *   3. Modal de visualização ocupa a tela toda e tem botão "Salvar PDF"
 */

import React, {
  useState, useEffect, useRef, useMemo, useCallback, Suspense
} from 'react';
import { X, Info, Layers, Download, Grid3X3, Box, Sliders } from 'lucide-react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

function viridis(t) {
  const stops = [
    [68,  1,  84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201,  98],
    [253, 231,  37],
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[Math.min(i,     stops.length - 1)];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  return [
    Math.round(a[0] + f * (b[0] - a[0])),
    Math.round(a[1] + f * (b[1] - a[1])),
    Math.round(a[2] + f * (b[2] - a[2])),
  ];
}

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

function sliceTo2D(tensor, dims, fixedAxes) {
  const freeAxes = dims.map((_, i) => i).filter(i => !(i in fixedAxes));
  if (freeAxes.length < 2) return null;
  const rowAxis = freeAxes[freeAxes.length - 2];
  const colAxis = freeAxes[freeAxes.length - 1];
  const rows = dims[rowAxis];
  const cols = dims[colAxis];
  const matrix = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const idx = dims.map((_, di) => {
        if (di === rowAxis) return r;
        if (di === colAxis) return c;
        return fixedAxes[di] ?? 0;
      });
      row.push(getVal(tensor, ...idx));
    }
    matrix.push(row);
  }
  return { matrix, rows, cols, rowAxis, colAxis };
}

function sliceTo3D(tensor, dims, fixedAxes) {
  const freeAxes = dims.map((_, i) => i).filter(i => !(i in fixedAxes));
  if (freeAxes.length < 3) return null;
  const ax = [
    freeAxes[freeAxes.length - 3],
    freeAxes[freeAxes.length - 2],
    freeAxes[freeAxes.length - 1],
  ];
  const sizes = ax.map(a => dims[a]);
  const values = [];
  for (let a = 0; a < sizes[0]; a++)
    for (let b = 0; b < sizes[1]; b++)
      for (let c = 0; c < sizes[2]; c++) {
        const idx = dims.map((_, di) => {
          const pos = ax.indexOf(di);
          if (pos === 0) return a;
          if (pos === 1) return b;
          if (pos === 2) return c;
          return fixedAxes[di] ?? 0;
        });
        values.push({ a, b, c, v: getVal(tensor, ...idx) });
      }
  return { values, sizes, axes: ax };
}

// ---------------------------------------------------------------------------
// PDF EXPORT
// ---------------------------------------------------------------------------

function exportToPDF(dataUrl, filename) {
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth  || 800;
    const h = img.naturalHeight || 600;

    const tmp = document.createElement('canvas');
    tmp.width  = w;
    tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    const jpegUrl  = tmp.toDataURL('image/jpeg', 0.92);
    const b64      = jpegUrl.split(',')[1];
    const imgBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    const enc    = new TextEncoder();
    const stream = `q ${w} 0 0 ${h} 0 0 cm /Im1 Do Q`;
    const streamB = enc.encode(stream);

    const obj1 = enc.encode('1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj\n');
    const obj2 = enc.encode('2 0 obj<</Type /Pages /Kids[3 0 R]/Count 1>>endobj\n');
    const obj3 = enc.encode(`3 0 obj<</Type /Page /Parent 2 0 R /MediaBox[0 0 ${w} ${h}] /Contents 4 0 R /Resources<</XObject<</Im1 5 0 R>>>>>>endobj\n`);
    const obj4 = enc.encode(`4 0 obj<</Length ${streamB.length}>>\nstream\n${stream}\nendstream\nendobj\n`);
    const obj5h = enc.encode(`5 0 obj<</Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length}>>\nstream\n`);
    const obj5e = enc.encode('\nendstream\nendobj\n');
    const hdr   = enc.encode('%PDF-1.4\n');

    const offsets = [];
    let off = hdr.length;
    for (const o of [obj1, obj2, obj3, obj4]) { offsets.push(off); off += o.length; }
    offsets.push(off);
    const xrefOff = off + obj5h.length + imgBytes.length + obj5e.length;

    const xref = enc.encode(
      `xref\n0 6\n0000000000 65535 f \n` +
      offsets.map(o => String(o).padStart(10,'0') + ' 00000 n ').join('\n') + '\n' +
      `trailer<</Size 6 /Root 1 0 R>>\nstartxref\n${xrefOff}\n%%EOF`
    );

    const blob = new Blob([hdr, obj1, obj2, obj3, obj4, obj5h, imgBytes, obj5e, xref], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  };
  img.src = dataUrl;
}

// ---------------------------------------------------------------------------
// 2D HEATMAP
// ---------------------------------------------------------------------------

const CELL_MAX = 80;

function HeatMap2D({ matrix, rows, cols, axisLabels, exportRef }) {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ w: 700, h: 480 });

  useEffect(() => {
    if (exportRef) exportRef.current = canvasRef.current;
    return () => { if (exportRef) exportRef.current = null; };
  }, [exportRef]);

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setCanvasSize({ w: e.contentRect.width || 700, h: e.contentRect.height || 480 });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const [gMin, gMax] = useMemo(() => {
    const flat = matrix.flatMap(r => r).filter(v => !isNaN(v));
    return [Math.min(...flat), Math.max(...flat)];
  }, [matrix]);

  const { displayMatrix, dispRows, dispCols, stepR, stepC } = useMemo(() => {
    const sr = rows > CELL_MAX ? Math.ceil(rows / CELL_MAX) : 1;
    const sc = cols > CELL_MAX ? Math.ceil(cols / CELL_MAX) : 1;
    const dm = [];
    for (let r = 0; r < rows; r += sr) {
      const row = [];
      for (let c = 0; c < cols; c += sc) row.push(matrix[r][c]);
      dm.push(row);
    }
    return { displayMatrix: dm, dispRows: Math.ceil(rows/sr), dispCols: Math.ceil(cols/sc), stepR: sr, stepC: sc };
  }, [matrix, rows, cols]);

  const PAD = { top: 20, left: 55, right: 20, bottom: 50 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !displayMatrix.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvasSize.w, H = canvasSize.h;
    canvas.width = W; canvas.height = H;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const cw = plotW / dispCols, ch = plotH / dispRows;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    for (let r = 0; r < dispRows; r++) {
      for (let c = 0; c < dispCols; c++) {
        const v = displayMatrix[r]?.[c];
        if (v == null || isNaN(v)) continue;
        const t = gMax === gMin ? 0.5 : (v - gMin) / (gMax - gMin);
        const [rr, gg, bb] = viridis(t);
        ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
        ctx.fillRect(PAD.left + c * cw, PAD.top + r * ch, cw + 0.5, ch + 0.5);
      }
    }

    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = '10px monospace';
    const xTicks = Math.min(8, dispCols);
    for (let i = 0; i <= xTicks; i++) {
      const c = Math.round(i * (dispCols - 1) / Math.max(xTicks,1));
      ctx.textAlign = 'center';
      ctx.fillText(String(axisLabels?.x?.[c * stepC] ?? c * stepC).slice(0,8), PAD.left + (c + 0.5) * cw, H - PAD.bottom + 14);
    }
    const yTicks = Math.min(8, dispRows);
    for (let i = 0; i <= yTicks; i++) {
      const r = Math.round(i * (dispRows - 1) / Math.max(yTicks,1));
      ctx.textAlign = 'right';
      ctx.fillText(String(axisLabels?.y?.[r * stepR] ?? r * stepR).slice(0,8), PAD.left - 6, PAD.top + (r + 0.5) * ch + 4);
    }

    // Colour bar
    const barX = PAD.left, barY = H - PAD.bottom + 24, barW = plotW;
    for (let x = 0; x < barW; x++) {
      const [rr,gg,bb] = viridis(x / barW);
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(barX + x, barY, 1, 10);
    }
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(gMin.toPrecision(4), barX, barY + 22);
    ctx.textAlign = 'right';
    ctx.fillText(gMax.toPrecision(4), barX + barW, barY + 22);
  }, [displayMatrix, dispRows, dispCols, gMin, gMax, canvasSize, axisLabels, stepC, stepR]);

  const handleMouseMove = useCallback(e => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const plotW = canvasSize.w - PAD.left - PAD.right;
    const plotH = canvasSize.h - PAD.top - PAD.bottom;
    const c = Math.floor((mx - PAD.left) / (plotW / dispCols));
    const r = Math.floor((my - PAD.top)  / (plotH / dispRows));
    if (c >= 0 && c < dispCols && r >= 0 && r < dispRows) {
      setTooltip({ x: e.clientX, y: e.clientY, r: r * stepR, c: c * stepC, v: matrix[r * stepR]?.[c * stepC] });
    } else {
      setTooltip(null);
    }
  }, [canvasSize, dispCols, dispRows, matrix, stepR, stepC]);

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
// 3D VOXEL
// ---------------------------------------------------------------------------

function GlCapture({ glRef }) {
  const { gl } = useThree();
  useEffect(() => {
    if (glRef) glRef.current = gl;
    return () => { if (glRef) glRef.current = null; };
  }, [gl, glRef]);
  return null;
}

function VoxelCloud({ values, sizes, gMin, gMax, maxVoxels = 2000 }) {
  const groupRef = useRef();
  const meshRef  = useRef();

  const visible = useMemo(() => {
    if (values.length <= maxVoxels) return values;
    const step = Math.ceil(values.length / maxVoxels);
    return values.filter((_, i) => i % step === 0);
  }, [values, maxVoxels]);

  const { geometry, colors, positions } = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
    const cols = [], pos = [];
    for (const { a, b, c, v } of visible) {
      const t = gMax === gMin ? 0.5 : (v - gMin) / (gMax - gMin);
      const [rr, gg, bb] = viridis(t);
      cols.push(rr/255, gg/255, bb/255);
      pos.push(a - sizes[0]/2, b - sizes[1]/2, c - sizes[2]/2);
    }
    return { geometry: geo, colors: cols, positions: pos };
  }, [visible, sizes, gMin, gMax]);

  useEffect(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < visible.length; i++) {
      dummy.position.set(positions[i*3], positions[i*3+1], positions[i*3+2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(colors[i*3], colors[i*3+1], colors[i*3+2]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [visible, positions, colors]);

  useFrame(({ clock }) => {
    if (groupRef.current) groupRef.current.rotation.y = clock.getElapsedTime() * 0.15;
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[geometry, null, visible.length]}>
        <meshStandardMaterial vertexColors transparent opacity={0.82} />
      </instancedMesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(sizes[0], sizes[1], sizes[2])]} />
        <lineBasicMaterial color="#475569" transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

function CubeScene({ values, sizes, gMin, gMax, glRef }) {
  const { camera } = useThree();
  useEffect(() => {
    const maxDim = Math.max(...sizes);
    camera.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.5);
    camera.lookAt(0, 0, 0);
  }, [camera, sizes]);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <VoxelCloud values={values} sizes={sizes} gMin={gMin} gMax={gMax} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      <axesHelper args={[Math.max(...sizes) * 0.6]} />
      <GlCapture glRef={glRef} />
    </>
  );
}

function View3D({ values, sizes, gMin, gMax, glRef }) {
  return (
    <div className="relative w-full" style={{ height: '100%', minHeight: 400 }}>
      <Canvas
        camera={{ fov: 45, near: 0.1, far: 1000 }}
        gl={{ preserveDrawingBuffer: true }}
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: 8, width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <CubeScene values={values} sizes={sizes} gMin={gMin} gMax={gMax} glRef={glRef} />
        </Suspense>
      </Canvas>
      <div className="absolute bottom-3 left-4 right-4 flex items-center gap-3">
        <span className="text-xs text-slate-400 font-mono">{gMin.toPrecision(3)}</span>
        <div className="flex-1 h-3 rounded" style={{ background: 'linear-gradient(to right, #440154, #3b518b, #21918c, #5ec962, #fde725)' }} />
        <span className="text-xs text-slate-400 font-mono">{gMax.toPrecision(3)}</span>
      </div>
      <div className="absolute top-3 right-4 text-xs text-slate-500">Arraste para rotacionar · scroll para zoom</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AXIS SELECTOR (4D+)
// ---------------------------------------------------------------------------

function AxisSelector({ dims, fixedAxes, onChange, freeCount }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {dims.map((size, di) => {
        const isFixed = di in fixedAxes;
        const freeCount_ = dims.length - Object.keys(fixedAxes).length;
        return (
          <div key={di} className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: isFixed ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span className="text-xs font-semibold text-slate-400">Dim {di}</span>
            <span className="text-xs text-slate-500">({size})</span>
            {isFixed ? (
              <>
                <select value={fixedAxes[di]}
                  onChange={e => onChange({ ...fixedAxes, [di]: Number(e.target.value) })}
                  className="text-xs bg-transparent text-blue-300 border-b border-blue-500/30 focus:outline-none">
                  {Array.from({ length: size }, (_, i) => (
                    <option key={i} value={i} style={{ background: '#1e293b' }}>{i}</option>
                  ))}
                </select>
                <button className="text-xs text-slate-500 hover:text-slate-300 ml-1"
                  onClick={() => { const fa = { ...fixedAxes }; delete fa[di]; onChange(fa); }}>✕</button>
              </>
            ) : (
              <span className="text-xs text-emerald-400 ml-1">livre</span>
            )}
            {!isFixed && freeCount_ > freeCount && (
              <button className="text-xs text-blue-400 hover:text-blue-300 ml-1 underline"
                onClick={() => onChange({ ...fixedAxes, [di]: 0 })}>fixar</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VIZ MODAL — tela cheia com a visualização + exportar PDF
// ---------------------------------------------------------------------------

function VizModal({ title, subtitle, onClose, onExport, exporting, children }) {
  // Fecha com Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: '#0a0f1e' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exportando…' : 'Salvar PDF'}
          </button>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-6">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN MODAL — seletor de modo de visualização
// ---------------------------------------------------------------------------

export default function MultiDimModal({ dataset, onClose }) {
  const [openView, setOpenView] = useState(null); // '2d' | '3d' | '4d'
  const canvas2DRef = useRef(null);
  const glRef       = useRef(null);
  const [exporting, setExporting] = useState(false);

  // Parse tensor/dims
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

  const [fixedAxes, setFixedAxes] = useState(() => {
    if (!dims || dims.length <= 3) return {};
    const fa = {};
    dims.forEach((_, i) => { if (i < dims.length - 3) fa[i] = 0; });
    return fa;
  });

  const [viewMode4D, setViewMode4D] = useState('2d');

  const [gMin, gMax] = useMemo(() => {
    if (!tensor) return [0, 1];
    const flat = flatten(tensor).filter(v => !isNaN(v));
    if (!flat.length) return [0, 1];
    return [Math.min(...flat), Math.max(...flat)];
  }, [tensor]);

  const axisLabels = useMemo(() => {
    const meta = dataset?.metadata;
    const m = typeof meta === 'string' ? (() => { try { return JSON.parse(meta); } catch { return null; } })() : meta;
    return { x: m?.data?.columns ?? m?.feature_headers ?? null, y: m?.data?.row_labels ?? null };
  }, [dataset]);

  // Slice data
  const data2D = useMemo(() => tensor && dims ? sliceTo2D(tensor, dims, fixedAxes) : null, [tensor, dims, fixedAxes]);
  const data3D = useMemo(() => tensor && dims ? sliceTo3D(tensor, dims, fixedAxes) : null, [tensor, dims, fixedAxes]);

  const hasData = !!(tensor && dims);

  // Export
  const handleExport = useCallback(() => {
    setExporting(true);
    try {
      const safe = (dataset?.name ?? 'dataset').replace(/[^a-z0-9]/gi, '_');
      if (canvas2DRef.current) {
        exportToPDF(canvas2DRef.current.toDataURL('image/png'), `${safe}_heatmap.pdf`);
      } else if (glRef.current) {
        exportToPDF(glRef.current.domElement.toDataURL('image/png'), `${safe}_3d.pdf`);
      }
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [dataset]);

  // Fechar com Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape' && !openView) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, openView]);

  // ── Vista 2D ────────────────────────────────────────────────────────────
  if (openView === '2d' && data2D) {
    return (
      <VizModal
        title="Mapa de Calor 2D"
        subtitle={`${dataset?.name} · ${data2D.rows} × ${data2D.cols}`}
        onClose={() => setOpenView(null)}
        onExport={handleExport}
        exporting={exporting}
      >
        <HeatMap2D
          matrix={data2D.matrix}
          rows={data2D.rows}
          cols={data2D.cols}
          axisLabels={axisLabels}
          exportRef={canvas2DRef}
        />
      </VizModal>
    );
  }

  // ── Vista 3D ────────────────────────────────────────────────────────────
  if (openView === '3d' && data3D) {
    return (
      <VizModal
        title="Cubo de Dados 3D"
        subtitle={`${dataset?.name} · ${data3D.sizes.join(' × ')}`}
        onClose={() => setOpenView(null)}
        onExport={handleExport}
        exporting={exporting}
      >
        <View3D values={data3D.values} sizes={data3D.sizes} gMin={gMin} gMax={gMax} glRef={glRef} />
      </VizModal>
    );
  }

  // ── Vista 4D+ ───────────────────────────────────────────────────────────
  if (openView === '4d') {
    const freeAxes = dims ? dims.map((_, i) => i).filter(i => !(i in fixedAxes)) : [];
    const d2 = sliceTo2D(tensor, dims, fixedAxes);
    const d3 = sliceTo3D(tensor, dims, fixedAxes);
    const current = viewMode4D === '2d' ? d2 : d3;

    return (
      <VizModal
        title="Visualização 4D+"
        subtitle={`${dataset?.name} · ${dims?.join(' × ')} (${ndim}D)`}
        onClose={() => setOpenView(null)}
        onExport={handleExport}
        exporting={exporting}
      >
        <div className="flex flex-col h-full gap-4">
          {/* Controles */}
          <div className="flex-shrink-0 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dimensões fixas</p>
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                {freeAxes.length >= 2 && (
                  <button className={`px-3 py-1 text-xs transition-colors ${viewMode4D === '2d' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    onClick={() => setViewMode4D('2d')}>2D</button>
                )}
                {freeAxes.length >= 3 && (
                  <button className={`px-3 py-1 text-xs transition-colors ${viewMode4D === '3d' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    onClick={() => setViewMode4D('3d')}>3D</button>
                )}
              </div>
            </div>
            <AxisSelector dims={dims} fixedAxes={fixedAxes} onChange={setFixedAxes} freeCount={viewMode4D === '2d' ? 2 : 3} />
          </div>

          {/* Visualização */}
          <div className="flex-1 min-h-0">
            {viewMode4D === '2d' && d2 ? (
              <HeatMap2D matrix={d2.matrix} rows={d2.rows} cols={d2.cols} axisLabels={axisLabels} exportRef={canvas2DRef} />
            ) : viewMode4D === '3d' && d3 ? (
              <View3D values={d3.values} sizes={d3.sizes} gMin={gMin} gMax={gMax} glRef={glRef} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                Ajuste as dimensões fixas para ter {viewMode4D === '2d' ? '2' : '3'} eixos livres.
              </div>
            )}
          </div>
        </div>
      </VizModal>
    );
  }

  // ── Modal principal — seletor de modo ───────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1a2540 100%)', border: '1px solid rgba(255,255,255,0.1)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-purple-400" />
            <div>
              <h2 className="text-base font-semibold text-white">Visualização Multidimensional</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {dataset?.name}&nbsp;·&nbsp;
                {dims ? `${dims.join(' × ')} (${ndim}D)` : 'dimensões desconhecidas'}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {!hasData ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500">
              <Info className="w-10 h-10 opacity-40" />
              <p className="text-sm text-center">
                {!tensor
                  ? 'Os dados numéricos deste dataset não foram carregados ou não suportam visualização matricial.'
                  : 'Dimensões do dataset não encontradas nos metadados.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-4">Escolha o modo de visualização:</p>

              {/* 2D */}
              {ndim >= 2 && data2D && (
                <button
                  onClick={() => setOpenView('2d')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-colors group"
                  style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.16)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(59,130,246,0.08)'}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(59,130,246,0.15)' }}>
                    <Grid3X3 className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Mapa de Calor 2D</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Matriz {data2D.rows} × {data2D.cols} com escala de cores viridis
                    </p>
                  </div>
                </button>
              )}

              {/* 3D */}
              {ndim >= 3 && data3D && (
                <button
                  onClick={() => setOpenView('3d')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-colors"
                  style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.16)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(168,85,247,0.15)' }}>
                    <Box className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Cubo Interativo 3D</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Voxels {data3D.sizes.join(' × ')} — arraste para rotacionar
                    </p>
                  </div>
                </button>
              )}

              {/* 4D+ */}
              {ndim >= 4 && (
                <button
                  onClick={() => setOpenView('4d')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-colors"
                  style={{ background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(20,184,166,0.16)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(20,184,166,0.08)'}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(20,184,166,0.15)' }}>
                    <Sliders className="w-5 h-5 text-teal-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Seletor Multidimensional 4D+</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Fixe dimensões e explore fatias 2D ou 3D de {ndim} dimensões
                    </p>
                  </div>
                </button>
              )}

              {!data2D && !data3D && (
                <p className="text-sm text-slate-500 text-center py-4">
                  Nenhum modo de visualização disponível para este dataset.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
