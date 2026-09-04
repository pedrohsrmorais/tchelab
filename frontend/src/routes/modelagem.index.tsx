// routes/modelagem.index.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain, Plus, Eye, Trash2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, Badge, Button, PageHeader } from "@/components/ui-kit";
import { modelsApi } from "@/lib/api";
import type { Model } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/modelagem/")({
  head: () => ({ meta: [{ title: "Modelos — TcheLab" }] }),
  component: Page,
});

const LIMIT = 20;

function Page() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [models,  setModels]  = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);

  const STATUS_BADGE: Record<string, string> = {
    ready:    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
    pending:  "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400",
    training: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
    failed:   "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  };
  const STATUS_LABEL: Record<string, string> = {
    ready: t("modelList.status.ready"), pending: t("modelList.status.pending"),
    training: t("modelList.status.training"), failed: t("modelList.status.failed"),
  };
  const TYPE_LABEL: Record<string, string> = {
    classification: t("modelList.type.classification"),
    regression:     t("modelList.type.regression"),
    exploratory:    t("modelList.type.exploratory"),
  };

  useEffect(() => { load(1); }, []);

  async function load(p: number) {
    setLoading(true);
    try {
      const { data } = await modelsApi.listMine(p, LIMIT);
      setModels(data.data);
      setTotal(data.total);
      setPage(p);
    } catch {
      toast.error(t("modelList.loadError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(m: Model, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("modelList.confirmDelete", { name: m.name }))) return;
    try {
      await modelsApi.delete(m.id);
      toast.success(t("modelList.removed"));
      setModels((prev) => prev.filter((x) => x.id !== m.id));
      setTotal((t) => t - 1);
    } catch {
      toast.error(t("modelList.deleteError"));
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      <PageHeader
        title={t("modelList.title")}
        subtitle={t("modelList.subtitle")}
        actions={
          <Button onClick={() => navigate({ to: "/modelagem/novo" as any })}>
            <Plus className="h-4 w-4" /> {t("modelList.newModel")}
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-medium">{t("modelList.columns.name")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("modelList.columns.algorithm")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("modelList.columns.type")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("modelList.columns.dataset")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("modelList.columns.status")}</th>
                <th className="text-left px-5 py-3 font-medium">{t("modelList.columns.createdAt")}</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-t border-border animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3 w-full rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : models.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center gap-4 py-16 text-center px-6">
                      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                        <Brain className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{t("modelList.emptyTitle")}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("modelList.emptyHint")}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => navigate({ to: "/modelagem/novo" as any })}>
                        <Plus className="h-4 w-4" /> {t("modelList.trainModel")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                models.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => navigate({ to: "/modelagem/$id", params: { id: String(m.id) } })}
                    className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Brain className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate max-w-[180px]">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><Badge tone="primary">{m.algorithm}</Badge></td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {TYPE_LABEL[m.model_type] ?? m.model_type}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground truncate max-w-[160px]">
                      {m.dataset_name ?? "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[m.status] ?? ""}`}>
                        {STATUS_LABEL[m.status] ?? m.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost"
                          onClick={() => navigate({ to: "/modelagem/$id", params: { id: String(m.id) } })}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="text-destructive/60 hover:text-destructive"
                          onClick={(e) => handleDelete(m, e)}>
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
            <span>{t("modelList.pagination", { count: total, page, totalPages })}</span>
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
    </>
  );
}