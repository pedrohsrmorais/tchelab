// analises-andamento.tsx

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, CheckCircle2, XCircle, Clock,
  RefreshCw, Brain, Database,
} from "lucide-react";
import { Card, Badge, Button, PageHeader } from "@/components/ui-kit";
import { jobsApi } from "@/lib/api";
import type { Job, JobStatus } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/analises-andamento")({
  head: () => ({
    meta: [{ title: "Análises em andamento — TcheLab" }],
  }),
  component: Page,
});

// ─── Page ─────────────────────────────────────────────────────────────────────

function Page() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<JobStatus | "all">("all");

  async function load(showToast = false) {
    setLoading(true);
    try {
      const { data } = await jobsApi.list({
        limit: 30,
        ...(filter !== "all" ? { status: filter } : {}),
      });
      setJobs(data.data);
      setTotal(data.total);
      if (showToast) toast.success(t("jobsProgress.updated"));
    } catch {
      toast.error(t("jobsProgress.loadError"));
    } finally {
      setLoading(false);
    }
  }

  // Carrega na montagem e toda vez que o filtro muda
  useEffect(() => { load(); }, [filter]);

  // Polling enquanto houver jobs ativos
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "queued" || j.status === "running");
    if (!hasActive) return;
    const id = setInterval(() => load(), 3000);
    return () => clearInterval(id);
  }, [jobs]);

  const FILTERS: Array<{ label: string; value: JobStatus | "all" }> = [
    { label: t("jobsProgress.filters.all"),     value: "all" },
    { label: t("jobsProgress.filters.queued"),  value: "queued" },
    { label: t("jobsProgress.filters.running"), value: "running" },
    { label: t("jobsProgress.filters.done"),    value: "done" },
    { label: t("jobsProgress.filters.failed"),  value: "failed" },
    { label: t("jobsProgress.filters.cancelled"), value: "cancelled" },
  ];

  return (
    <>
      <PageHeader
        title={t("jobsProgress.title")}
        subtitle={t("jobsProgress.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {t("jobsProgress.refresh")}
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors ${filter === f.value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border hover:bg-muted"
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading && jobs.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          {t("jobsProgress.noneFound")}
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onCancel={() => load()} />
          ))}
        </div>
      )}

      {total > 30 && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("jobsProgress.showing", { count: total })}
        </p>
      )}
    </>
  );
}

// ─── Job row ──────────────────────────────────────────────────────────────────

function JobRow({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const { t } = useTranslation();
  const [cancelling, setCancelling] = useState(false);
  const isActive = job.status === "queued" || job.status === "running";

  async function handleCancel() {
    if (!confirm(t("jobsProgress.confirmCancel"))) return;
    setCancelling(true);
    try {
      await jobsApi.cancel(job.id);
      toast.success(t("jobsProgress.cancelled"));
      onCancel();
    } catch {
      toast.error(t("jobsProgress.cancelError"));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        {/* Ícone do tipo */}
        <div className="mt-0.5 h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          {job.job_type === "predict"
            ? <Database className="h-4 w-4 text-primary" />
            : <Brain className="h-4 w-4 text-primary" />
          }
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">
              {job.model_name ?? `Job #${job.id}`}
            </p>
            <StatusBadge status={job.status} />
            <span className="text-[10px]">
              <Badge tone="neutral">
                {job.job_type === "train_model" ? t("jobsProgress.jobType.train") : t("jobsProgress.jobType.predict")}
              </Badge>
            </span>
          </div>

          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {job.algorithm && <span>{job.algorithm}</span>}
            {job.dataset_name && <span>· {job.dataset_name}</span>}
            <span>· {new Date(job.queued_at).toLocaleString()}</span>
            {job.duration_s != null && (
              <span>· {job.duration_s}s</span>
            )}
          </div>

          {/* Barra de progresso */}
          {isActive && (
            <div className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: job.status === "running" ? `${job.progress}%` : "10%" }}
              />
            </div>
          )}

          {/* Erro */}
          {job.error_message && (
            <p className="mt-1.5 text-xs text-destructive font-mono truncate">
              {job.error_message}
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : t("jobsProgress.cancel")}
            </Button>
          )}
          {job.status === "done" && job.job_type === "predict" && (
            <Button size="sm" variant="outline" onClick={() => window.location.href = "/analise"}>
              {t("jobsProgress.viewResult")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JobStatus }) {
  const { t } = useTranslation();
  const map: Record<JobStatus, { label: string; icon: React.ReactNode; tone: "neutral" | "primary" | "success" | "warning" | "accent" | "destructive" }> = {
    queued: { label: t("jobsProgress.status.queued"), icon: <Clock className="h-3 w-3" />, tone: "neutral" },
    running: { label: t("jobsProgress.status.running"), icon: <Loader2 className="h-3 w-3 animate-spin" />, tone: "accent" },
    done: { label: t("jobsProgress.status.done"), icon: <CheckCircle2 className="h-3 w-3" />, tone: "success" },
    failed: { label: t("jobsProgress.status.failed"), icon: <XCircle className="h-3 w-3" />, tone: "destructive" },
    cancelled: { label: t("jobsProgress.status.cancelled"), icon: <XCircle className="h-3 w-3" />, tone: "neutral" },
  };
  const s = map[status];
  return (
    <Badge tone={s.tone}>
      <span className="flex items-center gap-1">{s.icon} {s.label}</span>
    </Badge>
  );
}