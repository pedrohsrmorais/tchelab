//analise.tsx

import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Microscope, Play, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Card, Badge, Button, PageHeader, Field, Select, Metric } from "@/components/ui-kit";
import { modelsApi, datasetsApi, predictionsApi, jobsApi } from "@/lib/api";
import type { Model, Dataset, PredictionDetail, Job } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/analise")({
  head: () => ({
    meta: [
      { title: "Análise — TcheLab" },
      { name: "description", content: "Aplique modelos treinados a datasets e visualize predições." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    model_id: s.model_id ? Number(s.model_id) : undefined,
  }),
  component: Page,
});

// ─── Page ─────────────────────────────────────────────────────────────────────

function Page() {
  const { t } = useTranslation();
  const { model_id: preselectedModelId } = useSearch({ from: "/analise" });

  const [models, setModels] = useState<Model[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [modelId, setModelId] = useState<string>(preselectedModelId ? String(preselectedModelId) : "");
  const [datasetId, setDatasetId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<Job["status"] | null>(null);
  const [result, setResult] = useState<PredictionDetail | null>(null);

  const selectedModel = models.find((m) => String(m.id) === modelId) ?? null;
  const selectedDataset = datasets.find((d) => String(d.id) === datasetId) ?? null;

  // Carrega modelos prontos e datasets acessíveis
  useEffect(() => {
    async function load() {
      const [mRes, dRes] = await Promise.all([
        modelsApi.listMine(),
        datasetsApi.list({ limit: 100 }),
      ]);
      const readyModels = mRes.data.data.filter((m) => m.status === "ready");
      setModels(readyModels);
      setDatasets(dRes.data.data);
    }
    load().catch(() => toast.error(t("analysis.loadError")));
  }, []);

  // Polling do job enquanto estiver em andamento
  useEffect(() => {
    if (!jobId || jobStatus === "done" || jobStatus === "failed" || jobStatus === "cancelled") return;

    const interval = setInterval(async () => {
      try {
        const { data: job } = await jobsApi.get(jobId);
        setJobStatus(job.status);

        if (job.status === "done") {
          clearInterval(interval);
          // Busca a predição associada ao job
          const { data: list } = await predictionsApi.list(1, 5);
          const pred = list.data.find((p) => p.job_id === jobId);
          if (pred) {
            const { data: detail } = await predictionsApi.get(pred.id);
            setResult(detail);
          }
          toast.success(t("analysis.predictionDone"));
        } else if (job.status === "failed") {
          clearInterval(interval);
          toast.error(t("analysis.predictionFailed", { message: job.error_message ?? t("analysis.unknownError") }));
        }
      } catch {
        clearInterval(interval);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  async function handleRun() {
    if (!modelId || !datasetId) {
      toast.error(t("analysis.selectBoth"));
      return;
    }
    setRunning(true);
    setResult(null);
    setJobId(null);
    setJobStatus(null);
    try {
      const { data } = await predictionsApi.create(modelId, datasetId);
      setJobId(data.job.id);
      setJobStatus("queued");
      toast.info(t("analysis.predictionQueued"));
    } catch {
      toast.error(t("analysis.runError"));
    } finally {
      setRunning(false);
    }
  }

  const cal = selectedModel?.metrics_cal as Record<string, number> | null;
  const cv = selectedModel?.metrics_cv;

  return (
    <>
      <PageHeader
        title={t("analysis.title")}
        subtitle={t("analysis.subtitle")}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Coluna principal ───────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Configuração */}
          <Card className="p-6">
            <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
              <Microscope className="h-5 w-5 text-primary" /> {t("analysis.config.title")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("analysis.config.model")}>
                <Select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                >
                  <option value="">{t("analysis.config.selectModel")}</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.algorithm})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("analysis.config.targetDataset")}>
                <Select
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                >
                  <option value="">{t("analysis.config.selectDataset")}</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({t("analysis.config.datasetOption", { count: d.sample_count })})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <JobStatusBadge status={jobStatus} />
              <Button onClick={handleRun} disabled={running || !modelId || !datasetId || jobStatus === "queued" || jobStatus === "running"}>
                {running || jobStatus === "queued" || jobStatus === "running"
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("analysis.config.processing")}</>
                  : <><Play className="h-4 w-4" /> {t("analysis.config.run")}</>
                }
              </Button>
            </div>
          </Card>

          {/* Resultados */}
          {result && (
            <Card className="p-6">
              <h2 className="font-display font-semibold text-lg mb-1">{t("analysis.results.title")}</h2>
              <p className="text-xs text-muted-foreground mb-4">
                {t("analysis.results.subtitle", {
                  model: result.model_name,
                  count: result.sample_count,
                  date: result.finished_at ? new Date(result.finished_at).toLocaleString() : "",
                })}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <Metric label={t("analysis.results.samples")} value={result.sample_count} />
                <Metric label={t("analysis.results.model")} value={result.algorithm} />
                <Metric label={t("analysis.results.dataset")} value={result.dataset_name ?? "—"} />
                <Metric label={t("analysis.results.status")} value={result.job_status} />
              </div>

              {/* Tabela de predições */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">{t("analysis.results.columnIndex")}</th>
                      <th className="text-left px-4 py-2 font-medium">{t("analysis.results.columnSample")}</th>
                      <th className="text-left px-4 py-2 font-medium">{t("analysis.results.columnPredicted")}</th>
                      <th className="text-right px-4 py-2 font-medium">{t("analysis.results.columnScore")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.predictions.map((p) => (
                      <tr key={p.position} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{p.position + 1}</td>
                        <td className="px-4 py-2.5">{p.sample_name ?? t("analysis.results.sampleFallback", { n: p.position + 1 })}</td>
                        <td className="px-4 py-2.5 font-semibold">{String(p.predicted)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {p.score != null ? `${(p.score * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* ── Sidebar: info do modelo ────────────────────────────────── */}
        <Card className="p-6 h-fit">
          <h3 className="font-display font-semibold mb-3">
            {selectedModel ? selectedModel.name : t("analysis.sidebar.title")}
          </h3>

          {!selectedModel ? (
            <p className="text-sm text-muted-foreground">{t("analysis.sidebar.empty")}</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <Row k={t("analysis.sidebar.algorithm")} v={selectedModel.algorithm} />
              <Row k={t("analysis.sidebar.type")} v={selectedModel.model_type} />
              <Row k={t("analysis.sidebar.dataset")} v={selectedModel.dataset_name ?? "—"} />
              <Row k={t("analysis.sidebar.technique")} v={selectedModel.dataset_technique ?? "—"} />
              <Row k={t("analysis.sidebar.samples")} v={String(selectedModel.train_samples ?? "—")} />
              <Row k={t("analysis.sidebar.visibility")} v={selectedModel.visibility === "public" ? t("common.public") : t("common.private")} />
              {cal?.accuracy != null && (
                <Row k={t("analysis.sidebar.accuracyCal")} v={`${(cal.accuracy * 100).toFixed(1)}%`} />
              )}
              {cv?.accuracy_mean != null && (
                <Row k={t("analysis.sidebar.accuracyCv")} v={`${(cv.accuracy_mean * 100).toFixed(1)}%`} />
              )}
              {cv?.f1_weighted_mean != null && (
                <Row k={t("analysis.sidebar.f1Cv")} v={cv.f1_weighted_mean.toFixed(3)} />
              )}
              {selectedModel.preprocessing?.length ? (
                <Row
                  k={t("analysis.sidebar.preprocessing")}
                  v={selectedModel.preprocessing.map((p) => p.step).join(" → ")}
                />
              ) : null}
            </dl>
          )}
        </Card>
      </div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border last:border-0 pb-1.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium text-right truncate max-w-[140px]">{v}</dd>
    </div>
  );
}

function JobStatusBadge({ status }: { status: Job["status"] | null }) {
  const { t } = useTranslation();
  if (!status) return null;
  const map: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
    queued: { label: t("analysis.jobStatus.queued"), icon: <Clock className="h-3 w-3" />, tone: "neutral" },
    running: { label: t("analysis.jobStatus.running"), icon: <Loader2 className="h-3 w-3 animate-spin" />, tone: "accent" },
    done: { label: t("analysis.jobStatus.done"), icon: <CheckCircle2 className="h-3 w-3" />, tone: "success" },
    failed: { label: t("analysis.jobStatus.failed"), icon: <XCircle className="h-3 w-3" />, tone: "danger" },
    cancelled: { label: t("analysis.jobStatus.cancelled"), icon: <XCircle className="h-3 w-3" />, tone: "neutral" },
  };
  const s = map[status];
  if (!s) return null;
  return (
    <Badge tone={s.tone as never}>
      <span className="flex items-center gap-1">{s.icon} {s.label}</span>
    </Badge>
  );
}