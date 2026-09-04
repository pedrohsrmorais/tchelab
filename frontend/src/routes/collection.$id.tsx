// collection.$id.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Trash2, Eye, Database, ChevronLeft, ChevronRight,
  Loader2, X, Check, Globe, Lock, Search, SquareCheckBig,
  Square, AlertTriangle,
} from "lucide-react";
import { Card, Badge, Button, PageHeader, Field, Input, Select } from "@/components/ui-kit";
import { collectionsApi } from "@/lib/api";
import type {
  Collection, CollectionSpectrum, SpectralTechnique, XUnit, YUnit, Visibility,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/collection/$id")({
  head: () => ({ meta: [{ title: "Coleção — TcheLab" }] }),
  component: Page,
});

const TECHNIQUE_DOT: Record<string, string> = {
  NIR: "bg-blue-400", Raman: "bg-violet-400", FTIR: "bg-amber-400",
  "UV-Vis": "bg-emerald-400", NMR: "bg-rose-400",
  Fluorescence: "bg-cyan-400", Other: "bg-zinc-400",
};

const LIMIT = 50;

const TECHNIQUES: SpectralTechnique[] = ["NIR", "Raman", "FTIR", "UV-Vis", "NMR", "Fluorescence", "Other"];
const X_UNITS: XUnit[] = ["nm", "cm-1", "eV", "ppm", "THz"];
const Y_UNITS: YUnit[] = ["Absorbance", "Transmittance", "Reflectance", "Intensity", "Kubelka-Munk", "Other"];

function Page() {
  const { t }    = useTranslation();
  const { id }   = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [collection,  setCollection]  = useState<Collection | null>(null);
  const [spectra,     setSpectra]     = useState<CollectionSpectrum[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [spectraLoad, setSpectraLoad] = useState(true);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [search,      setSearch]      = useState("");

  // Seleção para exportar
  const [selected,    setSelected]    = useState<Set<number>>(new Set());
  const [exportModal, setExportModal] = useState(false);

  useEffect(() => {
    collectionsApi.get(id)
      .then(({ data }) => setCollection(data))
      .catch(() => { toast.error(t("collectionDetail.notFound")); navigate({ to: "/collections" }); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadSpectra(1); }, [id]);

  async function loadSpectra(p: number) {
    setSpectraLoad(true);
    try {
      const { data } = await collectionsApi.getSpectra(id, { page: p, limit: LIMIT });
      setSpectra(data.data);
      setTotal(data.total);
      setPage(p);
    } catch {
      toast.error(t("collectionDetail.loadSpectraError"));
    } finally {
      setSpectraLoad(false);
    }
  }

  async function handleRemove(spectrumId: number, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("collectionDetail.confirmRemove", { name }))) return;
    try {
      await collectionsApi.removeSpectrum(id, spectrumId);
      toast.success(t("collectionDetail.removed"));
      setSpectra((prev) => prev.filter((s) => s.id !== spectrumId));
      setTotal((t) => t - 1);
      setSelected((prev) => { const n = new Set(prev); n.delete(spectrumId); return n; });
      setCollection((c) => c ? { ...c, spectra_count: c.spectra_count - 1 } : c);
    } catch {
      toast.error(t("collectionDetail.removeError"));
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selected.size === filteredSpectra.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredSpectra.map((s) => s.id)));
    }
  }

  const isOwner = !!user && !!collection && collection.user_id === user.id;
  const filteredSpectra = spectra.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(total / LIMIT);
  const allSelected = filteredSpectra.length > 0 && selected.size === filteredSpectra.length;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!collection) return null;

  return (
    <>
      <PageHeader
        title={collection.name}
        subtitle={t("collectionDetail.subtitle", {
          count: collection.spectra_count,
          visibility: collection.visibility === "public" ? t("common.public") : t("common.private"),
        })}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/collections" })}>
              <ArrowLeft className="h-4 w-4" /> {t("common.back")}
            </Button>
            {selected.size > 0 && (
              <Button size="sm" onClick={() => setExportModal(true)}>
                <Database className="h-4 w-4" />
                {t("collectionDetail.exportSelected", { count: selected.size })}
              </Button>
            )}
          </div>
        }
      />

      {/* Badges da coleção */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Badge tone={collection.visibility === "public" ? "success" : "neutral"}>
          {collection.visibility === "public"
            ? <><Globe className="h-3 w-3 inline mr-1" />{t("common.public")}</>
            : <><Lock className="h-3 w-3 inline mr-1" />{t("common.private")}</>}
        </Badge>
        {collection.description && (
          <p className="text-xs text-muted-foreground self-center">{collection.description}</p>
        )}
      </div>

      {/* Barra de busca e seleção */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.searchByName")}
            className="w-full h-9 pl-9 pr-4 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        {filteredSpectra.length > 0 && isOwner && (
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {allSelected
              ? <SquareCheckBig className="h-4 w-4 text-primary" />
              : <Square className="h-4 w-4" />}
            {allSelected ? t("collectionDetail.deselectAll") : t("collectionDetail.selectAll")}
          </button>
        )}
        {selected.size > 0 && (
          <span className="text-xs text-primary font-medium">
            {t("collectionDetail.selectedCount", { count: selected.size })}
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {total > 0 && t("common.spectraCount", { count: total })}
        </span>
      </div>

      {/* Tabela de espectros */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {isOwner && <th className="w-10 px-4 py-3" />}
                <th className="text-left px-5 py-3 font-medium">{t("collectionDetail.columns.name")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("collectionDetail.columns.technique")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("collectionDetail.columns.class")}</th>
                <th className="text-right px-5 py-3 font-medium">{t("collectionDetail.columns.points")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("collectionDetail.columns.units")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("collectionDetail.columns.addedAt")}</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {spectraLoad ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-border animate-pulse">
                    {Array.from({ length: isOwner ? 8 : 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3 w-full rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredSpectra.length === 0 ? (
                <tr>
                  <td colSpan={isOwner ? 8 : 7}>
                    <div className="flex flex-col items-center gap-3 py-14 text-center px-6">
                      <p className="font-semibold text-sm text-muted-foreground">
                        {search ? t("collectionDetail.emptySearch", { search }) : t("collectionDetail.emptyCollection")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("collectionDetail.emptyHint")}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSpectra.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-t border-border transition-colors ${
                      selected.has(s.id) ? "bg-primary/5" : "hover:bg-muted/30"
                    }`}
                  >
                    {isOwner && (
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggleSelect(s.id)}
                          className="accent-primary"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                    )}
                    <td
                      className="px-5 py-3.5 cursor-pointer"
                      onClick={() => navigate({ to: "/spectra/$id", params: { id: String(s.id) } })}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${TECHNIQUE_DOT[s.technique] ?? "bg-zinc-400"}`} />
                        <span className="font-medium truncate max-w-[160px]">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><Badge tone="primary">{s.technique}</Badge></td>
                    <td className="px-5 py-3.5">
                      {s.sample_class
                        ? <Badge tone="neutral">{s.sample_class}</Badge>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">
                      {s.x_points != null ? s.x_points.toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">
                      {s.x_unit} / {s.y_unit}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">
                      {new Date(s.added_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={() => navigate({ to: "/spectra/$id", params: { id: String(s.id) } })}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isOwner && (
                          <Button size="sm" variant="ghost"
                            className="text-destructive/60 hover:text-destructive"
                            onClick={(e) => handleRemove(s.id, s.name, e)}>
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
            <span>{t("collectionDetail.pagination", { total, page, totalPages })}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => loadSpectra(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => loadSpectra(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal exportar para dataset */}
      {exportModal && (
        <ExportDatasetModal
          collectionId={id}
          selectedIds={[...selected]}
          onClose={() => setExportModal(false)}
          onSuccess={(datasetId) => {
            setExportModal(false);
            setSelected(new Set());
            toast.success(t("collectionDetail.datasetCreated"));
            navigate({ to: "/datasets/$id", params: { id: String(datasetId) } });
          }}
        />
      )}
    </>
  );
}

// ─── Modal: exportar seleção para dataset ────────────────────────────────────

function ExportDatasetModal({
  collectionId, selectedIds, onClose, onSuccess,
}: {
  collectionId: string;
  selectedIds:  number[];
  onClose:      () => void;
  onSuccess:    (datasetId: number) => void;
}) {
  const { t } = useTranslation();
  const [name,        setName]        = useState("");
  const [technique,   setTechnique]   = useState<SpectralTechnique>("NIR");
  const [xUnit,       setXUnit]       = useState<XUnit>("nm");
  const [yUnit,       setYUnit]       = useState<YUnit>("Absorbance");
  const [visibility,  setVisibility]  = useState<Visibility>("private");
  const [description, setDescription] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) { toast.error(t("collectionDetail.exportModal.nameRequired")); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await collectionsApi.exportToDataset(collectionId, {
        name: name.trim(),
        technique,
        x_unit:      xUnit,
        y_unit:      yUnit,
        spectrum_ids: selectedIds,
        visibility,
        description: description.trim() || undefined,
      });
      onSuccess(data.dataset.id);
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? t("collectionDetail.exportModal.genericError");
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-display font-semibold text-lg mb-1">{t("collectionDetail.exportModal.title")}</h2>
        <p className="text-xs text-muted-foreground mb-5">
          {t("collectionDetail.exportModal.description", { count: selectedIds.length })}
        </p>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <Field label={t("collectionDetail.exportModal.datasetName")}>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t("collectionDetail.exportModal.datasetNamePlaceholder")} autoFocus />
          </Field>
          <Field label={t("collectionDetail.columns.technique")}>
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
          <Field label={t("collectionDetail.exportModal.descriptionOptional")}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={t("collectionDetail.exportModal.descriptionPlaceholder")} />
          </Field>
          <Field label={t("datasetDetail.info.visibility")}>
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              <option value="private">{t("common.private")}</option>
              <option value="public">{t("common.public")}</option>
            </Select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("common.creating")}</>
              : <><Check className="h-4 w-4" /> {t("collectionList.createModal.title") /* fallback label unused visually */}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}