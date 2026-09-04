// datasets.$id.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Download, Trash2, Lock, Globe, Loader2,
  Plus, X, Search, FlaskConical, Waves, Layers, FileDown,
  GraduationCap, TestTube2, Eraser, ArrowRight,
} from "lucide-react";
import { Card, Badge, Button, PageHeader, Field, Input, Select } from "@/components/ui-kit";
import { datasetsApi, spectraApi } from "@/lib/api";
import type { Dataset, DatasetSpectrum, SpectrumSummary, DatasetSpectrumRole } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/datasets/$id")({
  head: () => ({ meta: [{ title: "Dataset — TcheLab" }] }),
  component: Page,
});

const INVERTED_X_UNITS = new Set(["cm-1"]);

const CLASS_COLORS = [
  "#378ADD", "#7F77DD", "#1D9E75", "#D4537E", "#BA7517",
  "#888780", "#E07B39", "#5BAD8F", "#9B59B6", "#2ECC71",
];

const MANY_SPECTRA_THRESHOLD = 80;
const STRIDE_OPTIONS = [1, 2, 3, 5, 10, 20];

type ChartMode = "overlay" | "mean";

function Page() {
  const { t }    = useTranslation();
  const { id }   = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const ROLE_BADGE: Record<DatasetSpectrumRole, { label: string; tone: "primary" | "success" | "neutral" }> = {
    train:      { label: t("datasetDetail.roles.train"),      tone: "primary" },
    test:       { label: t("datasetDetail.roles.test"),       tone: "success" },
    unassigned: { label: t("datasetDetail.roles.unassigned"), tone: "neutral" },
  };

  const [dataset,    setDataset]    = useState<Dataset | null>(null);
  const [spectra,    setSpectra]    = useState<DatasetSpectrum[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [exporting,  setExporting]  = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [addingOpen, setAddingOpen] = useState(false);
  const [visTab,     setVisTab]     = useState<"spectra" | "info">("spectra");

  const [chartMode,     setChartMode]     = useState<ChartMode>("overlay");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [stride,        setStride]        = useState(1);
  const [chartCanvas,   setChartCanvas]   = useState<HTMLCanvasElement | null>(null);

  const [search,       setSearch]       = useState("");
  const [activeClasses, setActiveClasses] = useState<Set<string> | null>(null);

  const [selected,        setSelected]        = useState<Set<number>>(new Set());
  const lastClickedIndex  = useRef<number | null>(null);
  const [assigningRole,   setAssigningRole]   = useState(false);
  const [rangeFrom,       setRangeFrom]       = useState("");
  const [rangeTo,         setRangeTo]         = useState("");

  useEffect(() => {
    Promise.all([
      datasetsApi.get(id),
      datasetsApi.getSpectra(id),
    ])
      .then(([dsRes, spRes]) => {
        setDataset(dsRes.data);
        setSpectra(spRes.data.data);
        if (spRes.data.data.length > MANY_SPECTRA_THRESHOLD) setChartMode("mean");
      })
      .catch(() => { toast.error(t("datasetDetail.notFound")); navigate({ to: "/datasets" }); })
      .finally(() => setLoading(false));
  }, [id]);

  async function reloadSpectra() {
    const { data } = await datasetsApi.getSpectra(id);
    setSpectra(data.data);
    setDataset((d) => d ? { ...d, spectra_count: data.spectra_count } : d);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { data } = await datasetsApi.export(id);
      const url  = URL.createObjectURL(data as Blob);
      const link = document.createElement("a");
      link.href = url; link.download = `${dataset?.name ?? "dataset"}.xlsx`; link.click();
      URL.revokeObjectURL(url);
    } catch { toast.error(t("datasetDetail.exportError")); }
    finally { setExporting(false); }
  }

  async function handleDelete() {
    if (!confirm(t("datasetDetail.confirmDelete", { name: dataset?.name }))) return;
    try {
      await datasetsApi.delete(id);
      toast.success(t("datasetDetail.removed"));
      navigate({ to: "/datasets" });
    } catch { toast.error(t("datasetDetail.deleteError")); }
  }

  async function handleVisibility(v: "public" | "private") {
    if (!dataset) return;
    try {
      await datasetsApi.update(id, { visibility: v });
      setDataset((d) => d ? { ...d, visibility: v } : d);
      toast.success(v === "public" ? t("datasetDetail.published") : t("datasetDetail.madePrivate"));
    } catch { toast.error(t("datasetDetail.visibilityError")); }
  }

  async function handleRemoveSpectrum(spectrumId: number, name: string) {
    if (!confirm(t("datasetDetail.confirmRemoveSpectrum", { name }))) return;
    try {
      await datasetsApi.removeSpectrum(id, spectrumId);
      toast.success(t("datasetDetail.spectrumRemoved"));
      reloadSpectra();
    } catch { toast.error(t("datasetDetail.removeSpectrumError")); }
  }

  // ── Exportação PDF do gráfico ──────────────────────────────────────────

  async function handleExportPdf() {
    if (!chartCanvas || !dataset) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const imgData = chartCanvas.toDataURL("image/png", 1.0);
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 40;

      doc.setFontSize(14);
      doc.setTextColor(20);
      doc.text(dataset.name, margin, margin);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(
        `${dataset.technique} · ${dataset.x_unit} / ${dataset.y_unit} · ${t("common.spectraCount", { count: spectra.length })} · ${chartMode === "overlay" ? t("datasetDetail.overview.overlayMode") : t("datasetDetail.overview.meanMode")}`,
        margin, margin + 16
      );

      const imgW = pageW - margin * 2;
      const imgH = Math.min((chartCanvas.height / chartCanvas.width) * imgW, pageH - margin * 2 - 90);
      doc.addImage(imgData, "PNG", margin, margin + 32, imgW, imgH);

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text("@tchelab.com-rights-reserved", margin, pageH - 20);
        doc.text(new Date().toLocaleString(), pageW - margin - 120, pageH - 20);
      }

      doc.save(`${dataset.name.replace(/\s+/g, "_")}_spectra.pdf`);
      toast.success(t("datasetDetail.pdfSuccess"));
    } catch (e) {
      toast.error(t("datasetDetail.pdfError"));
    } finally {
      setExportingPdf(false);
    }
  }

  // ── Atribuição de papel (treino/teste) ─────────────────────────────────

  async function handleAssignRole(role: DatasetSpectrumRole) {
    if (selected.size === 0) return;
    setAssigningRole(true);
    try {
      await datasetsApi.updateSpectraRoles(id, [...selected], role);
      if (role === "unassigned") {
        toast.success(t("datasetDetail.roleCleared", { count: selected.size }));
      } else if (role === "train") {
        toast.success(t("datasetDetail.roleAssignedTrain", { count: selected.size }));
      } else {
        toast.success(t("datasetDetail.roleAssignedTest", { count: selected.size }));
      }
      setSelected(new Set());
      await reloadSpectra();
    } catch {
      toast.error(t("datasetDetail.roleAssignError"));
    } finally {
      setAssigningRole(false);
    }
  }

  function handleSelectRange() {
    const from = parseInt(rangeFrom, 10);
    const to   = parseInt(rangeTo, 10);
    if (isNaN(from) || isNaN(to) || from < 1 || to < from) {
      toast.error(t("datasetDetail.invalidRange"));
      return;
    }
    const ids = spectra
      .filter((s) => s.position + 1 >= from && s.position + 1 <= to)
      .map((s) => s.id);
    if (ids.length === 0) {
      toast.error(t("datasetDetail.emptyRange"));
      return;
    }
    setSelected(new Set(ids));
    toast.info(t("datasetDetail.rangeSelected", { count: ids.length }));
  }

  function toggleRowSelect(spectrumId: number, index: number, shiftKey: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedIndex.current != null) {
        const [start, end] = [lastClickedIndex.current, index].sort((a, b) => a - b);
        for (let i = start; i <= end; i++) {
          const s = filteredSpectra[i];
          if (s) next.add(s.id);
        }
      } else {
        next.has(spectrumId) ? next.delete(spectrumId) : next.add(spectrumId);
      }
      return next;
    });
    lastClickedIndex.current = index;
  }

  const isOwner = !!user && !!dataset && dataset.user_id === user.id;

  const uniqueClasses = useMemo(
    () => Array.from(new Set(spectra.map((s) => s.sample_class).filter(Boolean))) as string[],
    [spectra]
  );

  const filteredSpectra = useMemo(() => {
    return spectra.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (activeClasses && s.sample_class && !activeClasses.has(s.sample_class)) return false;
      if (activeClasses && !s.sample_class && !activeClasses.has("__none__")) return false;
      return true;
    });
  }, [spectra, search, activeClasses]);

  const chartableSpectra = useMemo(
    () => filteredSpectra.filter(
      (s): s is DatasetSpectrum & { x_values: number[]; y_values: number[] } =>
        Array.isArray(s.x_values) && Array.isArray(s.y_values) && s.x_values.length > 0
    ),
    [filteredSpectra]
  );

  const decimatedSpectra = useMemo(() => {
    if (stride <= 1) return chartableSpectra;
    return chartableSpectra.map((s) => ({
      ...s,
      x_values: s.x_values.filter((_, i) => i % stride === 0),
      y_values: s.y_values.filter((_, i) => i % stride === 0),
    }));
  }, [chartableSpectra, stride]);

  const roleCounts = useMemo(() => {
    const c = { train: 0, test: 0, unassigned: 0 };
    spectra.forEach((s) => { c[s.role ?? "unassigned"]++; });
    return c;
  }, [spectra]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dataset) return null;

  return (
    <>
      <PageHeader
        title={dataset.name}
        subtitle={`${dataset.technique} · ${dataset.x_unit} / ${dataset.y_unit}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/datasets" })}>
              <ArrowLeft className="h-4 w-4" /> {t("common.back")}
            </Button>
            <Button variant="outline" size="sm"
              onClick={handleExport}
              disabled={exporting || (dataset.spectra_count ?? 0) === 0}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("datasetDetail.header.exportXlsx")}
            </Button>
            {isOwner && (
              <>
                <Button variant="outline" size="sm"
                  onClick={() => handleVisibility(dataset.visibility === "public" ? "private" : "public")}>
                  {dataset.visibility === "public"
                    ? <><Lock className="h-4 w-4" /> {t("datasetDetail.header.makePrivate")}</>
                    : <><Globe className="h-4 w-4" /> {t("datasetDetail.header.publish")}</>}
                </Button>
                <Button variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <Badge tone="primary">{dataset.technique}</Badge>
        <Badge tone="neutral">{dataset.x_unit} / {dataset.y_unit}</Badge>
        <Badge tone={dataset.visibility === "public" ? "success" : "neutral"}>
          {dataset.visibility === "public"
            ? <><Globe className="h-3 w-3 inline mr-1" />{t("common.public")}</>
            : <><Lock className="h-3 w-3 inline mr-1" />{t("common.private")}</>}
        </Badge>
        {dataset.reference_labels && dataset.reference_labels.length > 0 && (
          <Badge tone="neutral">{t("datasetDetail.badges.refBadge", { labels: dataset.reference_labels.join(", ") })}</Badge>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={t("datasetDetail.stats.spectra")}
          value={dataset.spectra_count != null ? dataset.spectra_count.toLocaleString() : "0"}
        />
        <StatCard
          label={t("datasetDetail.stats.variables")}
          value={dataset.x_points != null ? dataset.x_points.toLocaleString() : "—"}
        />
        <StatCard label={t("datasetDetail.stats.xMin")} value={dataset.x_min != null ? String(dataset.x_min) : "—"} />
        <StatCard label={t("datasetDetail.stats.xMax")} value={dataset.x_max != null ? String(dataset.x_max) : "—"} />
      </div>

      {/* ── Barra de status do split treino/teste ── */}
      <Card className="p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <strong>{roleCounts.train}</strong> {t("datasetDetail.splitBar.train")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <strong>{roleCounts.test}</strong> {t("datasetDetail.splitBar.test")}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
            {roleCounts.unassigned} {t("datasetDetail.splitBar.unassigned")}
          </span>
        </div>
        <Button
          size="sm"
          disabled={roleCounts.train === 0}
          onClick={() => navigate({ to: "/modelagem/novo" as any, search: { dataset_id: dataset.id } as any })}
        >
          <GraduationCap className="h-4 w-4" /> {t("datasetDetail.splitBar.goToModeling")} <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(["spectra", "info"] as const).map((tab) => (
          <button key={tab} onClick={() => setVisTab(tab)}
            className={`px-4 h-8 rounded-full text-xs font-medium border transition-colors ${
              visTab === tab ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"
            }`}>
            {tab === "spectra" ? t("datasetDetail.tabs.spectra") : t("datasetDetail.tabs.info")}
          </button>
        ))}
      </div>

      {/* ── Tab: Espectros ────────────────────────────────────────── */}
      {visTab === "spectra" && (
        <div className="space-y-4">

          {/* ── Visão geral: overlay/média + matriz vinculados ── */}
          {chartableSpectra.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-semibold text-sm">{t("datasetDetail.overview.title")}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                    <button
                      onClick={() => setChartMode("overlay")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        chartMode === "overlay" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Waves className="h-3.5 w-3.5" /> {t("datasetDetail.overview.overlayMode")}
                    </button>
                    <button
                      onClick={() => setChartMode("mean")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        chartMode === "mean" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" /> {t("datasetDetail.overview.meanMode")}
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t("datasetDetail.overview.displayLabel")}
                    <select
                      value={stride}
                      onChange={(e) => setStride(Number(e.target.value))}
                      className="h-8 rounded-lg border border-border bg-muted/30 px-2 text-xs focus:outline-none"
                    >
                      {STRIDE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n === 1 ? t("datasetDetail.overview.strideAll") : t("datasetDetail.overview.strideN", { n })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={exportingPdf}>
                    {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                    {t("datasetDetail.overview.pdfButton")}
                  </Button>
                </div>
              </div>

              {/* Filtro de classes */}
              {uniqueClasses.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span className="text-xs text-muted-foreground mr-1">{t("datasetDetail.overview.classesLabel")}</span>
                  {uniqueClasses.map((cls) => {
                    const isOn = !activeClasses || activeClasses.has(cls);
                    return (
                      <button
                        key={cls}
                        onClick={() => {
                          setActiveClasses((prev) => {
                            const all = new Set(uniqueClasses);
                            const base = prev ? new Set(prev) : all;
                            base.has(cls) ? base.delete(cls) : base.add(cls);
                            return base.size === all.size ? null : base;
                          });
                        }}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                          isOn ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground opacity-50"
                        }`}
                      >
                        {cls}
                      </button>
                    );
                  })}
                  {activeClasses && (
                    <button onClick={() => setActiveClasses(null)} className="text-xs text-muted-foreground hover:text-foreground ml-1">
                      {t("datasetDetail.overview.clearClassFilter")}
                    </button>
                  )}
                </div>
              )}

              {chartMode === "overlay" && decimatedSpectra.length > MANY_SPECTRA_THRESHOLD && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  {t("datasetDetail.overview.manySpectraWarning", { count: decimatedSpectra.length })}
                </p>
              )}

              <MultiSpectrumChart
                spectra={decimatedSpectra}
                xUnit={dataset.x_unit}
                yUnit={dataset.y_unit}
                mode={chartMode}
                highlightedId={highlightedId}
                onHighlight={setHighlightedId}
                onCanvasReady={setChartCanvas}
              />
            </Card>
          )}

          {/* ── Matriz de espectros (vinculada ao gráfico acima) ── */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm font-medium">
                  {t("datasetDetail.matrix.countOfTotal", { shown: filteredSpectra.length, total: spectra.length })}
                </p>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("common.searchByName")}
                    className="h-8 pl-8 pr-3 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-ring/20 w-44"
                  />
                </div>
              </div>
              {isOwner && (
                <Button size="sm" onClick={() => setAddingOpen(true)}>
                  <Plus className="h-4 w-4" /> {t("datasetDetail.matrix.addSpectra")}
                </Button>
              )}
            </div>

            {/* Barra de seleção por intervalo de posição + atribuição de papel */}
            {isOwner && spectra.length > 0 && (
              <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border bg-muted/20 flex-wrap">
                <span className="text-xs text-muted-foreground">{t("datasetDetail.matrix.selectSamplesLabel")}</span>
                <input
                  type="number" min={1} value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)}
                  placeholder="1" className="h-7 w-16 rounded border border-border bg-card px-2 text-xs focus:outline-none"
                />
                <span className="text-xs text-muted-foreground">{t("datasetDetail.matrix.to")}</span>
                <input
                  type="number" min={1} value={rangeTo} onChange={(e) => setRangeTo(e.target.value)}
                  placeholder="24" className="h-7 w-16 rounded border border-border bg-card px-2 text-xs focus:outline-none"
                />
                <Button size="sm" variant="outline" onClick={handleSelectRange}>{t("datasetDetail.matrix.select")}</Button>

                <div className="h-4 w-px bg-border mx-1" />

                <span className="text-xs text-muted-foreground">
                  {selected.size > 0 ? t("datasetDetail.matrix.selectedCount", { count: selected.size }) : t("datasetDetail.matrix.noneSelected")}
                </span>
                <Button
                  size="sm" variant="outline" disabled={selected.size === 0 || assigningRole}
                  onClick={() => handleAssignRole("train")}
                >
                  <GraduationCap className="h-3.5 w-3.5" /> {t("datasetDetail.matrix.markTrain")}
                </Button>
                <Button
                  size="sm" variant="outline" disabled={selected.size === 0 || assigningRole}
                  onClick={() => handleAssignRole("test")}
                >
                  <TestTube2 className="h-3.5 w-3.5" /> {t("datasetDetail.matrix.markTest")}
                </Button>
                <Button
                  size="sm" variant="ghost" disabled={selected.size === 0 || assigningRole}
                  onClick={() => handleAssignRole("unassigned")}
                >
                  <Eraser className="h-3.5 w-3.5" /> {t("datasetDetail.matrix.clearRole")}
                </Button>
                {selected.size > 0 && (
                  <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground ml-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    {isOwner && <th className="w-10 px-4 py-3" />}
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">{t("datasetDetail.matrix.columns.name")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("datasetDetail.matrix.columns.class")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("datasetDetail.matrix.columns.role")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("datasetDetail.matrix.columns.points")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("datasetDetail.matrix.columns.references")}</th>
                    {isOwner && <th className="w-12" />}
                  </tr>
                </thead>
                <tbody>
                  {filteredSpectra.length === 0 ? (
                    <tr>
                      <td colSpan={isOwner ? 8 : 6}>
                        <div className="flex flex-col items-center gap-3 py-12 text-center">
                          <FlaskConical className="h-8 w-8 text-muted-foreground" />
                          <p className="text-sm font-medium">
                            {spectra.length === 0
                              ? t("datasetDetail.matrix.emptyDatasetTitle")
                              : t("datasetDetail.matrix.emptyFilterTitle")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {spectra.length === 0
                              ? t("datasetDetail.matrix.emptyDatasetHint")
                              : t("datasetDetail.matrix.emptyFilterHint")}
                          </p>
                          {isOwner && spectra.length === 0 && (
                            <Button size="sm" onClick={() => setAddingOpen(true)}>
                              <Plus className="h-4 w-4" /> {t("datasetDetail.matrix.addSpectra")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSpectra.map((s, index) => {
                      const role = s.role ?? "unassigned";
                      const roleBadge = ROLE_BADGE[role];
                      return (
                        <tr
                          key={s.id}
                          onMouseEnter={() => setHighlightedId(s.id)}
                          onMouseLeave={() => setHighlightedId((h) => (h === s.id ? null : h))}
                          className={`border-t border-border transition-colors ${
                            highlightedId === s.id ? "bg-primary/10" : selected.has(s.id) ? "bg-primary/5" : "hover:bg-muted/30"
                          }`}
                        >
                          {isOwner && (
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selected.has(s.id)}
                                onChange={(e) => toggleRowSelect(s.id, index, (e.nativeEvent as MouseEvent).shiftKey)}
                                className="accent-primary"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{s.position + 1}</td>
                          <td className="px-4 py-3 font-medium">{s.name}</td>
                          <td className="px-4 py-3">
                            {s.sample_class
                              ? <Badge tone="primary">{s.sample_class}</Badge>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={roleBadge.tone}>{roleBadge.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {s.x_points != null ? s.x_points.toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {s.reference_value != null
                              ? String(s.reference_value)
                              : s.reference_values
                              ? Object.entries(s.reference_values).map(([k, v]) => `${k}: ${v}`).join(", ")
                              : "—"}
                          </td>
                          {isOwner && (
                            <td className="px-4 py-3">
                              <Button size="sm" variant="ghost"
                                className="text-destructive/50 hover:text-destructive"
                                onClick={() => handleRemoveSpectrum(s.id, s.name)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Tab: Informações ──────────────────────────────────────── */}
      {visTab === "info" && (
        <Card className="p-6 max-w-lg">
          <dl className="space-y-2 text-sm">
            <Row k={t("datasetDetail.info.name")}          v={dataset.name} />
            <Row k={t("datasetDetail.info.technique")}     v={dataset.technique} />
            <Row k={t("datasetDetail.info.xUnit")}         v={dataset.x_unit} />
            <Row k={t("datasetDetail.info.yUnit")}         v={dataset.y_unit} />
            <Row k={t("datasetDetail.info.spectra")}       v={String(dataset.spectra_count ?? 0)} />
            <Row k={t("datasetDetail.info.variables")}     v={dataset.x_points != null ? String(dataset.x_points) : "—"} />
            {dataset.x_min != null && <Row k={t("datasetDetail.info.xMin")} v={String(dataset.x_min)} />}
            {dataset.x_max != null && <Row k={t("datasetDetail.info.xMax")} v={String(dataset.x_max)} />}
            {dataset.reference_labels && (
              <Row k={t("datasetDetail.info.references")} v={dataset.reference_labels.join(", ")} />
            )}
            <Row k={t("datasetDetail.info.visibility")}  v={dataset.visibility === "public" ? t("common.public") : t("common.private")} />
            <Row k={t("datasetDetail.info.split")}
              v={t("datasetDetail.info.splitValue", { train: roleCounts.train, test: roleCounts.test, unassigned: roleCounts.unassigned })} />
            <Row k={t("datasetDetail.info.createdAt")}   v={new Date(dataset.created_at).toLocaleString()} />
            <Row k={t("datasetDetail.info.updatedAt")}   v={new Date(dataset.updated_at).toLocaleString()} />
          </dl>
        </Card>
      )}

      {/* ── Modal: adicionar espectros ────────────────────────────── */}
      {addingOpen && (
        <AddSpectraModal
          datasetId={id}
          existingIds={spectra.map((s) => s.id)}
          datasetTechnique={dataset.technique}
          onClose={() => setAddingOpen(false)}
          onSuccess={() => { setAddingOpen(false); reloadSpectra(); }}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GRÁFICO MULTI-ESPECTRO (overlay + média±DP), vinculado à tabela via highlightedId
// ══════════════════════════════════════════════════════════════════════════════

interface ChartSpectrum {
  id:            number;
  name:          string;
  sample_class:  string | null;
  x_values:      number[];
  y_values:      number[];
}

function MultiSpectrumChart({
  spectra, xUnit, yUnit, mode, highlightedId, onHighlight, onCanvasReady,
}: {
  spectra:        ChartSpectrum[];
  xUnit:          string;
  yUnit:          string;
  mode:           ChartMode;
  highlightedId:  number | null;
  onHighlight:    (id: number | null) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{ name: string; cls: string | null; px: number; py: number } | null>(null);

  const invertX = INVERTED_X_UNITS.has(xUnit);

  const uniqueClasses = useMemo(
    () => Array.from(new Set(spectra.map((s) => s.sample_class ?? "__none__"))),
    [spectra]
  );
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    uniqueClasses.forEach((c, i) => { m[c] = CLASS_COLORS[i % CLASS_COLORS.length]; });
    return m;
  }, [uniqueClasses]);

  const overlaySeries = useMemo(
    () => spectra.map((s) => ({
      id: s.id,
      name: s.name,
      cls: s.sample_class,
      color: colorMap[s.sample_class ?? "__none__"],
      x: s.x_values,
      y: s.y_values,
    })),
    [spectra, colorMap]
  );

  const meanSeries = useMemo(() => {
    if (mode !== "mean") return [];
    return uniqueClasses.map((cls) => {
      const members = spectra.filter((s) => (s.sample_class ?? "__none__") === cls);
      if (members.length === 0) return null;
      const n = Math.min(...members.map((m) => m.y_values.length));
      const x = members[0].x_values.slice(0, n);
      const mean = new Array(n).fill(0);
      const std  = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        const vals = members.map((m) => m.y_values[i]);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        mean[i] = avg;
        std[i]  = Math.sqrt(vals.reduce((a, b) => a + (b - avg) ** 2, 0) / vals.length);
      }
      return { cls, color: colorMap[cls], x, mean, std, count: members.length };
    }).filter((s): s is NonNullable<typeof s> => s !== null);
  }, [mode, uniqueClasses, spectra, colorMap]);

  const domain = useMemo(() => {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    if (mode === "overlay") {
      overlaySeries.forEach((s) => {
        s.x.forEach((v) => { if (v < xMin) xMin = v; if (v > xMax) xMax = v; });
        s.y.forEach((v) => { if (v < yMin) yMin = v; if (v > yMax) yMax = v; });
      });
    } else {
      meanSeries.forEach((s) => {
        s.x.forEach((v) => { if (v < xMin) xMin = v; if (v > xMax) xMax = v; });
        s.mean.forEach((v, i) => {
          const lo = v - s.std[i]; const hi = v + s.std[i];
          if (lo < yMin) yMin = lo; if (hi > yMax) yMax = hi;
        });
      });
    }
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; }
    return { xMin, xMax, yMin, yMax };
  }, [mode, overlaySeries, meanSeries]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 20, right: 20, bottom: 44, left: 60 };
    ctx.clearRect(0, 0, W, H);

    const { xMin, xMax, yMin, yMax } = domain;
    const yPad = (yMax - yMin) * 0.08 || 1;

    const toX = (v: number) => {
      const t = (v - xMin) / (xMax - xMin || 1);
      const frac = invertX ? 1 - t : t;
      return PAD.left + frac * (W - PAD.left - PAD.right);
    };
    const toY = (v: number) => H - PAD.bottom - ((v - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad) || 1)) * (H - PAD.top - PAD.bottom);

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const gridColor  = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const axisColor  = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
    const labelColor = isDark ? "rgba(255,255,255,0.5)"  : "rgba(0,0,0,0.45)";

    ctx.font = "11px ui-sans-serif,system-ui,sans-serif";
    for (let i = 0; i <= 5; i++) {
      const val = yMin - yPad + ((yMax + yPad) - (yMin - yPad)) / 5 * i;
      const cy  = toY(val);
      ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(W - PAD.right, cy); ctx.stroke();
      ctx.fillStyle = labelColor; ctx.textAlign = "right";
      ctx.fillText(val.toFixed(0), PAD.left - 6, cy + 4);
    }
    const xTicks = 6;
    for (let i = 0; i <= xTicks; i++) {
      const val = xMin + (xMax - xMin) / xTicks * i;
      const cx  = toX(val);
      ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, H - PAD.bottom); ctx.stroke();
      ctx.fillStyle = labelColor; ctx.textAlign = "center";
      ctx.fillText(val.toFixed(1), cx, H - PAD.bottom + 16);
    }
    ctx.fillStyle = labelColor; ctx.textAlign = "center";
    ctx.fillText(xUnit, W / 2, H - 4);
    ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yUnit, 0, 0); ctx.restore();

    if (mode === "overlay") {
      const ordered = highlightedId != null
        ? [...overlaySeries.filter((s) => s.id !== highlightedId), ...overlaySeries.filter((s) => s.id === highlightedId)]
        : overlaySeries;

      ordered.forEach((s) => {
        const isHi = s.id === highlightedId;
        const dimmed = highlightedId != null && !isHi;
        ctx.beginPath();
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = dimmed ? 0.15 : isHi ? 1 : 0.55;
        ctx.lineWidth   = isHi ? 2.2 : 1;
        ctx.lineJoin    = "round";
        s.x.forEach((x, i) => {
          const cx = toX(x); const cy = toY(s.y[i]);
          i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
        });
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    } else {
      meanSeries.forEach((s) => {
        ctx.beginPath();
        s.x.forEach((x, i) => {
          const cx = toX(x); const cy = toY(s.mean[i] + s.std[i]);
          i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
        });
        for (let i = s.x.length - 1; i >= 0; i--) {
          const cx = toX(s.x[i]); const cy = toY(s.mean[i] - s.std[i]);
          ctx.lineTo(cx, cy);
        }
        ctx.closePath();
        ctx.fillStyle = s.color + "22";
        ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = s.color;
        ctx.lineWidth   = 2;
        ctx.lineJoin    = "round";
        s.x.forEach((x, i) => {
          const cx = toX(x); const cy = toY(s.mean[i]);
          i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
        });
        ctx.stroke();
      });
    }

    ctx.strokeStyle = axisColor; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, H - PAD.bottom);
    ctx.lineTo(W - PAD.right, H - PAD.bottom);
    ctx.stroke();
  }, [domain, invertX, mode, overlaySeries, meanSeries, highlightedId, xUnit, yUnit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCanvasReady?.(canvas);
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      canvas.getContext("2d")?.scale(window.devicePixelRatio, window.devicePixelRatio);
      draw();
    });
    ro.observe(canvas);
    return () => { ro.disconnect(); onCanvasReady?.(null); };
  }, [draw, onCanvasReady]);

  useEffect(() => { draw(); }, [draw]);

function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
  if (mode !== "overlay") { setTooltip(null); return; }
  const canvas = canvasRef.current;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const PAD_L = 60, PAD_R = 20, PAD_T = 20, PAD_B = 44;
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  if (mx < PAD_L || mx > rect.width - PAD_R) { setTooltip(null); return; }

  const { xMin, xMax, yMin, yMax } = domain;
  const yPad = (yMax - yMin) * 0.08 || 1;
  const toY = (v: number) => rect.height - PAD_B - ((v - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad) || 1)) * (rect.height - PAD_T - PAD_B);

  type Closest = { id: number; name: string; cls: string | null; dist: number };

  const closest = overlaySeries.reduce<Closest | null>((best, s) => {
    const dataFracRaw = (mx - PAD_L) / (rect.width - PAD_L - PAD_R);
    const dataFrac = invertX ? 1 - dataFracRaw : dataFracRaw;
    const idx = Math.max(0, Math.min(s.x.length - 1, Math.round(dataFrac * (s.x.length - 1))));
    const cy = toY(s.y[idx]);
    const dist = Math.abs(my - cy);
    if (!best || dist < best.dist) {
      return { id: s.id, name: s.name, cls: s.cls, dist };
    }
    return best;
  }, null);

  if (closest && closest.dist < 20) {
    onHighlight(closest.id);
    setTooltip({ name: closest.name, cls: closest.cls, px: mx, py: my });
  } else {
    onHighlight(null);
    setTooltip(null);
  }
}
  return (
    <div className="space-y-3">
      <div
        className="relative h-[340px]"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { onHighlight(null); setTooltip(null); }}
      >
        <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 bg-card border border-border rounded-lg shadow px-2.5 py-1.5 text-xs"
            style={{ left: tooltip.px + 12, top: tooltip.py - 30, transform: tooltip.px > 300 ? "translateX(-120%)" : undefined }}
          >
            <p className="font-semibold">{tooltip.name}</p>
            {tooltip.cls && <p className="text-muted-foreground">{tooltip.cls}</p>}
          </div>
        )}
      </div>

      {uniqueClasses.length > 0 && uniqueClasses[0] !== "__none__" && (
        <div className="flex flex-wrap gap-3 pt-2 border-t border-border text-xs">
          {uniqueClasses.map((cls) => (
            <div key={cls} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colorMap[cls] }} />
              {cls === "__none__" ? t("datasetDetail.overview.noClass") : cls}
              {mode === "mean" && (
                <span className="text-muted-foreground">
                  ({meanSeries.find((m) => m.cls === cls)?.count ?? 0})
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal: adicionar espectros ao dataset ────────────────────────────────────

function AddSpectraModal({
  datasetId, existingIds, datasetTechnique, onClose, onSuccess,
}: {
  datasetId: string;
  existingIds: number[];
  datasetTechnique: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [mySpectra, setMySpectra] = useState<SpectrumSummary[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<Set<number>>(new Set());
  const [adding,    setAdding]    = useState(false);

  useEffect(() => {
    spectraApi.listMine({ limit: 100 })
      .then(({ data }) => setMySpectra(data.data))
      .catch(() => toast.error(t("datasetDetail.addModal.noneFound")))
      .finally(() => setLoading(false));
  }, []);

  const available = mySpectra.filter(
    (s) => !existingIds.includes(s.id) && s.technique === datasetTechnique &&
      s.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setAdding(true);
    let ok = 0;
    for (const spectrumId of selected) {
      try {
        await datasetsApi.addSpectrum(datasetId, spectrumId);
        ok++;
      } catch (e: any) {
        const msg = e?.response?.data?.message ?? "";
        toast.error(`${spectrumId}: ${msg}`);
      }
    }
    if (ok > 0) toast.success(t("datasetDetail.spectraAdded", { count: ok }));
    setAdding(false);
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-lg p-6 relative flex flex-col max-h-[85vh]">
        <button onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-display font-semibold text-lg mb-1">{t("datasetDetail.addModal.title")}</h2>
        <p className="text-xs text-muted-foreground mb-4">
          {t("datasetDetail.addModal.descriptionPrefix")} <strong>{datasetTechnique}</strong>.
          {" "}{t("datasetDetail.addModal.descriptionSuffix")}
        </p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("datasetDetail.addModal.searchPlaceholder")}
            className="w-full h-9 pl-9 pr-4 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none" />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : available.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              {search ? t("datasetDetail.addModal.noneFound") : t("datasetDetail.addModal.noneAvailable", { technique: datasetTechnique })}
            </p>
          ) : (
            available.map((s) => (
              <label key={s.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(s.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                }`}>
                <input type="checkbox" checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)} className="accent-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.x_points != null ? s.x_points : "—"} {t("common.points")}
                    {s.sample_class && ` · ${s.sample_class}`}
                    {s.reference_value != null && ` · ${s.reference_value}`}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? t("datasetDetail.addModal.selectedCount", { count: selected.size }) : t("datasetDetail.addModal.noneSelected")}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button onClick={handleAdd} disabled={adding || selected.size === 0}>
              {adding ? t("common.adding") : t("common.add")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className="font-mono font-semibold text-lg mt-1">{value}</p>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-1.5 last:border-0">
      <dt className="text-muted-foreground shrink-0">{k}</dt>
      <dd className="font-medium text-right truncate">{v}</dd>
    </div>
  );
}