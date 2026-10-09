/**
 * MultiDimModal — visualização multidimensional de datasets.
 *
 * Detecta automaticamente a dimensionalidade:
 *   2D → HeatMap (canvas) com eixos cartesianos
 *   3D → Cubo 3D interativo (Three.js) com valor por hover
 *   4D+ → Seletor de dimensões para fixar índices e reduzir para 2D/3D
 */

import React, {
  useState, useEffect, useRef, useMemo, useCallback, Suspense
} from 'react';
import { X, ChevronDown, Info, Layers } from 'lucide-react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

/** Linearly maps v in [srcMin, srcMax] → [dstMin, dstMax] */
function lerp(v, srcMin, srcMax, dstMin, dstMax) {
  if (srcMax === srcMin) return (dstMin + dstMax) / 2;
  return dstMin + ((v - srcMin) / (srcMax - srcMin)) * (dstMax - dstMin);
}

/** Viridis-like colour ramp — returns [r, g, b] in 0-255 */
function viridis(t) {
  // simplified 5-stop viridis approximation
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

/** Flatten multi-dim array to 1-D values, handling nested arrays */
function flatten(arr) {
  if (!Array.isArray(arr)) return [arr];
  return arr.flatMap(flatten);
}

/** Get value at arbitrary index path from nested array */
function getVal(arr, ...indices) {
  let cur = arr;
  for (const idx of indices) {
    if (!Array.isArray(cur)) return NaN;
    cur = cur[idx];
  }
  return typeof cur === 'number' ? cur : NaN;
}

/** Resolve matrix [row][col] from generic data + fixed indices for other dims */
function sliceTo2D(tensor, dims, fixedAxes) {
  // fixedAxes: { dimIndex: fixedValue, ... }
  // remaining 2 free axes are the last two not fixed
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
      // build full index in original dim order
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

/** Resolve 3D sub-tensor from generic data + fixed indices */
function sliceTo3D(tensor, dims, fixedAxes) {
  const freeAxes = dims.map((_, i) => i).filter(i => !(i in fixedAxes));
  if (freeAxes.length < 3) return null;
  const ax = [
    freeAxes[freeAxes.length - 3],
    freeAxes[freeAxes.length - 2],
    freeAxes[freeAxes.length - 1],
  ];
  const sizes = ax.map(a => dims[a]);
  // collect voxels
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
// 2D HEATMAP (Canvas)
// ---------------------------------------------------------------------------

const CELL_MAX = 80; // max canvas dimension in cells before down-sampling

function HeatMap2D({ matrix, rows, cols, axisLabels }) {
  const canvasRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  // Cell size fitted to canvas container
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 400 });
  const containerRef = useRef(null);

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) setCanvasSize({ w: e.contentRect.width || 600, h: e.contentRect.height || 400 });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Pre-compute global min/max
  const [gMin, gMax] = useMemo(() => {
    const flat = matrix.flatMap(r => r).filter(v => !isNaN(v));
    return [Math.min(...flat), Math.max(...flat)];
  }, [matrix]);

  // Down-sample if too large
  const { displayMatrix, dispRows, dispCols, stepR, stepC } = useMemo(() => {
    const sr = rows > CELL_MAX ? Math.ceil(rows / CELL_MAX) : 1;
    const sc = cols > CELL_MAX ? Math.ceil(cols / CELL_MAX) : 1;
    const dr = Math.ceil(rows / sr);
    const dc = Math.ceil(cols / sc);
    const dm = [];
    for (let r = 0; r < rows; r += sr) {
      const row = [];
      for (let c = 0; c < cols; c += sc) row.push(matrix[r][c]);
      dm.push(row);
    }
    return { displayMatrix: dm, dispRows: dr, dispCols: dc, stepR: sr, stepC: sc };
  }, [matrix, rows, cols]);

  const PAD = { top: 20, left: 55, right: 20, bottom: 50 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !displayMatrix.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvasSize.w;
    const H = canvasSize.h;
    canvas.width  = W;
    canvas.height = H;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const cw = plotW / dispCols;
    const ch = plotH / dispRows;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // draw cells
    for (let r = 0; r < dispRows; r++) {
      for (let c = 0; c < dispCols; c++) {
        const v = displayMatrix[r][c];
        if (isNaN(v)) continue;
        const t = (gMax === gMin) ? 0.5 : (v - gMin) / (gMax - gMin);
        const [rr, gg, bb] = viridis(t);
        ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
        ctx.fillRect(PAD.left + c * cw, PAD.top + r * ch, cw + 0.5, ch + 0.5);
      }
    }

    // Axis labels (sparse)
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    // X axis ticks
    const xTicks = Math.min(8, dispCols);
    for (let i = 0; i <= xTicks; i++) {
      const c = Math.round(i * (dispCols - 1) / xTicks);
      const xPx = PAD.left + (c + 0.5) * cw;
      const label = axisLabels?.x?.[c * stepC] ?? (c * stepC);
      ctx.fillText(String(label).slice(0, 8), xPx, H - PAD.bottom + 14);
    }
    // Y axis ticks
    ctx.textAlign = 'right';
    const yTicks = Math.min(8, dispRows);
    for (let i = 0; i <= yTicks; i++) {
      const r = Math.round(i * (dispRows - 1) / yTicks);
      const yPx = PAD.top + (r + 0.5) * ch;
      const label = axisLabels?.y?.[r * stepR] ?? (r * stepR);
      ctx.fillText(String(label).slice(0, 8), PAD.left - 6, yPx + 4);
    }

    // Colour scale bar
    const barX = PAD.left, barY = H - PAD.bottom + 24, barW = plotW, barH = 10;
    for (let x = 0; x < barW; x++) {
      const [rr, gg, bb] = viridis(x / barW);
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(barX + x, barY, 1, barH);
    }
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(gMin.toPrecision(4), barX, barY + barH + 11);
    ctx.textAlign = 'right';
    ctx.fillText(gMax.toPrecision(4), barX + barW, barY + barH + 11);
  }, [displayMatrix, dispRows, dispCols, gMin, gMax, canvasSize, axisLabels, stepC, stepR]);

  // Tooltip on mouse move
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
      const origR = r * stepR, origC = c * stepC;
      const v = matrix[origR][origC];
      setTooltip({ x: e.clientX, y: e.clientY, r: origR, c: origC, v });
    } else {
      setTooltip(null);
    }
  }, [canvasSize, dispCols, dispRows, matrix, stepR, stepC]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: 420 }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', borderRadius: 8 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-1.5 rounded-lg text-xs"
          style={{
            background: 'rgba(15,23,42,0.95)',
            border: '1px solid rgba(255,255,255,0.15)',
            left: tooltip.x + 12,
            top:  tooltip.y - 28,
            color: '#e2e8f0',
            fontFamily: 'monospace',
          }}
        >
          [{tooltip.r}, {tooltip.c}] = {isNaN(tooltip.v) ? '—' : tooltip.v.toPrecision(6)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3D CUBE (Three.js / R3F)
// ---------------------------------------------------------------------------

/** Renders a voxel cloud — each voxel is a coloured semi-transparent box */
function VoxelCloud({ values, sizes, gMin, gMax, maxVoxels = 2000 }) {
  const groupRef = useRef();

  // Subsample if too many voxels
  const visible = useMemo(() => {
    if (values.length <= maxVoxels) return values;
    const step = Math.ceil(values.length / maxVoxels);
    return values.filter((_, i) => i % step === 0);
  }, [values, maxVoxels]);

  // Build instanced mesh for performance
  const { geometry, materialColors, positions } = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
    const cols = [];
    const pos  = [];
    for (const { a, b, c, v } of visible) {
      const t = gMax === gMin ? 0.5 : (v - gMin) / (gMax - gMin);
      const [rr, gg, bb] = viridis(t);
      cols.push(rr / 255, gg / 255, bb / 255);
      pos.push(a - sizes[0] / 2, b - sizes[1] / 2, c - sizes[2] / 2);
    }
    return { geometry: geo, materialColors: cols, positions: pos };
  }, [visible, sizes, gMin, gMax]);

  // Build instanced mesh manually
  const meshRef = useRef();
  useEffect(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < visible.length; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(
        materialColors[i * 3],
        materialColors[i * 3 + 1],
        materialColors[i * 3 + 2]
      ));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [visible, positions, materialColors]);

  // Slow auto-rotate
  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.15;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[geometry, null, visible.length]}>
        <meshStandardMaterial vertexColors transparent opacity={0.82} />
      </instancedMesh>
      {/* Bounding box wireframe */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(sizes[0], sizes[1], sizes[2])]} />
        <lineBasicMaterial color="#475569" transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

function CubeScene({ values, sizes, gMin, gMax }) {
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
    </>
  );
}

function Heatmap3D({ values, sizes, gMin, gMax }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div className="relative w-full" style={{ height: 440 }}>
      <Canvas
        camera={{ fov: 45, near: 0.1, far: 1000 }}
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: 8 }}
        onPointerMissed={() => setHovered(null)}
      >
        <Suspense fallback={null}>
          <CubeScene values={values} sizes={sizes} gMin={gMin} gMax={gMax} />
        </Suspense>
      </Canvas>

      {/* Legend bar */}
      <div className="absolute bottom-3 left-4 right-4 flex items-center gap-3">
        <span className="text-xs text-slate-400 font-mono">{gMin.toPrecision(3)}</span>
        <div className="flex-1 h-3 rounded" style={{
          background: 'linear-gradient(to right, #440154, #3b518b, #21918c, #5ec962, #fde725)'
        }} />
        <span className="text-xs text-slate-400 font-mono">{gMax.toPrecision(3)}</span>
      </div>

      <div className="absolute top-3 right-4 text-xs text-slate-500">
        Arraste para rotacionar · scroll para zoom
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DIMENSION AXIS SELECTOR (4D+)
// ---------------------------------------------------------------------------

function AxisSelector({ dims, fixedAxes, onChange, freeCount }) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {dims.map((size, di) => {
        const isFixed = di in fixedAxes;
        const freeAxesCount = dims.length - Object.keys(fixedAxes).length;
        const canFree = isFixed && freeAxesCount < freeCount;
        const canFix  = !isFixed && freeAxesCount > freeCount;
        return (
          <div key={di} className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: isFixed ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span className="text-xs font-semibold text-slate-400">Dim {di}</span>
            <span className="text-xs text-slate-500">({size})</span>
            {isFixed ? (
              <>
                <select
                  value={fixedAxes[di]}
                  onChange={e => onChange({ ...fixedAxes, [di]: Number(e.target.value) })}
                  className="text-xs bg-transparent text-blue-300 border-b border-blue-500/30 focus:outline-none"
                >
                  {Array.from({ length: size }, (_, i) => (
                    <option key={i} value={i} style={{ background: '#1e293b' }}>{i}</option>
                  ))}
                </select>
                <button
                  className="text-xs text-slate-500 hover:text-slate-300 ml-1"
                  onClick={() => { const fa = { ...fixedAxes }; delete fa[di]; onChange(fa); }}
                  title="Liberar dimensão"
                >✕</button>
              </>
            ) : (
              <span className="text-xs text-emerald-400 ml-1">livre</span>
            )}
            {canFix && (
              <button
                className="text-xs text-blue-400 hover:text-blue-300 ml-1 underline"
                onClick={() => onChange({ ...fixedAxes, [di]: 0 })}
              >fixar</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN MODAL
// ---------------------------------------------------------------------------

export default function MultiDimModal({ dataset, onClose }) {
  // Parse tensor from metadata
  const { dims, tensor } = useMemo(() => {
    const meta = dataset?.metadata;
    const m = typeof meta === 'string' ? (() => { try { return JSON.parse(meta); } catch { return null; } })() : meta;
    const rawDims = dataset?.dimensions;
    const d = typeof rawDims === 'string'
      ? (() => { try { return JSON.parse(rawDims); } catch { return null; } })()
      : rawDims;
    // tensor data: prefer meta.data.matrix (2D) or meta.data.tensor (nD)
    const t = m?.data?.tensor ?? m?.data?.matrix ?? null;
    return { dims: Array.isArray(d) ? d : null, tensor: t };
  }, [dataset]);

  const ndim = dims ? dims.length : null;

  // Fixed axes for 4D+ slicing
  const [fixedAxes, setFixedAxes] = useState(() => {
    if (!dims || dims.length <= 3) return {};
    // fix all dims except the last 2 or 3 by default
    const target = dims.length >= 4 ? 3 : dims.length;
    const fa = {};
    dims.forEach((_, i) => { if (i < dims.length - target) fa[i] = 0; });
    return fa;
  });

  // For 4D+, determine if we show 2D or 3D based on free axes
  const freeAxes = dims ? dims.map((_, i) => i).filter(i => !(i in fixedAxes)) : [];
  const [viewMode, setViewMode] = useState(() => ndim === 2 ? '2d' : ndim === 3 ? '3d' : '3d');

  // Force correct mode when free axes count changes
  useEffect(() => {
    if (freeAxes.length === 2) setViewMode('2d');
    else if (freeAxes.length >= 3) setViewMode('3d');
  }, [freeAxes.length]);

  // Compute display data
  const displayData = useMemo(() => {
    if (!tensor || !dims) return null;

    // Attempt 2D
    if (viewMode === '2d' || freeAxes.length === 2) {
      const result = sliceTo2D(tensor, dims, fixedAxes);
      if (result) return { kind: '2d', ...result };
    }

    // Attempt 3D
    if (viewMode === '3d' || freeAxes.length >= 3) {
      const result = sliceTo3D(tensor, dims, fixedAxes);
      if (result) return { kind: '3d', ...result };
    }

    return null;
  }, [tensor, dims, fixedAxes, viewMode, freeAxes.length]);

  // Global min/max across all values for consistent colour scale
  const [gMin, gMax] = useMemo(() => {
    if (!tensor) return [0, 1];
    const flat = flatten(tensor).filter(v => !isNaN(v));
    if (!flat.length) return [0, 1];
    return [Math.min(...flat), Math.max(...flat)];
  }, [tensor]);

  // Axis labels from metadata
  const axisLabels = useMemo(() => {
    const meta = dataset?.metadata;
    const m = typeof meta === 'string' ? (() => { try { return JSON.parse(meta); } catch { return null; } })() : meta;
    return {
      x: m?.data?.columns ?? m?.feature_headers ?? null,
      y: m?.data?.row_labels ?? null,
    };
  }, [dataset]);

  const hasData = tensor && dims;
  const is4Plus  = ndim && ndim >= 4;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col w-full max-w-5xl rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1a2540 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          maxHeight: '92vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
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
          <div className="flex items-center gap-2">
            {/* View toggle (visible only when natural free axes allow both) */}
            {ndim >= 3 && freeAxes.length >= 2 && (
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                {freeAxes.length >= 2 && (
                  <button
                    className={`px-3 py-1.5 text-xs transition-colors ${viewMode === '2d' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    onClick={() => setViewMode('2d')}
                  >2D</button>
                )}
                {freeAxes.length >= 3 && (
                  <button
                    className={`px-3 py-1.5 text-xs transition-colors ${viewMode === '3d' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    onClick={() => setViewMode('3d')}
                  >3D</button>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* No data fallback */}
          {!hasData && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
              <Info className="w-10 h-10 opacity-40" />
              <p className="text-sm">
                {!tensor
                  ? 'Os dados numéricos deste dataset ainda não foram carregados ou este tipo de dataset não suporta visualização matricial.'
                  : 'Dimensões do dataset não encontradas nos metadados.'}
              </p>
              <p className="text-xs text-slate-600">
                Import the dataset via CSV to populate the data matrix.
              </p>
            </div>
          )}

          {/* 4D+ dimension selector */}
          {hasData && is4Plus && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Selecionar dimensões fixas
              </p>
              <AxisSelector
                dims={dims}
                fixedAxes={fixedAxes}
                onChange={setFixedAxes}
                freeCount={viewMode === '2d' ? 2 : 3}
              />
              <p className="text-xs text-slate-500">
                {Object.keys(fixedAxes).length} dimensão{Object.keys(fixedAxes).length !== 1 ? 'ões' : ''} fixada{Object.keys(fixedAxes).length !== 1 ? 's' : ''}&nbsp;·&nbsp;
                {freeAxes.length} livre{freeAxes.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* 2D Heatmap */}
          {hasData && displayData?.kind === '2d' && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Mapa de Calor — {displayData.rows} × {displayData.cols}
                </span>
                {(displayData.rows > CELL_MAX || displayData.cols > CELL_MAX) && (
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Amostrado para visualização
                  </span>
                )}
              </div>
              <HeatMap2D
                matrix={displayData.matrix}
                rows={displayData.rows}
                cols={displayData.cols}
                axisLabels={axisLabels}
              />
            </div>
          )}

          {/* 3D Voxel */}
          {hasData && displayData?.kind === '3d' && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Cubo de Dados — {displayData.sizes.join(' × ')}
                </span>
                {displayData.values.length > 2000 && (
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    {displayData.values.length.toLocaleString()} voxels (renderizando 2 000)
                  </span>
                )}
              </div>
              <Heatmap3D
                values={displayData.values}
                sizes={displayData.sizes}
                gMin={gMin}
                gMax={gMax}
              />
            </div>
          )}

          {/* Not enough free axes */}
          {hasData && !displayData && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-500">
              <p className="text-sm">
                Selecione dimensões para fixar de modo a deixar {viewMode === '2d' ? '2' : '3'} dimensão{viewMode !== '2d' ? 'ões livres' : ' livre'}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
