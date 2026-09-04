// datasets.index.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Database, Plus, Search, Eye, Trash2,
  Globe, Lock, ChevronLeft, ChevronRight, X,
  FolderOpen, AlertTriangle, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, Badge, Button, PageHeader, Field, Select, Input } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { datasetsApi, collectionsApi } from "@/lib/api";
import type {
  Dataset, SpectralTechnique, XUnit, YUnit, Visibility,
  Collection, CollectionSpectrum,
} from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/datasets/")({
  head: () => ({
    meta: [
      { title: "Datasets — TcheLab" },
      { name: "description", content: "Coleções de espectros para análise." },
    ],
  }),
  component: Page,
});

const LIMIT = 20;

const TECHNIQUE_DOT: Record<string, string> = {
  NIR: "bg-blue-400", Raman: "bg-violet-400", FTIR: "bg-amber-400",
  "UV-Vis": "bg-emerald-400", NMR: "bg-rose-400",
  Fluorescence: "bg-cyan-400", Other: "bg-zinc-400",
};

const TECHNIQUES: SpectralTechnique[] = ["NIR", "Raman", "FTIR", "UV-Vis", "NMR", "Fluorescence", "Other"];
const X_UNITS: XUnit[] = ["nm", "cm-1", "eV", "ppm", "THz"];
const Y_UNITS: YUnit[] = ["Absorbance", "Transmittance", "Reflectance", "Intensity", "Kubelka-Munk", "Other"];

// ─── Page ─────────────────────────────────────────────────────────────────────

function Page() {
  const { t }     = useTranslation();
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(1); }, []);

  async function load(p: number) {
    setLoading(true);
    try {
      const { data } = await datasetsApi.list({ page: p, limit: LIMIT });
      setDatasets(data.data);
      setTotal(data.total);
      setPage(p);
    } catch {
      toast.error(t("datasetList.loadError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(d: Dataset, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("datasetList.confirmDelete", { name: d.name }))) return;
    try {
      await datasetsApi.delete(d.id);
      toast.success(t("datasetList.removed"));
      setDatasets((prev) => prev.filter((x) => x.id !== d.id));
      setTotal((t) => t - 1);
    } catch {
      toast.error(t("datasetList.deleteError"));
    }
  }

  const filtered   = datasets.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      <PageHeader
        title={t("datasetList.title")}
        subtitle={t("datasetList.subtitle")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> {t("datasetList.newDataset")}
          </Button>
        }
      />

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.searchByName")}
            className="w-full h-9 pl-9 pr-4 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {total > 0 && t("datasetList.count", { count: total })}
        </span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-medium">{t("datasetList.columns.name")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("datasetList.columns.technique")}</th>
                <th className="text-right px-5 py-3 font-medium">{t("datasetList.columns.spectra")}</th>
                <th className="text-right px-5 py-3 font-medium">{t("datasetList.columns.variables")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("datasetList.columns.units")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("datasetList.columns.access")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("datasetList.columns.createdAt")}</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-border animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5"><div className="h-3 w-full rounded bg-muted" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="flex flex-col items-center gap-4 py-16 text-center px-6">
                      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                        <Database className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          {search ? t("datasetList.emptySearch", { search }) : t("datasetList.emptyTitle")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("datasetList.emptyHint")}
                        </p>
                      </div>
                      {!search && (
                        <Button size="sm" onClick={() => setCreating(true)}>
                          <Plus className="h-4 w-4" /> {t("datasetList.createDataset")}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => navigate({ to: "/datasets/$id", params: { id: String(d.id) } })}
                    className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${TECHNIQUE_DOT[d.technique] ?? "bg-zinc-400"}`} />
                        <span className="font-medium truncate max-w-[180px]">{d.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><Badge tone="primary">{d.technique}</Badge></td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">
                      {d.spectra_count != null ? d.spectra_count.toLocaleString() : "0"}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">
                      {d.x_points != null ? d.x_points.toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">{d.x_unit} / {d.y_unit}</td>
                    <td className="px-5 py-3.5">
                      {d.visibility === "public"
                        ? <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium"><Globe className="h-3 w-3" />{t("common.public")}</span>
                        : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" />{t("common.private")}</span>}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={() => navigate({ to: "/datasets/$id", params: { id: String(d.id) } })}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {user && d.user_id === user.id && (
                          <Button size="sm" variant="ghost"
                            className="text-destructive/60 hover:text-destructive"
                            onClick={(e) => handleDelete(d, e)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted-foreground">
            <span>{t("datasetList.pagination", { total, page, totalPages })}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => load(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => load(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {creating && (
        <CreateDatasetModal
          onClose={() => setCreating(false)}
          onSuccess={(newDataset) => {
            setCreating(false);
            setDatasets((prev) => [newDataset, ...prev]);
            setTotal((t) => t + 1);
            navigate({ to: "/datasets/$id", params: { id: String(newDataset.id) } });
          }}
        />
      )}
    </>
  );
}

// ─── Modal: criar dataset ─────────────────────────────────────────────────────

type CreateMode = "collection" | "manual";

function CreateDatasetModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (dataset: Dataset) => void;
}) {
  const { t } = useTranslation();
  const [mode,        setMode]        = useState<CreateMode>("collection");
  const [name,        setName]        = useState("");
  const [technique,   setTechnique]   = useState<SpectralTechnique>("NIR");
  const [xUnit,       setXUnit]       = useState<XUnit>("nm");
  const [yUnit,       setYUnit]       = useState<YUnit>("Absorbance");
  const [description, setDescription] = useState("");
  const [visibility,  setVisibility]  = useState<Visibility>("private");
  const [submitting,  setSubmitting]  = useState(false);

  // Estado do modo coleção
  const [collections,      setCollections]      = useState<Collection[]>([]);
  const [loadingColls,     setLoadingColls]     = useState(true);
  const [selectedCollId,   setSelectedCollId]   = useState<string>("");
  const [collSpectra,      setCollSpectra]      = useState<CollectionSpectrum[]>([]);
  const [loadingSpectra,   setLoadingSpectra]   = useState(false);
  const [showPreview,      setShowPreview]      = useState(false);
  const [compatWarning,    setCompatWarning]    = useState<string | null>(null);

  // Carrega coleções ao montar
  useEffect(() => {
    collectionsApi.listMine({ limit: 100 })
      .then(({ data }) => {
        setCollections(data.data);
        if (data.data.length > 0) setSelectedCollId(String(data.data[0].id));
      })
      .catch(() => {})
      .finally(() => setLoadingColls(false));
  }, []);

  // Carrega espectros da coleção selecionada para preview e validação
  useEffect(() => {
    if (!selectedCollId || mode !== "collection") return;
    setLoadingSpectra(true);
    setCompatWarning(null);
    setCollSpectra([]);
    collectionsApi.getSpectra(selectedCollId, { limit: 5000 })
      .then(({ data }) => {
        setCollSpectra(data.data);
        // Checa homogeneidade de técnica/unidades
        const techniques = [...new Set(data.data.map((s) => s.technique))];
        const xUnits     = [...new Set(data.data.map((s) => s.x_unit))];
        const yUnits     = [...new Set(data.data.map((s) => s.y_unit))];
        const xPoints    = [...new Set(data.data.map((s) => s.x_points).filter(Boolean))];
        if (techniques.length > 1) {
          setCompatWarning(t("datasetList.createModal.warningMultipleTechniques", {
            count: techniques.length, list: techniques.join(", "),
          }));
        } else if (xPoints.length > 1) {
          setCompatWarning(t("datasetList.createModal.warningDifferentPoints", {
            list: xPoints.join(", "),
          }));
        } else {
          // Pré-preenche campos com os valores detectados
          if (techniques[0]) setTechnique(techniques[0] as SpectralTechnique);
          if (xUnits[0])     setXUnit(xUnits[0] as XUnit);
          if (yUnits[0])     setYUnit(yUnits[0] as YUnit);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSpectra(false));
  }, [selectedCollId, mode]);

  // Pré-preenche o nome com o nome da coleção escolhida
  useEffect(() => {
    if (mode !== "collection" || !selectedCollId) return;
    const coll = collections.find((c) => String(c.id) === selectedCollId);
    if (coll && !name) setName(coll.name);
  }, [selectedCollId, mode, collections]);

  const selectedColl = collections.find((c) => String(c.id) === selectedCollId);

  // IDs dos espectros compatíveis (mesma técnica/unidades que os campos selecionados)
  const compatibleIds = collSpectra
    .filter((s) => s.technique === technique && s.x_unit === xUnit && s.y_unit === yUnit)
    .map((s) => s.id);

  async function handleSubmit() {
    if (!name.trim()) { toast.error(t("datasetList.createModal.nameRequired")); return; }

    setSubmitting(true);
    try {
      if (mode === "collection" && selectedCollId) {
        // Usa o endpoint export-dataset que cria e popula em uma transação
        if (compatibleIds.length === 0) {
          toast.error(t("datasetList.createModal.noCompatibleSpectra"));
          setSubmitting(false);
          return;
        }
        const { data } = await collectionsApi.exportToDataset(selectedCollId, {
          name:         name.trim(),
          technique,
          x_unit:       xUnit,
          y_unit:       yUnit,
          spectrum_ids: compatibleIds,
          visibility,
          description:  description.trim() || undefined,
        });
        toast.success(t("datasetList.createModal.createdWithCount", { count: compatibleIds.length }));
        onSuccess(data.dataset);
      } else {
        // Modo manual: cria dataset vazio
        const { data } = await datasetsApi.create({
          name: name.trim(), technique, x_unit: xUnit, y_unit: yUnit,
          description: description.trim() || undefined, visibility,
        });
        toast.success(t("datasetList.createModal.created"));
        onSuccess(data.dataset);
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? t("datasetList.createModal.createError");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-lg p-6 relative max-h-[92vh] overflow-y-auto">
        <button onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-display font-semibold text-lg mb-1">{t("datasetList.createModal.title")}</h2>
        <p className="text-xs text-muted-foreground mb-5">
          {t("datasetList.createModal.subtitle")}
        </p>

        {/* ── Seletor de modo ── */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <button
            onClick={() => setMode("collection")}
            className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors ${
              mode === "collection"
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <FolderOpen className={`h-4 w-4 ${mode === "collection" ? "text-primary" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">{t("datasetList.createModal.modeCollection")}</span>
              <span className="ml-auto text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                {t("datasetList.createModal.modeCollectionRecommended")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {t("datasetList.createModal.modeCollectionDesc")}
            </p>
          </button>

          <button
            onClick={() => setMode("manual")}
            className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors ${
              mode === "manual"
                ? "border-border bg-muted/40 ring-1 ring-border"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <Database className={`h-4 w-4 ${mode === "manual" ? "text-foreground" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">{t("datasetList.createModal.modeManual")}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {t("datasetList.createModal.modeManualDesc")}
            </p>
          </button>
        </div>

        {/* ── Modo coleção: seletor ── */}
        {mode === "collection" && (
          <div className="mb-4">
            {loadingColls ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("datasetList.createModal.loadingCollections")}
              </div>
            ) : collections.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
                <span>
                  {t("datasetList.createModal.noCollectionsWarning")}
                </span>
              </div>
            ) : (
              <Field label={t("datasetList.createModal.sourceCollection")}>
                <select
                  value={selectedCollId}
                  onChange={(e) => { setSelectedCollId(e.target.value); setName(""); }}
                  className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  {collections.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {t("datasetList.createModal.collectionOption", { name: c.name, count: c.spectra_count })}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {/* Preview dos espectros da coleção */}
            {selectedCollId && (
              <div className="mt-3">
                {loadingSpectra ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("datasetList.createModal.loadingSpectra")}
                  </div>
                ) : (
                  <>
                    {compatWarning && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-400 mb-3">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                        <span>{compatWarning}</span>
                      </div>
                    )}

                    {collSpectra.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowPreview((v) => !v)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
                      >
                        {showPreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {showPreview ? t("datasetList.createModal.hidePreview") : t("datasetList.createModal.showPreview")}
                        {" "}
                        {t("datasetList.createModal.previewSpectraCount", { count: collSpectra.length })}
                        {compatibleIds.length !== collSpectra.length && (
                          <span className="text-amber-600 dark:text-amber-400">
                            {t("datasetList.createModal.compatibleCount", { count: compatibleIds.length })}
                          </span>
                        )}
                      </button>
                    )}

                    {showPreview && collSpectra.length > 0 && (
                      <div className="rounded-lg border border-border overflow-hidden mb-3">
                        <div className="max-h-40 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/60 text-muted-foreground sticky top-0">
                              <tr>
                                <th className="text-left px-3 py-1.5 font-medium">{t("datasetList.createModal.previewColumns.name")}</th>
                                <th className="text-left px-3 py-1.5 font-medium">{t("datasetList.createModal.previewColumns.technique")}</th>
                                <th className="text-left px-3 py-1.5 font-medium">{t("datasetList.createModal.previewColumns.class")}</th>
                                <th className="text-right px-3 py-1.5 font-medium">{t("datasetList.createModal.previewColumns.points")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {collSpectra.map((s, i) => {
                                const isCompat = s.technique === technique && s.x_unit === xUnit && s.y_unit === yUnit;
                                return (
                                  <tr key={s.id} className={`border-t border-border ${!isCompat ? "opacity-40" : i % 2 === 1 ? "bg-muted/20" : ""}`}>
                                    <td className="px-3 py-1 font-medium truncate max-w-[120px]">{s.name}</td>
                                    <td className="px-3 py-1 text-muted-foreground">{s.technique}</td>
                                    <td className="px-3 py-1 text-muted-foreground">{s.sample_class ?? "—"}</td>
                                    <td className="px-3 py-1 text-right font-mono">{s.x_points ?? "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Campos comuns ── */}
        <div className="space-y-3">
          <Field label={t("datasetList.createModal.datasetName")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("datasetList.createModal.datasetNamePlaceholder")}
              autoFocus={mode === "manual"}
            />
          </Field>

          <Field label={t("datasetList.createModal.technique")}>
            <Select value={technique} onChange={(e) => setTechnique(e.target.value as SpectralTechnique)}>
              {TECHNIQUES.map((tq) => <option key={tq} value={tq}>{tq}</option>)}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="X">
              <Select value={xUnit} onChange={(e) => setXUnit(e.target.value as XUnit)}>
                {X_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="Y">
              <Select value={yUnit} onChange={(e) => setYUnit(e.target.value as YUnit)}>
                {Y_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
          </div>

          <Field label={t("datasetList.createModal.descriptionOptional")}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={t("datasetList.createModal.descriptionPlaceholder")} />
          </Field>

          <Field label={t("datasetList.createModal.visibility")}>
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              <option value="private">{t("common.private")}</option>
              <option value="public">{t("common.public")}</option>
            </Select>
          </Field>
        </div>

        {/* Resumo do que será criado */}
        {mode === "collection" && selectedCollId && !loadingSpectra && compatibleIds.length > 0 && (
          <div className="mt-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">
            <span className="font-medium">{t("datasetList.createModal.readyBannerLabel")}</span>{" "}
            {t("datasetList.createModal.readyBanner", { count: compatibleIds.length, name: selectedColl?.name ?? "" })}
          </div>
        )}

        {mode === "manual" && (
          <p className="text-xs text-muted-foreground mt-4">
            {t("datasetList.createModal.manualHint")}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t("common.cancel")}</Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              (mode === "collection" && (collections.length === 0 || compatibleIds.length === 0 || loadingSpectra))
            }
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("datasetList.createModal.creating")}</>
              : mode === "collection"
              ? t("datasetList.createModal.createWithCount", { count: compatibleIds.length })
              : t("datasetList.createModal.createDataset") ?? t("datasetList.createDataset")}
          </Button>
        </div>
      </div>
    </div>
  );
}