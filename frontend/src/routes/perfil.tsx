// perfil.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ExternalLink, Linkedin, Github, GraduationCap,
  Building2, FlaskConical, Database, Pencil,
  Brain, Clock, CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { Card, PageHeader, Metric, Button, Badge } from "@/components/ui-kit";
import { Avatar } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { modelsApi, datasetsApi, jobsApi } from "@/lib/api";
import type { Model, Dataset, Job } from "@/lib/api";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil — TcheLab" },
      { name: "description", content: "Seu perfil de pesquisador no TcheLab." },
    ],
  }),
  component: Page,
});

function Page() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [models,   setModels]   = useState<Model[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [jobs,     setJobs]     = useState<Job[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      modelsApi.listMine(1, 3),
      datasetsApi.list({ limit: 4 }),
      jobsApi.list({ limit: 5 }),
    ])
      .then(([m, d, j]) => {
        setModels(m.data.data);
        setDatasets(d.data.data);
        setJobs(j.data.data);
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  return (
    <>
      {/* ── Cabeçalho ───────────────────────────────────────────────── */}
      <Card className="p-0 overflow-hidden mb-6">
        <div className="h-28 bg-gradient-to-r from-primary via-accent to-primary/40" />
        <div className="px-6 pb-6">
          <div className="flex items-end justify-between gap-4 -mt-12 flex-wrap">
            <div className="flex items-end gap-4">
              <div className="ring-4 ring-card rounded-full">
                <Avatar initials={user.initials} size={88} />
              </div>
              <div className="pb-1.5">
                <h1 className="text-xl font-display font-bold leading-tight">{user.name}</h1>
                {user.research_area && (
                  <p className="text-sm text-muted-foreground">{user.research_area}</p>
                )}
              </div>
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => navigate({ to: "/perfil/editar" })}
            >
              <Pencil className="h-4 w-4" /> {t("profile.editProfile")}
            </Button>
          </div>

          {user.bio && (
            <p className="mt-4 text-sm text-foreground/80 max-w-2xl leading-relaxed">
              {user.bio}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            {user.institution && (
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> {user.institution}
              </span>
            )}
            {user.birth_date && (
              <span className="flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" />
                {new Date(user.birth_date).toLocaleDateString()}
              </span>
            )}
          </div>

          {(user.lattes_url || user.linkedin_url || user.github_url) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {user.lattes_url && (
                <SocialLink href={user.lattes_url} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Lattes" />
              )}
              {user.linkedin_url && (
                <SocialLink href={user.linkedin_url} icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn" />
              )}
              {user.github_url && (
                <SocialLink href={user.github_url} icon={<Github className="h-3.5 w-3.5" />} label="GitHub" />
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ── Métricas ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Metric label={t("profile.metrics.models")}   value={user.stat_models} />
        <Metric label={t("profile.metrics.analyses")}  value={user.stat_analyses} />
        <Metric label={t("profile.metrics.datasets")}  value={user.stat_datasets} />
        <Metric label={t("profile.metrics.public")}  value={user.stat_public_analyses} />
        <Metric label={t("profile.metrics.private")}  value={user.stat_private_analyses} />
      </div>

      {/* ── Conteúdo ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Modelos recentes */}
          <Card className="p-6">
            <SectionHeader
              icon={<Brain className="h-4 w-4 text-primary" />}
              title={t("profile.sections.recentModels")}
              action={<Button size="sm" variant="ghost" onClick={() => navigate({ to: "/modelagem" })}>{t("profile.new")}</Button>}
            />
            {loading ? <SectionSkeleton rows={3} /> : models.length === 0 ? (
              <Empty label={t("profile.empty.models")} />
            ) : (
              <ul className="divide-y divide-border -mx-2 mt-3">
                {models.map((m) => (
                  <li key={m.id} className="px-2 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.algorithm} · {m.dataset_name ?? "—"}
                      </p>
                    </div>
                    <ModelStatusBadge status={m.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Datasets recentes */}
          <Card className="p-6">
            <SectionHeader
              icon={<Database className="h-4 w-4 text-primary" />}
              title={t("profile.sections.recentDatasets")}
              action={<Button size="sm" variant="ghost" onClick={() => navigate({ to: "/datasets" })}>{t("profile.viewAll")}</Button>}
            />
            {loading ? <SectionSkeleton rows={2} /> : datasets.length === 0 ? (
              <Empty label={t("profile.empty.datasets")} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {datasets.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => navigate({ to: "/datasets/$id", params: { id: String(d.id) } })}
                    className="p-3 rounded-lg border border-border hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <p className="font-medium text-sm truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {d.sample_count} × {d.x_points} · {d.technique}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Atividade recente — jobs */}
        <Card className="p-6 h-fit">
          <SectionHeader
            icon={<Clock className="h-4 w-4 text-primary" />}
            title={t("profile.sections.recentActivity")}
            action={<Button size="sm" variant="ghost" onClick={() => navigate({ to: "/analises-andamento" })}>{t("profile.viewEverything")}</Button>}
          />
          {loading ? <SectionSkeleton rows={4} /> : jobs.length === 0 ? (
            <Empty label={t("profile.empty.activity")} />
          ) : (
            <ol className="space-y-3 mt-3">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-start gap-2.5 text-sm">
                  <JobIcon status={j.status} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight truncate">
                      {j.job_type === "train_model" ? t("profile.jobDescribe.train") : t("profile.jobDescribe.predict")}
                      {j.model_name ? ` — ${j.model_name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(j.queued_at).toLocaleString()}
                    </p>
                  </div>
                  <JobStatusBadge status={j.status} />
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SocialLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
    >
      {icon} {label}
    </a>
  );
}

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <h2 className="font-display font-semibold text-sm flex items-center gap-2">{icon} {title}</h2>
      {action}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground py-3">{label}</p>;
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 mt-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-muted" />
      ))}
    </div>
  );
}

function ModelStatusBadge({ status }: { status: Model["status"] }) {
  const { t } = useTranslation();
  const map: Record<Model["status"], { tone: "neutral" | "primary" | "success" | "destructive"; label: string }> = {
    pending:  { tone: "neutral",     label: t("profile.modelStatus.pending") },
    training: { tone: "primary",     label: t("profile.modelStatus.training") },
    ready:    { tone: "success",     label: t("profile.modelStatus.ready") },
    failed:   { tone: "destructive", label: t("profile.modelStatus.failed") },
  };
  const s = map[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function JobIcon({ status }: { status: Job["status"] }) {
  if (status === "done")      return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />;
  if (status === "failed")    return <XCircle      className="h-4 w-4 text-destructive shrink-0 mt-0.5" />;
  if (status === "running")   return <Loader2      className="h-4 w-4 text-primary animate-spin shrink-0 mt-0.5" />;
  return <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />;
}

function JobStatusBadge({ status }: { status: Job["status"] }) {
  const { t } = useTranslation();
  const map: Record<Job["status"], { tone: "neutral" | "primary" | "success" | "destructive" | "accent"; label: string }> = {
    queued:    { tone: "neutral",     label: t("profile.jobStatus.queued") },
    running:   { tone: "accent",      label: t("profile.jobStatus.running") },
    done:      { tone: "success",     label: t("profile.jobStatus.done") },
    failed:    { tone: "destructive", label: t("profile.jobStatus.failed") },
    cancelled: { tone: "neutral",     label: t("profile.jobStatus.cancelled") },
  };
  const s = map[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}