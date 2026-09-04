// spectra.index.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Upload, Clipboard, Search, Eye, Trash2,
  ChevronLeft, ChevronRight, FlaskConical, X, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Loader2, ScanLine, FolderOpen, Plus,
  Filter, Square, SquareCheckBig,
} from "lucide-react";
import { Card, Badge, Button, PageHeader, Field, Select, Input } from "@/components/ui-kit";
import { spectraApi, collectionsApi } from "@/lib/api";
import type {
  SpectrumSummary, SpectralTechnique, XUnit, YUnit, Visibility,
  ScanFileResponse, Collection,
} from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/spectra/")({
  head: () => ({
    meta: [
      { title: "Espectros — TcheLab" },
      { name: "description", content: "Biblioteca de espectros individuais." },
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

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface ParsedSpectrum {
  name:   string;
  text:   string;
  points: number;
}

interface Filters {
  search:         string;
  technique:      string;
  collectionMode: "all" | "none" | "specific";
  collectionId:   string;
  dateFrom:       string;
  dateTo:         string;
}

const EMPTY_FILTERS: Filters = {
  search: "", technique: "", collectionMode: "all",
  collectionId: "", dateFrom: "", dateTo: "",
};

// ─── Parser de paste com múltiplas colunas ────────────────────────────────────

function parseMultiSpectrum(raw: string): ParsedSpectrum[] | null {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const firstLine = lines[0];
  const sep = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";

  function tokenize(line: string): string[] {
    const tokens: string[] = [];
    let cur = "", inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (!inQuote && ch === sep) { tokens.push(cur); cur = ""; continue; }
      cur += ch;
    }
    tokens.push(cur);
    return tokens.map((t) => t.trim());
  }

  function toNum(s: string): number { return parseFloat(s.replace(",", ".")); }

  const header = tokenize(firstLine);
  if (header.length < 2) return null;
  const names = header.slice(1);
  if (!isNaN(toNum(names[0]))) return null;

  const dataLines = lines.slice(1);
  const columns: { x: number; y: number }[][] = names.map(() => []);
  for (const line of dataLines) {
    const tokens = tokenize(line);
    const x = toNum(tokens[0]);
    if (isNaN(x)) continue;
    tokens.slice(1).forEach((v, i) => {
      if (i >= names.length) return;
      const y = toNum(v);
      if (!isNaN(y)) columns[i].push({ x, y });
    });
  }
  return names.map((name, i) => ({
    name, text: columns[i].map(({ x, y }) => `${x},${y}`).join("\n"), points: columns[i].length,
  })).filter((s) => s.points > 0);
}

// ─── Hook: carrega e cria coleções ───────────────────────────────────────────

function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    collectionsApi.listMine({ limit: 100 })
      .then(({ data }) => setCollections(data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createCollection(name: string, visibility: Visibility): Promise<Collection> {
    const { data } = await collectionsApi.create({ name: name.trim(), visibility });
    setCollections((prev) => [data.collection, ...prev]);
    return data.collection;
  }

  return { collections, loading, createCollection };
}

// ─── Componente: seletor de coleção (embutido nos modais) ────────────────────

function CollectionPicker({
  collections,
  loadingCollections,
  selectedId,
  onSelect,
  onCreated,
}: {
  collections:        Collection[];
  loadingCollections: boolean;
  selectedId:         string;
  onSelect:           (id: string) => void;
  onCreated:          (c: Collection) => void;
}) {
  const { t } = useTranslation();
  const [showCreate,    setShowCreate]    = useState(collections.length === 0);
  const [newName,       setNewName]       = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>("private");
  const [creating,      setCreating]      = useState(false);

  useEffect(() => {
    if (!loadingCollections && collections.length === 0) setShowCreate(true);
  }, [loadingCollections, collections.length]);

  async function handleCreate() {
    if (!newName.trim()) { toast.error(t("spectraList.collectionPicker.nameRequired")); return; }
    setCreating(true);
    try {
      const { data } = await collectionsApi.create({ name: newName.trim(), visibility: newVisibility });
      onCreated(data.collection);
      onSelect(String(data.collection.id));
      setNewName("");
      setShowCreate(false);
      toast.success(t("spectraList.collectionPicker.created", { name: data.collection.name }));
    } catch {
      toast.error(t("spectraList.collectionPicker.createError"));
    } finally {
      setCreating(false);
    }
  }

  if (loadingCollections) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("spectraList.collectionPicker.loadingCollections")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!showCreate && collections.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
            className="flex-1 h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            <option value="">{t("spectraList.collectionPicker.selectCollection")}</option>
            {collections.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({t("common.spectraCount", { count: c.spectra_count })})
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {showCreate && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t("spectraList.collectionPicker.newCollection")}</span>
            {collections.length > 0 && (
              <button
                onClick={() => setShowCreate(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder={t("spectraList.collectionPicker.namePlaceholder")}
              autoFocus
              className="flex-1 h-9 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
            <select
              value={newVisibility}
              onChange={(e) => setNewVisibility(e.target.value as Visibility)}
              className="h-9 rounded-lg border border-border bg-muted/30 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
            >
              <option value="private">{t("spectraList.collectionPicker.private")}</option>
              <option value="public">{t("spectraList.collectionPicker.public")}</option>
            </select>
          </div>
          <Button size="sm" onClick={handleCreate} disabled={creating} className="w-full">
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {creating ? t("spectraList.collectionPicker.creating") : t("spectraList.collectionPicker.createCollection")}
          </Button>
        </div>
      )}

      {!showCreate && !selectedId && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t("spectraList.collectionPicker.selectOrCreate")}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Page() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [spectra,     setSpectra]     = useState<SpectrumSummary[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [filters,     setFilters]     = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);

  // Seleção em lote
  const [selected,   setSelected]   = useState<Set<number>>(new Set());
  const [batchModal, setBatchModal]  = useState<"delete" | "collection" | null>(null);

  // Modais de importação
  const [modal, setModal] = useState<"file" | "paste" | null>(null);

  useEffect(() => {
    collectionsApi.listMine({ limit: 100 })
      .then(({ data }) => setCollections(data.data))
      .catch(() => {});
  }, []);

  const load = useCallback(async (p: number, f: Filters) => {
    setLoading(true);
    setSelected(new Set());
    try {
      const params: Record<string, string | number> = { page: p, limit: LIMIT };
      if (f.technique)  params.technique  = f.technique;
      if (f.dateFrom)   params.date_from  = f.dateFrom;
      if (f.dateTo)     params.date_to    = f.dateTo;
      if (f.collectionMode === "none")     params.no_collection  = "true";
      if (f.collectionMode === "specific" && f.collectionId)
                                           params.collection_id  = f.collectionId;
      const { data } = await spectraApi.listMine(params as any);
      setSpectra(data.data);
      setTotal(data.total);
      setPage(p);
    } catch {
      toast.error(t("spectraList.loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, filters); }, []);

  function applyFilters(f: Filters) { setFilters(f); load(1, f); }
  function clearFilters() { setFilters(EMPTY_FILTERS); load(1, EMPTY_FILTERS); }

  const hasActiveFilters =
    filters.technique !== "" || filters.collectionMode !== "all" ||
    filters.dateFrom !== "" || filters.dateTo !== "";

  const filtered = spectra.filter((s) =>
    !filters.search || s.name.toLowerCase().includes(filters.search.toLowerCase())
  );
  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  function toggleSelect(id: number) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((s) => s.id)));
  }

  async function handleDelete(id: number, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("spectraList.confirmDelete", { name }))) return;
    try {
      await spectraApi.delete(id);
      toast.success(t("spectraList.removed"));
      setSpectra((prev) => prev.filter((s) => s.id !== id));
      setTotal((t) => t - 1);
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    } catch { toast.error(t("spectraList.removeError")); }
  }

  function handleImportSuccess(newCollection?: Collection) {
    setModal(null);
    if (fileRef.current) fileRef.current.value = "";
    if (newCollection) {
      setCollections((prev) => {
        const exists = prev.some((c) => c.id === newCollection.id);
        return exists ? prev : [newCollection, ...prev];
      });
    }
    load(1, filters);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      <PageHeader
        title={t("spectraList.title")}
        subtitle={t("spectraList.subtitle")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setModal("paste")}>
              <Clipboard className="h-4 w-4" /> {t("spectraList.pasteText")}
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> {t("spectraList.importFile")}
            </Button>
            <input
              ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) setModal("file"); }}
            />
          </div>
        }
      />

      {/* ── Busca + filtros ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder={t("common.searchByName")}
            className="w-full h-9 pl-9 pr-4 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>

        <Button
          variant={showFilters || hasActiveFilters ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
          className="gap-1.5"
        >
          <Filter className="h-3.5 w-3.5" />
          {t("spectraList.filtersButton")}
          {hasActiveFilters && (
            <span className="ml-0.5 h-4 w-4 rounded-full bg-white/20 text-[10px] flex items-center justify-center font-bold">
              {[filters.technique !== "", filters.collectionMode !== "all", filters.dateFrom !== "" || filters.dateTo !== ""].filter(Boolean).length}
            </span>
          )}
        </Button>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <X className="h-3.5 w-3.5" /> {t("spectraList.clear")}
          </button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {total > 0 && t("spectraList.count", { count: total })}
        </span>
      </div>

      {showFilters && (
        <FilterPanel
          filters={filters}
          collections={collections}
          onChange={applyFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* ── Barra de ações em lote ── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium text-primary">
            {t("spectraList.selectedCount", { count: selected.size })}
          </span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={() => setBatchModal("collection")}>
              <FolderOpen className="h-3.5 w-3.5" /> {t("spectraList.addToCollection")}
            </Button>
            <Button
              size="sm" variant="outline"
              className="text-destructive/70 hover:text-destructive border-destructive/20 hover:border-destructive/40"
              onClick={() => setBatchModal("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("spectraList.remove")}
            </Button>
            <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Tabela ── */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3">
                  <button onClick={toggleAll} className="flex items-center justify-center">
                    {allSelected ? <SquareCheckBig className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                  </button>
                </th>
                <th className="text-left px-5 py-3 font-medium">{t("spectraList.columns.name")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("spectraList.columns.technique")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("spectraList.columns.class")}</th>
                <th className="text-right px-5 py-3 font-medium">{t("spectraList.columns.points")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("spectraList.columns.units")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("spectraList.columns.source")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("spectraList.columns.createdAt")}</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-border animate-pulse">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5"><div className="h-3 w-full rounded bg-muted" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="flex flex-col items-center gap-4 py-16 text-center px-6">
                      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                        <FlaskConical className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          {hasActiveFilters || filters.search ? t("spectraList.emptyFilterTitle") : t("spectraList.emptyTitle")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {hasActiveFilters || filters.search ? t("spectraList.emptyFilterHint") : t("spectraList.emptyHint")}
                        </p>
                      </div>
                      {(hasActiveFilters || filters.search) && (
                        <Button size="sm" variant="outline" onClick={clearFilters}><X className="h-3.5 w-3.5" /> {t("spectraList.clearFilters")}</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-t border-border transition-colors cursor-pointer ${selected.has(s.id) ? "bg-primary/5" : "hover:bg-muted/30"}`}
                    onClick={() => navigate({ to: "/spectra/$id", params: { id: String(s.id) } })}
                  >
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleSelect(s.id)} className="flex items-center justify-center">
                        {selected.has(s.id) ? <SquareCheckBig className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${TECHNIQUE_DOT[s.technique] ?? "bg-zinc-400"}`} />
                        <span className="font-medium truncate max-w-[160px]">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><Badge tone="primary">{s.technique}</Badge></td>
                    <td className="px-5 py-3.5">
                      {s.sample_class ? <Badge tone="neutral">{s.sample_class}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">
                      {s.x_points != null ? s.x_points.toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">{s.x_unit} / {s.y_unit}</td>
                    <td className="px-5 py-3.5"><Badge tone="neutral">{s.source}</Badge></td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={() => navigate({ to: "/spectra/$id", params: { id: String(s.id) } })}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="text-destructive/60 hover:text-destructive"
                          onClick={(e) => handleDelete(s.id, s.name, e)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
            <span>{t("spectraList.pagination", { total, page, totalPages })}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => load(page - 1, filters)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => load(page + 1, filters)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Modais ── */}
      {modal === "file" && (
        <ImportFileModal
          fileRef={fileRef}
          onClose={() => { setModal(null); if (fileRef.current) fileRef.current.value = ""; }}
          onSuccess={handleImportSuccess}
        />
      )}
      {modal === "paste" && (
        <ImportPasteModal
          onClose={() => setModal(null)}
          onSuccess={handleImportSuccess}
        />
      )}
      {batchModal === "delete" && (
        <BatchDeleteModal
          ids={[...selected]}
          onClose={() => setBatchModal(null)}
          onSuccess={() => { setBatchModal(null); setSelected(new Set()); load(1, filters); }}
        />
      )}
      {batchModal === "collection" && (
        <BatchAddToCollectionModal
          spectrumIds={[...selected]}
          collections={collections}
          onClose={() => setBatchModal(null)}
          onSuccess={(c) => {
            setBatchModal(null);
            if (c) setCollections((prev) => prev.some((x) => x.id === c.id) ? prev : [c, ...prev]);
          }}
        />
      )}
    </>
  );
}

// ─── Painel de filtros ────────────────────────────────────────────────────────

function FilterPanel({ filters, collections, onChange, onClose }: {
  filters: Filters; collections: Collection[]; onChange: (f: Filters) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState<Filters>(filters);
  function set<K extends keyof Filters>(k: K, v: Filters[K]) { setLocal((f) => ({ ...f, [k]: v })); }

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("spectraList.filterPanel.title")}</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{t("spectraList.filterPanel.technique")}</label>
          <select value={local.technique} onChange={(e) => set("technique", e.target.value)}
            className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
            <option value="">{t("spectraList.filterPanel.allTechniques")}</option>
            {TECHNIQUES.map((tq) => <option key={tq} value={tq}>{tq}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{t("spectraList.filterPanel.collection")}</label>
          <select value={local.collectionMode} onChange={(e) => set("collectionMode", e.target.value as Filters["collectionMode"])}
            className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
            <option value="all">{t("spectraList.filterPanel.any")}</option>
            <option value="none">{t("spectraList.filterPanel.noCollection")}</option>
            <option value="specific">{t("spectraList.filterPanel.specificCollection")}</option>
          </select>
        </div>
        {local.collectionMode === "specific" && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{t("spectraList.filterPanel.whichCollection")}</label>
            <select value={local.collectionId} onChange={(e) => set("collectionId", e.target.value)}
              className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20">
              <option value="">{t("spectraList.filterPanel.selectEllipsis")}</option>
              {collections.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{t("spectraList.filterPanel.createdFrom")}</label>
          <input type="date" value={local.dateFrom} onChange={(e) => set("dateFrom", e.target.value)}
            className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">{t("spectraList.filterPanel.createdTo")}</label>
          <input type="date" value={local.dateTo} onChange={(e) => set("dateTo", e.target.value)}
            className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button size="sm" variant="outline" onClick={() => { setLocal(EMPTY_FILTERS); onChange(EMPTY_FILTERS); }}>{t("spectraList.clear")}</Button>
        <Button size="sm" onClick={() => onChange(local)}>{t("spectraList.filterPanel.applyFilters")}</Button>
      </div>
    </div>
  );
}

// ─── Modal: importar por arquivo ─────────────────────────────────────────────

type FileModalStep = "scanning" | "confirm" | "importing";

function ImportFileModal({ fileRef, onClose, onSuccess }: {
  fileRef:   React.RefObject<HTMLInputElement | null>;
  onClose:   () => void;
  onSuccess: (newCollection?: Collection) => void;
}) {
  const { t } = useTranslation();
  const file = fileRef.current?.files?.[0];

  const [step,        setStep]        = useState<FileModalStep>("scanning");
  const [scanResult,  setScanResult]  = useState<ScanFileResponse | null>(null);
  const [scanError,   setScanError]   = useState<string | null>(null);
  const [technique,   setTechnique]   = useState<SpectralTechnique>("NIR");
  const [xUnit,       setXUnit]       = useState<XUnit>("nm");
  const [yUnit,       setYUnit]       = useState<YUnit>("Absorbance");
  const [visibility,  setVisibility]  = useState<Visibility>("private");
  const [sampleClass, setSampleClass] = useState("");

  const { collections, loading: loadingCollections, createCollection } = useCollections();
  const [selectedCollId, setSelectedCollId] = useState<string>("");
  const [newlyCreated,   setNewlyCreated]   = useState<Collection | null>(null);

  useEffect(() => {
    if (collections.length > 0 && !selectedCollId) setSelectedCollId(String(collections[0].id));
  }, [collections]);

  useEffect(() => {
    if (!file) return;
    spectraApi.scanFile(file)
      .then(({ data }) => { setScanResult(data); setStep("confirm"); })
      .catch((e) => { setScanError(e?.response?.data?.message ?? t("spectraList.importFileModal.scanErrorDefault")); setStep("confirm"); });
  }, []);

  async function handleSubmit() {
    if (!selectedCollId) { toast.error(t("spectraList.importFileModal.selectCollectionFirst")); return; }
    if (!file) return;
    setStep("importing");
    try {
      const { data } = await spectraApi.importFile({
        file, technique, x_unit: xUnit, y_unit: yUnit,
        visibility, sample_class: sampleClass || undefined,
      });

      const ids = data.spectra?.map((s) => s.id) ?? [];
      let addFail = 0;
      for (const id of ids) {
        try { await collectionsApi.addSpectrum(selectedCollId, id); }
        catch { addFail++; }
      }

      if (addFail > 0) {
        toast.warning(t("spectraList.importFileModal.importPartial", { count: data.spectra_count, fail: addFail }));
      } else {
        toast.success(t("spectraList.importFileModal.importSuccess", { count: data.spectra_count }));
      }
      onSuccess(newlyCreated ?? undefined);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? t("spectraList.importFileModal.importError"));
      setStep("confirm");
    }
  }

  const layout = scanResult?.layout;
  const confidenceColor = { high: "text-emerald-600 dark:text-emerald-400", medium: "text-amber-600 dark:text-amber-400", low: "text-rose-600 dark:text-rose-400" }[layout?.confidence ?? "low"];
  const confidenceLabel = {
    high: t("spectraList.importFileModal.confidence.high"),
    medium: t("spectraList.importFileModal.confidence.medium"),
    low: t("spectraList.importFileModal.confidence.low"),
  }[layout?.confidence ?? "low"];

  return (
    <ModalOverlay onClose={onClose} wide>
      <h2 className="font-display font-semibold text-lg mb-1">{t("spectraList.importFileModal.title")}</h2>
      <p className="text-xs text-muted-foreground mb-5">{t("spectraList.importFileModal.file")} <span className="font-mono">{file?.name}</span></p>

      {step === "scanning" && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <ScanLine className="h-5 w-5 text-muted-foreground animate-pulse" />
          </div>
          <p className="text-sm font-medium">{t("spectraList.importFileModal.scanning")}</p>
          <p className="text-xs text-muted-foreground">{t("spectraList.importFileModal.scanningHint")}</p>
        </div>
      )}

      {step !== "scanning" && (
        <div className="space-y-5">
          {/* Resultado do scan */}
          {layout && !scanError && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">{t("spectraList.importFileModal.formatDetected")}</span>
                </div>
                <span className={`text-xs font-medium ${confidenceColor}`}>{confidenceLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("spectraList.importFileModal.samples")}</span><span className="font-medium">{scanResult!.total_spectra.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("spectraList.importFileModal.pointsPerSpectrum")}</span><span className="font-mono">{layout.x_points.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("spectraList.importFileModal.orientation")}</span><span className="font-medium">{layout.orientation === "samples-as-rows" ? t("spectraList.importFileModal.orientationRows") : t("spectraList.importFileModal.orientationCols")}</span></div>
                {layout.classes_found.length > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("spectraList.importFileModal.classes")}</span><span className="font-medium">{layout.classes_found.join(", ")}</span></div>}
                {layout.sets_found.length > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("spectraList.importFileModal.sets")}</span><span className="font-medium">{layout.sets_found.join(", ")}</span></div>}
              </div>
              {layout.warnings.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/60">
                  {layout.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /><span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              {scanResult!.preview.length > 0 && (
                <div className="pt-1 border-t border-border/60">
                  <p className="text-xs text-muted-foreground mb-1.5">{t("spectraList.importFileModal.previewLabel", { count: scanResult!.preview.length })}</p>
                  <div className="rounded border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium">{t("spectraList.importFileModal.previewName")}</th>
                          <th className="text-left px-3 py-1.5 font-medium">{t("spectraList.importFileModal.previewClass")}</th>
                          <th className="text-right px-3 py-1.5 font-medium font-mono">{t("spectraList.importFileModal.previewXFirst")}</th>
                          <th className="text-right px-3 py-1.5 font-medium font-mono">{t("spectraList.importFileModal.previewXLast")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult!.preview.map((row, i) => (
                          <tr key={i} className={`border-t border-border ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                            <td className="px-3 py-1 font-medium truncate max-w-[120px]">{row.name}</td>
                            <td className="px-3 py-1 text-muted-foreground">{row.sample_class ?? "—"}</td>
                            <td className="px-3 py-1 text-right font-mono">{row.x_first}</td>
                            <td className="px-3 py-1 text-right font-mono">{row.x_last}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {scanError && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
              <span>{scanError} {t("spectraList.importFileModal.scanErrorSuffix")}</span>
            </div>
          )}

          {/* Campos de configuração */}
          <div className="space-y-3">
            <Field label={t("spectraList.importFileModal.technique")}>
              <Select value={technique} onChange={(e) => setTechnique(e.target.value as SpectralTechnique)}>
                {TECHNIQUES.map((tq) => <option key={tq} value={tq}>{tq}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("spectraList.importFileModal.xUnit")}><Select value={xUnit} onChange={(e) => setXUnit(e.target.value as XUnit)}>{X_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</Select></Field>
              <Field label={t("spectraList.importFileModal.yUnit")}><Select value={yUnit} onChange={(e) => setYUnit(e.target.value as YUnit)}>{Y_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</Select></Field>
            </div>
            {(!layout || layout.classes_found.length === 0) && (
              <Field label={t("spectraList.importFileModal.defaultClassOptional")}>
                <Input value={sampleClass} onChange={(e) => setSampleClass(e.target.value)} placeholder={t("spectraList.importFileModal.defaultClassPlaceholder")} />
              </Field>
            )}
            <Field label={t("spectraList.importFileModal.visibility")}>
              <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                <option value="private">{t("common.private")}</option>
                <option value="public">{t("common.public")}</option>
              </Select>
            </Field>
          </div>

          {/* Seleção de coleção — obrigatória */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{t("spectraList.importFileModal.targetCollection")}</span>
              <span className="text-xs text-destructive font-medium">{t("spectraList.importFileModal.required")}</span>
            </div>
            <CollectionPicker
              collections={collections}
              loadingCollections={loadingCollections}
              selectedId={selectedCollId}
              onSelect={setSelectedCollId}
              onCreated={(c) => { setNewlyCreated(c); setSelectedCollId(String(c.id)); }}
            />
          </div>
        </div>
      )}

      {step !== "scanning" && (
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={step === "importing"}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={step === "importing" || !selectedCollId}>
            {step === "importing"
              ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("spectraList.importFileModal.importing")}</>
              : scanResult
              ? t("spectraList.importFileModal.importCount", { count: scanResult.total_spectra })
              : t("spectraList.importFileModal.import")}
          </Button>
        </div>
      )}
    </ModalOverlay>
  );
}

// ─── Modal: importar por paste ────────────────────────────────────────────────

interface SpectrumRow { name: string; sampleClass: string; include: boolean; }

function ImportPasteModal({ onClose, onSuccess }: {
  onClose:   () => void;
  onSuccess: (newCollection?: Collection) => void;
}) {
  const { t } = useTranslation();
  const [text,        setText]        = useState("");
  const [technique,   setTechnique]   = useState<SpectralTechnique>("NIR");
  const [xUnit,       setXUnit]       = useState<XUnit>("nm");
  const [yUnit,       setYUnit]       = useState<YUnit>("Absorbance");
  const [visibility,  setVisibility]  = useState<Visibility>("private");
  const [singleName,  setSingleName]  = useState("");
  const [singleDesc,  setSingleDesc]  = useState("");
  const [singleClass, setSingleClass] = useState("");
  const [parsed,      setParsed]      = useState<ParsedSpectrum[] | null>(null);
  const [rows,        setRows]        = useState<SpectrumRow[]>([]);
  const [expanded,    setExpanded]    = useState<boolean[]>([]);
  const [submitting,  setSubmitting]  = useState(false);
  const [progress,    setProgress]    = useState<{ done: number; total: number } | null>(null);

  const { collections, loading: loadingCollections } = useCollections();
  const [selectedCollId, setSelectedCollId] = useState<string>("");
  const [newlyCreated,   setNewlyCreated]   = useState<Collection | null>(null);

  useEffect(() => {
    if (collections.length > 0 && !selectedCollId) setSelectedCollId(String(collections[0].id));
  }, [collections]);

  function handleTextBlur() {
    if (!text.trim()) return;
    const multi = parseMultiSpectrum(text);
    if (multi && multi.length > 1) {
      setParsed(multi);
      setRows(multi.map((s) => ({ name: s.name, sampleClass: "", include: true })));
      setExpanded(multi.map(() => false));
    } else { setParsed(null); }
  }

  const isMulti = parsed !== null && parsed.length > 1;
  const includedCount = rows.filter((r) => r.include).length;

  async function addToCollection(ids: number[]) {
    if (!selectedCollId) return;
    for (const id of ids) {
      try { await collectionsApi.addSpectrum(selectedCollId, id); } catch {}
    }
  }

  async function handleSubmitSingle() {
    if (!selectedCollId) { toast.error(t("spectraList.pasteModal.selectCollectionFirst")); return; }
    if (!singleName.trim()) { toast.error(t("spectraList.pasteModal.nameRequired")); return; }
    if (!text.trim())       { toast.error(t("spectraList.pasteModal.textRequired")); return; }
    setSubmitting(true);
    try {
      const { data } = await spectraApi.importPaste({
        name: singleName.trim(), text, technique, x_unit: xUnit, y_unit: yUnit,
        description: singleDesc || undefined, sample_class: singleClass || undefined, visibility,
      });
      if (data.spectrum?.id) await addToCollection([data.spectrum.id]);
      toast.success(t("spectraList.pasteModal.singleSuccess"));
      onSuccess(newlyCreated ?? undefined);
    } catch { toast.error(t("spectraList.pasteModal.processError")); }
    finally { setSubmitting(false); }
  }

  async function handleSubmitMulti() {
    if (!selectedCollId) { toast.error(t("spectraList.pasteModal.selectCollectionFirst")); return; }
    if (!parsed) return;
    const toImport = parsed.filter((_, i) => rows[i]?.include);
    if (toImport.length === 0) { toast.error(t("spectraList.pasteModal.selectAtLeastOne")); return; }
    setSubmitting(true);
    setProgress({ done: 0, total: toImport.length });
    let ok = 0; let fail = 0;
    const importedIds: number[] = [];
    await Promise.all(toImport.map(async (s) => {
      const row = rows[parsed.indexOf(s)];
      try {
        const { data } = await spectraApi.importPaste({
          name: row.name.trim() || s.name, text: s.text, technique,
          x_unit: xUnit, y_unit: yUnit, sample_class: row.sampleClass || undefined, visibility,
        });
        if (data.spectrum?.id) importedIds.push(data.spectrum.id);
        ok++;
      } catch { fail++; }
      finally { setProgress((p) => p ? { ...p, done: p.done + 1 } : p); }
    }));
    if (importedIds.length > 0) await addToCollection(importedIds);
    setSubmitting(false);
    if (ok > 0) toast.success(t("spectraList.pasteModal.multiSuccess", { count: ok }));
    if (fail > 0) toast.error(t("spectraList.pasteModal.multiFail", { count: fail }));
    if (fail === 0) onSuccess(newlyCreated ?? undefined);
    else setProgress(null);
  }

  return (
    <ModalOverlay onClose={onClose} wide={isMulti}>
      <h2 className="font-display font-semibold text-lg mb-1">{t("spectraList.pasteModal.title")}</h2>
      <p className="text-xs text-muted-foreground mb-5">{t("spectraList.pasteModal.hint")}</p>

      <Field label={t("spectraList.pasteModal.textLabel")}>
        <textarea
          value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }}
          onBlur={handleTextBlur} rows={isMulti ? 4 : 8}
          placeholder={t("spectraList.pasteModal.placeholder")}
          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring/20 resize-y"
        />
      </Field>

      {isMulti && <div className="mt-2 mb-4 flex items-center gap-2 text-xs text-primary font-medium"><span className="inline-block h-2 w-2 rounded-full bg-primary" />{t("spectraList.pasteModal.detected", { count: parsed!.length })}</div>}

      <div className="mt-4 space-y-3">
        <Field label={t("spectraList.pasteModal.technique")}><Select value={technique} onChange={(e) => setTechnique(e.target.value as SpectralTechnique)}>{TECHNIQUES.map((tq) => <option key={tq} value={tq}>{tq}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("spectraList.pasteModal.xUnit")}><Select value={xUnit} onChange={(e) => setXUnit(e.target.value as XUnit)}>{X_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</Select></Field>
          <Field label={t("spectraList.pasteModal.yUnit")}><Select value={yUnit} onChange={(e) => setYUnit(e.target.value as YUnit)}>{Y_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</Select></Field>
        </div>
        <Field label={t("spectraList.pasteModal.visibility")}><Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}><option value="private">{t("common.private")}</option><option value="public">{t("common.public")}</option></Select></Field>
      </div>

      {!isMulti && (
        <div className="mt-3 space-y-3">
          <Field label={t("spectraList.pasteModal.spectrumName")}><Input value={singleName} onChange={(e) => setSingleName(e.target.value)} placeholder={t("spectraList.pasteModal.spectrumNamePlaceholder")} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("spectraList.pasteModal.classOptional")}><Input value={singleClass} onChange={(e) => setSingleClass(e.target.value)} placeholder={t("spectraList.pasteModal.classPlaceholder")} /></Field>
          </div>
          <Field label={t("spectraList.pasteModal.notesOptional")}><Input value={singleDesc} onChange={(e) => setSingleDesc(e.target.value)} placeholder={t("spectraList.pasteModal.notesPlaceholder")} /></Field>
        </div>
      )}

      {isMulti && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("spectraList.pasteModal.spectraLabel", { included: includedCount, total: parsed!.length })}</p>
            <div className="flex gap-2">
              <button className="text-xs text-primary hover:underline" onClick={() => setRows((r) => r.map((x) => ({ ...x, include: true })))}>{t("spectraList.pasteModal.all")}</button>
              <span className="text-muted-foreground">·</span>
              <button className="text-xs text-primary hover:underline" onClick={() => setRows((r) => r.map((x) => ({ ...x, include: false })))}>{t("spectraList.pasteModal.none")}</button>
            </div>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {parsed!.map((s, i) => (
              <div key={i} className={`rounded-lg border transition-colors ${rows[i]?.include ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-60"}`}>
                <div className="flex items-center gap-3 px-3 py-2">
                  <input type="checkbox" checked={rows[i]?.include ?? true} onChange={(e) => setRows((r) => r.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))} className="accent-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <input value={rows[i]?.name ?? s.name} onChange={(e) => setRows((r) => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="w-full bg-transparent text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring/30 rounded px-1 -ml-1" placeholder="Nome" />
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 font-mono">{t("spectraList.pasteModal.pointsShort", { count: s.points })}</span>
                  <button onClick={() => setExpanded((ex) => ex.map((v, j) => j === i ? !v : v))} className="text-muted-foreground hover:text-foreground shrink-0">
                    {expanded[i] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {expanded[i] && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/50">
                    <Field label={t("spectraList.pasteModal.classOptional")}><Input value={rows[i]?.sampleClass ?? ""} onChange={(e) => setRows((r) => r.map((x, j) => j === i ? { ...x, sampleClass: e.target.value } : x))} placeholder={t("spectraList.pasteModal.classPlaceholder")} /></Field>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seleção de coleção — obrigatória */}
      <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{t("spectraList.pasteModal.targetCollection")}</span>
          <span className="text-xs text-destructive font-medium">{t("spectraList.pasteModal.required")}</span>
        </div>
        <CollectionPicker
          collections={collections}
          loadingCollections={loadingCollections}
          selectedId={selectedCollId}
          onSelect={setSelectedCollId}
          onCreated={(c) => { setNewlyCreated(c); setSelectedCollId(String(c.id)); }}
        />
      </div>

      {submitting && progress && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{t("spectraList.pasteModal.importing")}</span><span>{progress.done}/{progress.total}</span></div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="outline" onClick={onClose} disabled={submitting}>{t("common.cancel")}</Button>
        <Button
          onClick={isMulti ? handleSubmitMulti : handleSubmitSingle}
          disabled={submitting || !selectedCollId || (isMulti && includedCount === 0)}
        >
          {submitting ? t("spectraList.pasteModal.importing") : isMulti ? t("spectraList.pasteModal.importCount", { count: includedCount }) : t("spectraList.pasteModal.importSpectrum")}
        </Button>
      </div>
    </ModalOverlay>
  );
}

// ─── Modal: deletar em lote ───────────────────────────────────────────────────

function BatchDeleteModal({ ids, onClose, onSuccess }: { ids: number[]; onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [deleting,  setDeleting]  = useState(false);
  const [progress,  setProgress]  = useState(0);

  async function handleDelete() {
    setDeleting(true);
    let ok = 0; let fail = 0;
    for (const id of ids) {
      try { await spectraApi.delete(id); ok++; } catch { fail++; }
      setProgress(ok + fail);
    }
    setDeleting(false);
    if (ok > 0) toast.success(t("spectraList.batchDeleteModal.success", { count: ok }));
    if (fail > 0) toast.error(t("spectraList.batchDeleteModal.fail", { count: fail }));
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-sm p-6 relative">
        <h2 className="font-display font-semibold text-lg mb-1">{t("spectraList.batchDeleteModal.title")}</h2>
        <p className="text-xs text-muted-foreground mb-5">
          {t("spectraList.batchDeleteModal.description", { count: ids.length })}
        </p>
        {deleting && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{t("spectraList.batchDeleteModal.removing")}</span><span>{progress}/{ids.length}</span></div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-destructive transition-all duration-200" style={{ width: `${(progress / ids.length) * 100}%` }} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>{t("common.cancel")}</Button>
          <Button className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleDelete} disabled={deleting}>
            {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("spectraList.batchDeleteModal.removing")}</> : <><Trash2 className="h-4 w-4" /> {t("spectraList.batchDeleteModal.removeCount", { count: ids.length })}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: adicionar seleção em lote a coleção ───────────────────────────────

function BatchAddToCollectionModal({ spectrumIds, collections, onClose, onSuccess }: {
  spectrumIds: number[];
  collections: Collection[];
  onClose:     () => void;
  onSuccess:   (newCollection?: Collection) => void;
}) {
  const { t } = useTranslation();
  const [selectedCollId, setSelectedCollId] = useState<string>(collections.length > 0 ? String(collections[0].id) : "");
  const [newlyCreated,   setNewlyCreated]   = useState<Collection | null>(null);
  const [localColls,     setLocalColls]     = useState<Collection[]>(collections);
  const [adding,         setAdding]         = useState(false);
  const [progress,       setProgress]       = useState(0);

  async function handleAdd() {
    if (!selectedCollId) { toast.error(t("spectraList.batchCollectionModal.selectCollection")); return; }
    setAdding(true);
    let ok = 0; let fail = 0;
    for (const id of spectrumIds) {
      try { await collectionsApi.addSpectrum(selectedCollId, id); ok++; }
      catch (e: any) { if (e?.response?.status !== 409) fail++; else ok++; }
      setProgress(ok + fail);
    }
    setAdding(false);
    if (ok > 0) toast.success(t("spectraList.batchCollectionModal.success", { count: ok }));
    if (fail > 0) toast.error(t("spectraList.batchCollectionModal.fail", { count: fail }));
    onSuccess(newlyCreated ?? undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-sm p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><FolderOpen className="h-4 w-4 text-primary" /></div>
          <h2 className="font-display font-semibold text-base">{t("spectraList.batchCollectionModal.title")}</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t("spectraList.batchCollectionModal.description", { count: spectrumIds.length })}</p>

        <CollectionPicker
          collections={localColls}
          loadingCollections={false}
          selectedId={selectedCollId}
          onSelect={setSelectedCollId}
          onCreated={(c) => { setLocalColls((prev) => [c, ...prev]); setNewlyCreated(c); setSelectedCollId(String(c.id)); }}
        />

        {adding && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{t("spectraList.batchCollectionModal.adding")}</span><span>{progress}/{spectrumIds.length}</span></div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all duration-200" style={{ width: `${(progress / spectrumIds.length) * 100}%` }} /></div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={adding}>{t("common.cancel")}</Button>
          <Button onClick={handleAdd} disabled={adding || !selectedCollId}>
            {adding ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("spectraList.batchCollectionModal.adding")}</> : <><FolderOpen className="h-4 w-4" /> {t("spectraList.batchCollectionModal.add")}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── ModalOverlay ─────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose, wide = false }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`bg-card rounded-xl shadow-lg w-full p-6 relative max-h-[90vh] overflow-y-auto ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        {children}
      </div>
    </div>
  );
}