// historico.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain, Database, Play, Loader2,
  CheckCircle2, XCircle, Clock, Ban, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, Badge, Button, PageHeader } from "@/components/ui-kit";
import { jobsApi } from "@/lib/api";
import type { Job, JobType, JobStatus } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — TcheLab" },
      { name: "description", content: "Histórico de análises, treinos e operações na plataforma." },
    ],
  }),
  component: Page,
});

const LIMIT = 25;

function Page() {
  const { t }     = useTranslation();
  const navigate  = useNavigate();
  const [jobs,    setJobs]    = useState<Job[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<JobStatus | "all">("all");

  useEffect(() => { load(1); }, [filter]);

  async function load(p: number) {
    setLoading(true);
    try {
      const { data } = await jobsApi.list({
        page:  p,
        limit: LIMIT,
        ...(filter !== "all" ? { status: filter } : {}),
      });
      setJobs(data.data);
      setTotal(data.total);
      setPage(p);
    } catch {
      toast.error(t("history.loadError"));
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  const FILTERS: Array<{ label: string; value: JobStatus | "all" }> = [
    { label: t("history.filters.all"),       value: "all"       },
    { label: t("history.filters.done"),      value: "done"      },
    { label: t("history.filters.failed"),    value: "failed"    },
    { label: t("history.filters.cancelled"), value: "cancelled" },
    { label: t("history.filters.queued"),    value: "queued"    },
  ];

  return (
    <>
      <PageHeader
        title={t("history.title")}
        subtitle={t("history.subtitle")}
      />

      {/* Aviso de escopo */}
      <div className="mb-5 px-4 py-3 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("history.noteLabel")}</span>{" "}
        {t("history.noteText")}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
              filter === f.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="h-4 w-4 rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-48 rounded bg-muted" />
                  <div className="h-3 w-32 rounded bg-muted" />
                </div>
                <div className="h-3 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/40" />
            <p className="font-semibold text-sm">{t("history.emptyTitle")}</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {t("history.emptyHint")}
            </p>
            <Button size="sm" onClick={() => navigate({ to: "/modelagem" })}>
              {t("history.trainFirstModel")}
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {jobs.map((job) => (
              <HistoryRow key={job.id} job={job} />
            ))}
          </ul>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border text-xs text-muted-foreground">
            <span>{t("history.pagination", { total, page, totalPages })}</span>
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

// ─── Row ──────────────────────────────────────────────────────────────────────

function HistoryRow({ job }: { job: Job }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
      {/* Ícone de status */}
      <StatusIcon status={job.status} />

      {/* Tipo + alvo */}
      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
        <JobTypeIcon type={job.job_type} />
      </div>

      {/* Descrição */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {describeJob(job, t)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
          <span>{new Date(job.queued_at).toLocaleString()}</span>
          {job.duration_s != null && (
            <span>· {job.duration_s}s</span>
          )}
          {job.error_message && (
            <span className="text-destructive truncate max-w-[200px]">· {job.error_message}</span>
          )}
        </p>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 shrink-0">
        {job.algorithm && <Badge tone="neutral">{job.algorithm}</Badge>}
        <StatusBadge status={job.status} />
      </div>
    </li>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function describeJob(job: Job, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const target = job.model_name ?? `Job #${job.id}`;
  switch (job.job_type) {
    case "train_model": return t("history.describe.train", { target });
    case "predict":     return t("history.describe.predict", { target });
    case "preprocess":  return t("history.describe.preprocess", { target });
    case "export":      return t("history.describe.export", { target });
    default:            return target;
  }
}

function StatusIcon({ status }: { status: JobStatus }) {
  if (status === "done")      return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (status === "failed")    return <XCircle      className="h-4 w-4 text-destructive shrink-0" />;
  if (status === "cancelled") return <Ban          className="h-4 w-4 text-muted-foreground shrink-0" />;
  if (status === "running")   return <Loader2      className="h-4 w-4 text-primary animate-spin shrink-0" />;
  return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function JobTypeIcon({ type }: { type: JobType }) {
  if (type === "predict") return <Play     className="h-3.5 w-3.5 text-muted-foreground" />;
  if (type === "train_model") return <Brain className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Database className="h-3.5 w-3.5 text-muted-foreground" />;
}

function StatusBadge({ status }: { status: JobStatus }) {
  const { t } = useTranslation();
  const map: Record<JobStatus, { tone: "neutral" | "primary" | "success" | "destructive" | "accent"; label: string }> = {
    queued:    { tone: "neutral",     label: t("history.status.queued")    },
    running:   { tone: "accent",      label: t("history.status.running")   },
    done:      { tone: "success",     label: t("history.status.done")      },
    failed:    { tone: "destructive", label: t("history.status.failed")    },
    cancelled: { tone: "neutral",     label: t("history.status.cancelled") },
  };
  const s = map[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}