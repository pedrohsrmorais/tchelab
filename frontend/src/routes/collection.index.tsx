// collection.index.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderOpen, Plus, Search, Eye, Trash2,
  ChevronLeft, ChevronRight, X, Globe, Lock,
} from "lucide-react";
import { Card, Badge, Button, PageHeader, Field, Input, Select } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { collectionsApi } from "@/lib/api";
import type { Collection, Visibility } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/collection/")({
  head: () => ({
    meta: [
      { title: "Coleções — TcheLab" },
      { name: "description", content: "Agrupe espectros em coleções para organização e análise." },
    ],
  }),
  component: Page,
});

const LIMIT = 20;

function Page() {
  const { t }     = useTranslation();
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [search,      setSearch]      = useState("");
  const [modal,       setModal]       = useState(false);

  useEffect(() => { load(1); }, []);

  async function load(p: number) {
    setLoading(true);
    try {
      const { data } = await collectionsApi.listMine({ page: p, limit: LIMIT });
      setCollections(data.data);
      setTotal(data.total);
      setPage(p);
    } catch {
      toast.error(t("collectionList.loadError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("collectionList.confirmDelete", { name }))) return;
    try {
      await collectionsApi.delete(id);
      toast.success(t("collectionList.removed"));
      setCollections((prev) => prev.filter((c) => c.id !== id));
      setTotal((t) => t - 1);
    } catch {
      toast.error(t("collectionList.deleteError"));
    }
  }

  const filtered   = collections.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      <PageHeader
        title={t("collectionList.title")}
        subtitle={t("collectionList.subtitle")}
        actions={
          <Button onClick={() => setModal(true)}>
            <Plus className="h-4 w-4" /> {t("collectionList.newCollection")}
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
          {total > 0 && t("collectionList.count", { count: total })}
        </span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-medium">{t("collectionList.columns.name")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("collectionList.columns.description")}</th>
                <th className="text-right px-5 py-3 font-medium">{t("collectionList.columns.spectra")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("collectionList.columns.visibility")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("collectionList.columns.createdAt")}</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-t border-border animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3 w-full rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center gap-4 py-16 text-center px-6">
                      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                        <FolderOpen className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          {search ? t("collectionList.emptySearch", { search }) : t("collectionList.emptyTitle")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("collectionList.emptyHint")}
                        </p>
                      </div>
                      {!search && (
                        <Button size="sm" onClick={() => setModal(true)}>
                          <Plus className="h-4 w-4" /> {t("collectionList.newCollection")}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate({ to: "/collection/$id", params: { id: String(c.id) } })}
                    className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate max-w-[180px]">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs max-w-[220px] truncate">
                      {c.description ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs">
                      {c.spectra_count.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone={c.visibility === "public" ? "success" : "neutral"}>
                        {c.visibility === "public"
                          ? <><Globe className="h-3 w-3 inline mr-1" />{t("common.public")}</>
                          : <><Lock className="h-3 w-3 inline mr-1" />{t("common.private")}</>}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={() => navigate({ to: "/collection/$id", params: { id: String(c.id) } })}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="text-destructive/60 hover:text-destructive"
                          onClick={(e) => handleDelete(c.id, c.name, e)}>
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
            <span>{t("collectionList.pagination", { total, page, totalPages })}</span>
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

      {modal && (
        <CreateCollectionModal
          onClose={() => setModal(false)}
          onSuccess={() => { setModal(false); load(1); }}
        />
      )}
    </>
  );
}

function CreateCollectionModal({
  onClose, onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [visibility,  setVisibility]  = useState<Visibility>("private");
  const [submitting,  setSubmitting]  = useState(false);

  async function handleSubmit() {
    if (!name.trim()) { toast.error(t("collectionList.createModal.nameRequired")); return; }
    setSubmitting(true);
    try {
      await collectionsApi.create({ name: name.trim(), description: description.trim() || undefined, visibility });
      toast.success(t("collectionList.createModal.created"));
      onSuccess();
    } catch {
      toast.error(t("collectionList.createModal.createError"));
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
        <h2 className="font-display font-semibold text-lg mb-1">{t("collectionList.createModal.title")}</h2>
        <p className="text-xs text-muted-foreground mb-5">
          {t("collectionList.createModal.subtitle")}
        </p>
        <div className="space-y-4">
          <Field label={t("collectionList.createModal.name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t("collectionList.createModal.namePlaceholder")} autoFocus />
          </Field>
          <Field label={t("collectionList.createModal.descriptionOptional")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("collectionList.createModal.descriptionPlaceholder")}
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
            />
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
            {submitting ? t("common.creating") : t("collectionList.newCollection")}
          </Button>
        </div>
      </div>
    </div>
  );
}