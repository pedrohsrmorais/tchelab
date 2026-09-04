// spectra.$id.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, BarChart2, Table, Plus, Trash2,
  Lock, Globe, Loader2, X, Check, Pencil, Save,
} from "lucide-react";
import { Card, Badge, Button, PageHeader, Field, Input, Select } from "@/components/ui-kit";
import { spectraApi, datasetsApi } from "@/lib/api";
import type { Spectrum, Dataset } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TECHNIQUE_BADGE } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/spectra/$id")({
  head: () => ({ meta: [{ title: "Espectro — TcheLab" }] }),
  component: Page,
});

type ViewMode = "chart" | "table";

// Técnicas cujo eixo X é convencionalmente plotado decrescente
const INVERTED_X_UNITS = new Set(["cm-1"]);

// ─── Page ─────────────────────────────────────────────────────────────────────

function Page() {
  const { t }    = useTranslation();
  const { id }   = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [spectrum,    setSpectrum]    = useState<Spectrum | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [viewMode,    setViewMode]    = useState<ViewMode>("chart");
  const [editingMeta, setEditingMeta] = useState(false);
  const [addingDs,    setAddingDs]    = useState(false);

  // Campos editáveis
  const [editName,    setEditName]    = useState("");
  const [editClass,   setEditClass]   = useState("");
  const [editDesc,    setEditDesc]    = useState("");
  const [editRefVal,  setEditRefVal]  = useState("");
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    spectraApi.get(id)
      .then(({ data }) => {
        setSpectrum(data);
        setEditName(data.name);
        setEditClass(data.sample_class ?? "");
        setEditDesc(data.description ?? "");
        setEditRefVal(data.reference_value != null ? String(data.reference_value) : "");
      })
      .catch(() => {
        toast.error(t("spectrumDetail.notFound"));
        navigate({ to: "/spectra" });
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSaveMeta() {
    if (!spectrum) return;
    setSaving(true);
    try {
      const { data } = await spectraApi.update(id, {
        name:            editName.trim() || spectrum.name,
        description:     editDesc.trim() || undefined,
        sample_class:    editClass.trim() || undefined,
        reference_value: editRefVal !== "" ? parseFloat(editRefVal) : undefined,
      });
      setSpectrum(data);
      setEditingMeta(false);
      toast.success(t("spectrumDetail.updated"));
    } catch {
      toast.error(t("spectrumDetail.updateError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("spectrumDetail.confirmDelete", { name: spectrum?.name }))) return;
    try {
      await spectraApi.delete(id);
      toast.success(t("spectrumDetail.removed"));
      navigate({ to: "/spectra" });
    } catch { toast.error(t("spectrumDetail.removeError")); }
  }

  const isOwner = !!user && !!spectrum && spectrum.user_id === user.id;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!spectrum) return null;

  return (
    <>
      <PageHeader
        title={spectrum.name}
        subtitle={`${spectrum.technique} · ${spectrum.x_unit} / ${spectrum.y_unit} · ${spectrum.x_points} ${t("common.points")}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/spectra" })}>
              <ArrowLeft className="h-4 w-4" /> {t("common.back")}
            </Button>
            {isOwner && !editingMeta && (
              <Button variant="outline" size="sm" onClick={() => setEditingMeta(true)}>
                <Pencil className="h-4 w-4" /> {t("common.edit")}
              </Button>
            )}
            {isOwner && (
              <Button variant="ghost" size="sm"
                className="text-destructive hover:text-destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        }
      />

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-6">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${TECHNIQUE_BADGE[spectrum.technique] ?? TECHNIQUE_BADGE["Other"]}`}>
          {spectrum.technique}
        </span>
        <Badge tone={spectrum.visibility === "public" ? "success" : "neutral"}>
          {spectrum.visibility === "public"
            ? <><Globe className="h-3 w-3 inline mr-1" />{t("common.public")}</>
            : <><Lock className="h-3 w-3 inline mr-1" />{t("common.private")}</>}
        </Badge>
        <Badge tone="neutral">{spectrum.source}</Badge>
        {spectrum.sample_class && <Badge tone="primary">{spectrum.sample_class}</Badge>}
        {spectrum.reference_value != null && (
          <Badge tone="neutral">{t("spectrumDetail.refBadge", { value: spectrum.reference_value })}</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Coluna principal: gráfico + tabela ──────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Toggle modo */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
            <button
              onClick={() => setViewMode("chart")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "chart"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart2 className="h-3.5 w-3.5" /> {t("spectrumDetail.chartTab")}
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Table className="h-3.5 w-3.5" /> {t("spectrumDetail.tableTab")}
            </button>
          </div>

          {viewMode === "chart" ? (
            <Card className="p-4">
              <SpectrumChart
                xValues={spectrum.x_values}
                yValues={spectrum.y_values}
                xUnit={spectrum.x_unit}
                yUnit={spectrum.y_unit}
                technique={spectrum.technique}
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">#</th>
                      <th className="text-right px-4 py-2.5 font-medium">{spectrum.x_unit}</th>
                      <th className="text-right px-4 py-2.5 font-medium">{spectrum.y_unit}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spectrum.x_values.map((x, i) => (
                      <tr key={i} className={`border-t border-border ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="px-4 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-1.5 text-right font-mono">{x}</td>
                        <td className="px-4 py-1.5 text-right font-mono">{spectrum.y_values[i]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* ── Coluna lateral: info + edição + datasets ─────────────── */}
        <div className="space-y-4">

          {/* Info / Edição */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-sm">{t("spectrumDetail.info.title")}</h2>
              {editingMeta && (
                <button onClick={() => setEditingMeta(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {editingMeta ? (
              <div className="space-y-3">
                <Field label={t("spectrumDetail.info.name")}>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </Field>
                <Field label={t("spectrumDetail.info.class")}>
                  <Input value={editClass} onChange={(e) => setEditClass(e.target.value)}
                    placeholder={t("spectrumDetail.info.classPlaceholder")} />
                </Field>
                <Field label={t("spectrumDetail.info.notes")}>
                  <textarea
                    value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    placeholder={t("spectrumDetail.info.notesPlaceholder")}
                    className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
                  />
                </Field>
                <Field label={t("spectrumDetail.info.refValue")}>
                  <Input type="number" step="any" value={editRefVal}
                    onChange={(e) => setEditRefVal(e.target.value)}
                    placeholder={t("spectrumDetail.info.refPlaceholder")} />
                </Field>
                <Button className="w-full" onClick={handleSaveMeta} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            ) : (
              <dl className="space-y-2 text-sm">
                <InfoRow k={t("spectrumDetail.info.name")}    v={spectrum.name} />
                <InfoRow k={t("spectrumDetail.info.technique")} v={spectrum.technique} />
                <InfoRow k={t("spectrumDetail.info.xAxis")}    v={spectrum.x_unit} />
                <InfoRow k={t("spectrumDetail.info.yAxis")}    v={spectrum.y_unit} />
                <InfoRow k={t("spectrumDetail.info.points")}   v={spectrum.x_points.toLocaleString()} />
                {spectrum.x_min != null && <InfoRow k={t("spectrumDetail.info.xMin")} v={String(spectrum.x_min)} />}
                {spectrum.x_max != null && <InfoRow k={t("spectrumDetail.info.xMax")} v={String(spectrum.x_max)} />}
                {spectrum.sample_class    && <InfoRow k={t("spectrumDetail.info.class")}     v={spectrum.sample_class} />}
                {spectrum.reference_value != null && <InfoRow k={t("spectrumDetail.info.reference")} v={String(spectrum.reference_value)} />}
                {spectrum.description     && (
                  <div className="pt-1 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">{t("spectrumDetail.info.notes")}</p>
                    <p className="text-xs leading-relaxed">{spectrum.description}</p>
                  </div>
                )}
                {spectrum.reference_values && (
                  <div className="pt-1 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">{t("spectrumDetail.info.references")}</p>
                    {Object.entries(spectrum.reference_values).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                <InfoRow k={t("spectrumDetail.info.source")}       v={spectrum.source} />
                {spectrum.source_filename && <InfoRow k={t("spectrumDetail.info.file")} v={spectrum.source_filename} />}
                <InfoRow k={t("spectrumDetail.info.createdAt")}
                  v={new Date(spectrum.created_at).toLocaleString()} />
              </dl>
            )}
          </Card>

          {/* Adicionar a dataset */}
          {isOwner && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">{t("spectrumDetail.datasetsCard.title")}</h2>
                <Button size="sm" variant="outline" onClick={() => setAddingDs(true)}>
                  <Plus className="h-3.5 w-3.5" /> {t("common.add")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("spectrumDetail.datasetsCard.hint")}
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* ── Modal: adicionar a dataset ────────────────────────────── */}
      {addingDs && spectrum && (
        <AddToDatasetModal
          spectrumId={spectrum.id}
          spectrumTechnique={spectrum.technique}
          onClose={() => setAddingDs(false)}
          onSuccess={() => { setAddingDs(false); toast.success(t("spectrumDetail.addedToDataset")); }}
        />
      )}
    </>
  );
}

// ─── Gráfico interativo do espectro ───────────────────────────────────────────

const TECHNIQUE_LINE_COLOR: Record<string, string> = {
  NIR:          "#378ADD",
  Raman:        "#7F77DD",
  FTIR:         "#BA7517",
  "UV-Vis":     "#1D9E75",
  NMR:          "#D4537E",
  Fluorescence: "#1D9E75",
  Other:        "#888780",
};

function SpectrumChart({
  xValues, yValues, xUnit, yUnit, technique,
}: {
  xValues:   number[];
  yValues:   number[];
  xUnit:     string;
  yUnit:     string;
  technique: string;
}) {
  const { t } = useTranslation();
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const overlayRef  = useRef<HTMLDivElement>(null);
  const [tooltip,   setTooltip]   = useState<{ x: number; y: number; px: number; py: number } | null>(null);

  const [zoomStart, setZoomStart] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const isDragging  = useRef(false);
  const dragStart   = useRef<number>(0);

  const lineColor = TECHNIQUE_LINE_COLOR[technique] ?? "#378ADD";
  const invertX   = INVERTED_X_UNITS.has(xUnit);

  function pixelFracToDataFrac(pixelFrac: number) {
    return invertX ? 1 - pixelFrac : pixelFrac;
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 20, right: 20, bottom: 44, left: 60 };

    ctx.clearRect(0, 0, W, H);

    const idxMin = zoomRange ? Math.max(0, Math.round(zoomRange[0] * (xValues.length - 1))) : 0;
    const idxMax = zoomRange ? Math.min(xValues.length - 1, Math.round(zoomRange[1] * (xValues.length - 1))) : xValues.length - 1;

    const xSlice = xValues.slice(idxMin, idxMax + 1);
    const ySlice = yValues.slice(idxMin, idxMax + 1);

    const xMin = Math.min(xSlice[0], xSlice[xSlice.length - 1]);
    const xMax = Math.max(xSlice[0], xSlice[xSlice.length - 1]);
    const yMin = Math.min(...ySlice);
    const yMax = Math.max(...ySlice);
    const yPad = (yMax - yMin) * 0.06;

    const toCanvasX = (v: number) => {
      const t = (v - xMin) / (xMax - xMin || 1);
      const frac = invertX ? 1 - t : t;
      return PAD.left + frac * (W - PAD.left - PAD.right);
    };
    const toCanvasY = (v: number) => H - PAD.bottom - ((v - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad) || 1)) * (H - PAD.top - PAD.bottom);

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const gridColor  = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const axisColor  = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
    const labelColor = isDark ? "rgba(255,255,255,0.5)"  : "rgba(0,0,0,0.45)";

    const yTicks = 5;
    ctx.font = "11px ui-sans-serif,system-ui,sans-serif";

    for (let i = 0; i <= yTicks; i++) {
      const val = yMin + ((yMax - yMin) / yTicks) * i;
      const cy  = toCanvasY(val);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(W - PAD.right, cy); ctx.stroke();
      ctx.fillStyle   = labelColor;
      ctx.textAlign   = "right";
      ctx.fillText(val.toFixed(0), PAD.left - 6, cy + 4);
    }

    const xTicks = Math.min(8, xSlice.length);
    for (let i = 0; i <= xTicks; i++) {
      const val = xMin + ((xMax - xMin) / xTicks) * i;
      const cx  = toCanvasX(val);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, H - PAD.bottom); ctx.stroke();
      ctx.fillStyle   = labelColor;
      ctx.textAlign   = "center";
      ctx.fillText(val.toFixed(1), cx, H - PAD.bottom + 16);
    }

    ctx.fillStyle = labelColor;
    ctx.textAlign = "center";
    ctx.fillText(xUnit, W / 2, H - 4);

    ctx.save();
    ctx.translate(14, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yUnit, 0, 0);
    ctx.restore();

    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = "round";

    xSlice.forEach((x, i) => {
      const cx = toCanvasX(x);
      const cy = toCanvasY(ySlice[i]);
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    ctx.lineTo(toCanvasX(xSlice[xSlice.length - 1]), toCanvasY(yMin - yPad));
    ctx.lineTo(toCanvasX(xSlice[0]),                  toCanvasY(yMin - yPad));
    ctx.closePath();
    ctx.fillStyle = lineColor + "18";
    ctx.fill();

    ctx.strokeStyle = axisColor;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, H - PAD.bottom);
    ctx.lineTo(W - PAD.right, H - PAD.bottom);
    ctx.stroke();

  }, [xValues, yValues, xUnit, yUnit, lineColor, zoomRange, invertX]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      canvas.getContext("2d")?.scale(window.devicePixelRatio, window.devicePixelRatio);
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const PAD_L = 60; const PAD_R = 20; const PAD_B = 44;
    const relX  = e.clientX - rect.left;

    const idxMin = zoomRange ? Math.max(0, Math.round(zoomRange[0] * (xValues.length - 1))) : 0;
    const idxMax = zoomRange ? Math.min(xValues.length - 1, Math.round(zoomRange[1] * (xValues.length - 1))) : xValues.length - 1;

    if (relX < PAD_L || relX > rect.width - PAD_R) { setTooltip(null); return; }

    const pixelFrac = (relX - PAD_L) / (rect.width - PAD_L - PAD_R);
    const dataFrac  = pixelFracToDataFrac(pixelFrac);
    const idx       = Math.round(idxMin + dataFrac * (idxMax - idxMin));
    const safeIdx   = Math.max(idxMin, Math.min(idxMax, idx));

    const ySlice = yValues.slice(idxMin, idxMax + 1);
    const yMin   = Math.min(...ySlice); const yMax = Math.max(...ySlice);
    const yPad   = (yMax - yMin) * 0.06;
    const relY   = 1 - ((yValues[safeIdx] - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad)));
    const canvasH = rect.height;
    const PAD_T   = 20;
    const plotH   = canvasH - PAD_T - PAD_B;
    const tooltipY = PAD_T + relY * plotH;

    setTooltip({ x: xValues[safeIdx], y: yValues[safeIdx], px: relX, py: tooltipY });
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const PAD_L = 60; const PAD_R = 20;
    const relX  = e.clientX - rect.left;
    if (relX < PAD_L || relX > rect.width - PAD_R) return;
    isDragging.current = true;
    const pixelFrac = (relX - PAD_L) / (rect.width - PAD_L - PAD_R);
    dragStart.current  = pixelFracToDataFrac(pixelFrac);
    setZoomStart(dragStart.current);
  }

  function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    isDragging.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const PAD_L = 60; const PAD_R = 20;
    const relX  = e.clientX - rect.left;
    const pixelFrac = Math.max(0, Math.min(1, (relX - PAD_L) / (rect.width - PAD_L - PAD_R)));
    const endFrac   = pixelFracToDataFrac(pixelFrac);
    const start   = Math.min(dragStart.current, endFrac);
    const end     = Math.max(dragStart.current, endFrac);
    if (end - start > 0.01) {
      setZoomRange([start, end]);
    }
    setZoomStart(null);
  }

  const zoomLabelFrom = zoomRange ? xValues[Math.round(zoomRange[0] * (xValues.length - 1))] : null;
  const zoomLabelTo   = zoomRange ? xValues[Math.round(zoomRange[1] * (xValues.length - 1))] : null;

  return (
    <div className="space-y-2">
      <div
        ref={overlayRef}
        className="relative h-[360px] cursor-crosshair select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ display: "block" }}
        />

        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 bg-card border border-border rounded-lg shadow px-2.5 py-1.5 text-xs font-mono"
            style={{
              left:      tooltip.px + 12,
              top:       tooltip.py - 28,
              transform: tooltip.px > 300 ? "translateX(-120%)" : undefined,
            }}
          >
            <span className="text-muted-foreground mr-1">{xUnit}:</span>
            <span className="font-semibold">{tooltip.x.toFixed(2)}</span>
            <span className="text-muted-foreground mx-1">|</span>
            <span className="text-muted-foreground mr-1">{yUnit}:</span>
            <span className="font-semibold">{tooltip.y.toFixed(2)}</span>
          </div>
        )}

        {tooltip && (
          <div
            className="pointer-events-none absolute top-5 bottom-11 w-px bg-primary/30"
            style={{ left: tooltip.px }}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {zoomRange && zoomLabelFrom != null && zoomLabelTo != null
            ? t("spectrumDetail.chart.zoomLabel", {
                from: Math.min(zoomLabelFrom, zoomLabelTo).toFixed(1),
                to:   Math.max(zoomLabelFrom, zoomLabelTo).toFixed(1),
                unit: xUnit,
              })
            : invertX
            ? t("spectrumDetail.chart.dragZoomInverted")
            : t("spectrumDetail.chart.dragZoom")}
        </span>
        {zoomRange && (
          <button
            onClick={() => setZoomRange(null)}
            className="flex items-center gap-1 text-primary hover:text-primary/70 font-medium transition-colors"
          >
            <X className="h-3 w-3" /> {t("spectrumDetail.chart.resetZoom")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Modal: adicionar a dataset ───────────────────────────────────────────────

function AddToDatasetModal({
  spectrumId, spectrumTechnique, onClose, onSuccess,
}: {
  spectrumId:         number;
  spectrumTechnique:  string;
  onClose:            () => void;
  onSuccess:          () => void;
}) {
  const { t } = useTranslation();
  const [datasets,    setDatasets]    = useState<Dataset[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [selectedId,  setSelectedId]  = useState<string>("");
  const [adding,      setAdding]      = useState(false);

  useEffect(() => {
    datasetsApi.list({ limit: 100 })
      .then(({ data }) => {
        const compatible = data.data.filter((d) => d.technique === spectrumTechnique);
        setDatasets(compatible);
        if (compatible.length > 0) setSelectedId(String(compatible[0].id));
      })
      .catch(() => toast.error(t("common.spectraCount", { count: 0 })))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd() {
    if (!selectedId) return;
    setAdding(true);
    try {
      await datasetsApi.addSpectrum(selectedId, spectrumId);
      onSuccess();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? t("spectrumDetail.addModal.addError");
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-sm p-6 relative">
        <button onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-display font-semibold text-lg mb-1">{t("spectrumDetail.addModal.title")}</h2>
        <p className="text-xs text-muted-foreground mb-5">
          {t("spectrumDetail.addModal.descriptionPrefix")} <strong>{spectrumTechnique}</strong> {t("spectrumDetail.addModal.descriptionSuffix")}
        </p>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : datasets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("spectrumDetail.addModal.noneFound")}<br />
            {t("spectrumDetail.addModal.createFirstPrefix")} <strong>{spectrumTechnique}</strong> {t("spectrumDetail.addModal.createFirstSuffix")}
          </p>
        ) : (
          <Field label={t("spectrumDetail.addModal.datasetLabel")}>
            <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({t("common.spectraCount", { count: d.spectra_count })})
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleAdd} disabled={adding || datasets.length === 0}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {adding ? t("common.adding") : t("common.add")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border pb-1.5 last:border-0">
      <dt className="text-muted-foreground shrink-0 text-xs">{k}</dt>
      <dd className="font-medium text-xs text-right truncate max-w-[160px]" title={v}>{v}</dd>
    </div>
  );
}