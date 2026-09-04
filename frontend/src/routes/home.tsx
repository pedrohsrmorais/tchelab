// home.tsx

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Play, Filter, Plus, FlaskConical, Database, Brain } from "lucide-react";
import { Card, Badge, Button, PageHeader } from "@/components/ui-kit";
import { Avatar } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { modelsApi, datasetsApi } from "@/lib/api";
import type { Model, Dataset } from "@/lib/api";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Explorar — TcheLab" },
      { name: "description", content: "Feed público de modelos e datasets compartilhados pela comunidade." },
    ],
  }),
  component: Explorar,
});

const FILTER_TABS = ["Todos", "Modelos", "Datasets", "KNN", "SIMCA", "PLS-OC", "NIR", "Raman", "FTIR"];

// ─── LinkButton ───────────────────────────────────────────────────────────────

type LinkButtonProps = {
  to: string;
  search?: Record<string, unknown>;
  params?: Record<string, string>;
  variant?: "outline" | "default";
  size?: "sm" | "md";
  children: React.ReactNode;
  className?: string;
};

function LinkButton({ to, search, params, variant = "default", size = "sm", children, className }: LinkButtonProps) {
  const base =
    "inline-flex items-center gap-1.5 font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const sizeClass = size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-base";
  const variantClass =
    variant === "outline"
      ? "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
      : "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <Link
      to={to}
      search={search as never}
      params={params as never}
      className={[base, sizeClass, variantClass, className].filter(Boolean).join(" ")}
    >
      {children}
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Explorar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [models,   setModels]   = useState<Model[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [activeTab, setActiveTab] = useState("Todos");

  useEffect(() => {
    async function load() {
      try {
        const [mRes, dRes] = await Promise.all([
          modelsApi.list({ limit: 10 }),
          datasetsApi.list({ limit: 10 }),
        ]);
        setModels(mRes.data.data);
        setDatasets(dRes.data.data);
      } catch {
        // silencia — exibe estado vazio
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredModels =
    activeTab === "Todos" || activeTab === "Modelos"
      ? models
      : ["KNN", "SIMCA", "PLS-OC"].includes(activeTab)
      ? models.filter((m) => m.algorithm === activeTab)
      : [];

  const filteredDatasets =
    activeTab === "Todos" || activeTab === "Datasets"
      ? datasets
      : ["NIR", "Raman", "FTIR"].includes(activeTab)
      ? datasets.filter((d) => d.technique === activeTab)
      : [];

  const showModels   = ["Todos", "Modelos", "KNN", "SIMCA", "PLS-OC"].includes(activeTab);
  const showDatasets = ["Todos", "Datasets", "NIR", "Raman", "FTIR"].includes(activeTab);

  const TAB_LABEL: Record<string, string> = {
    Todos: t("explore.filterTabs.all"),
    Modelos: t("explore.filterTabs.models"),
    Datasets: t("explore.filterTabs.datasets"),
  };

  return (
    <>
      <PageHeader
        title={t("explore.title")}
        subtitle={t("explore.subtitle")}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" /> {t("explore.filtersButton")}
            </Button>
            <LinkButton to="/modelagem-classica">
              <Plus className="h-4 w-4" /> {t("explore.newModel")}
            </LinkButton>
          </>
        }
      />

      {/* Caixa de publicação */}
      {user && (
        <Card className="p-4 mb-6 flex items-center gap-3">
          <Avatar initials={user.initials} size={42} />
          <div className="flex-1 h-11 px-4 rounded-full bg-muted/60 flex items-center text-sm text-muted-foreground cursor-text select-none">
            {t("explore.shareBoxPlaceholder")}
          </div>
          <LinkButton to="/datasets">
            <Plus className="h-4 w-4" /> {t("explore.publish")}
          </LinkButton>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
              activeTab === tab
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:bg-muted"
            }`}
          >
            {TAB_LABEL[tab] ?? tab}
          </button>
        ))}
      </div>

      {loading ? (
        <FeedSkeleton />
      ) : filteredModels.length === 0 && filteredDatasets.length === 0 ? (
        <FeedEmpty />
      ) : (
        <div className="space-y-4">
          {showModels && filteredModels.map((m) => (
            <ModelCard key={m.id} model={m} />
          ))}
          {showDatasets && filteredDatasets.map((d) => (
            <DatasetCard key={d.id} dataset={d} />
          ))}
        </div>
      )}
    </>
  );
}

// ─── Model card ───────────────────────────────────────────────────────────────

function ModelCard({ model }: { model: Model }) {
  const { t } = useTranslation();
  const cal = model.metrics_cal as Record<string, number> | null;
  const cv  = model.metrics_cv;

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Avatar initials={model.owner_initials ?? "?"} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{model.owner_name ?? "—"}</p>
            {model.dataset_technique && (
              <span className="text-xs text-muted-foreground">· {model.dataset_technique}</span>
            )}
            <span className="text-xs text-muted-foreground">
              · {new Date(model.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <Badge tone="primary">{model.algorithm}</Badge>
            <Badge tone="neutral">{model.model_type}</Badge>
            {model.dataset_name && <Badge tone="neutral">{model.dataset_name}</Badge>}
          </div>
        </div>
        <Brain className="h-4 w-4 text-muted-foreground/50 mt-1 shrink-0" />
      </div>

      <p className="mt-3 font-semibold text-sm">{model.name}</p>
      {model.description && (
        <p className="mt-1 text-sm text-foreground/70 leading-relaxed">{model.description}</p>
      )}

      {(cal || cv) && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {model.train_samples != null && (
            <Stat label={t("explore.modelCard.trainSamples")} value={model.train_samples.toLocaleString()} />
          )}
          {cal?.accuracy != null && (
            <Stat label={t("explore.modelCard.accuracyCal")} value={`${(cal.accuracy * 100).toFixed(1)}%`} />
          )}
          {cv?.accuracy_mean != null && (
            <Stat label={t("explore.modelCard.accuracyCv")} value={`${(cv.accuracy_mean * 100).toFixed(1)}%`} />
          )}
          {cv?.f1_weighted_mean != null && (
            <Stat label={t("explore.modelCard.f1Cv")} value={cv.f1_weighted_mean.toFixed(3)} />
          )}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-border flex items-center gap-2 flex-wrap">
        <LinkButton to="/models/$id" params={{ id: String(model.id) }} variant="outline">
          <Eye className="h-4 w-4" /> {t("explore.modelCard.view")}
        </LinkButton>
        <LinkButton to="/analise" search={{ model_id: model.id }}>
          <Play className="h-4 w-4" /> {t("explore.modelCard.useModel")}
        </LinkButton>
      </div>
    </Card>
  );
}

// ─── Dataset card ─────────────────────────────────────────────────────────────

function DatasetCard({ dataset }: { dataset: Dataset }) {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Database className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{dataset.owner_name ?? "—"}</p>
            <span className="text-xs text-muted-foreground">
              · {new Date(dataset.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <Badge tone="primary">{dataset.technique}</Badge>
            <Badge tone="neutral">{dataset.x_unit}</Badge>
            <Badge tone={dataset.visibility === "public" ? "success" : "neutral"}>
              {dataset.visibility === "public" ? t("common.public") : t("common.private")}
            </Badge>
          </div>
        </div>
      </div>

      <p className="mt-3 font-semibold text-sm">{dataset.name}</p>
      {dataset.description && (
        <p className="mt-1 text-sm text-foreground/70 leading-relaxed">{dataset.description}</p>
      )}

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label={t("explore.datasetCard.samples")}  value={dataset.spectra_count != null ? dataset.spectra_count.toLocaleString() : "0"} />
        <Stat label={t("explore.datasetCard.variables")} value={dataset.x_points != null ? dataset.x_points.toLocaleString() : "—"} />
        <Stat label={t("explore.datasetCard.xUnit")} value={dataset.x_unit} />
        <Stat label={t("explore.datasetCard.yUnit")} value={dataset.y_unit} />
      </div>

      <div className="mt-5 pt-4 border-t border-border flex items-center gap-2">
        <LinkButton to="/datasets/$id" params={{ id: String(dataset.id) }} variant="outline">
          <Eye className="h-4 w-4" /> {t("explore.datasetCard.view")}
        </LinkButton>
      </div>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className="font-mono font-semibold text-sm mt-0.5">{value}</p>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="p-5 space-y-3 animate-pulse">
          <div className="flex gap-3">
            <div className="h-11 w-11 rounded-full bg-muted" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 w-40 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          </div>
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-3/4 rounded bg-muted" />
        </Card>
      ))}
    </div>
  );
}

function FeedEmpty() {
  const { t } = useTranslation();
  return (
    <Card className="p-12 flex flex-col items-center gap-4 text-center">
      <FlaskConical className="h-10 w-10 text-muted-foreground/40" />
      <div>
        <p className="font-semibold text-foreground">{t("explore.empty.title")}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {t("explore.empty.hint")}
        </p>
      </div>
      <LinkButton to="/modelagem-classica">
        <Plus className="h-4 w-4" /> {t("explore.empty.publishModel")}
      </LinkButton>
    </Card>
  );
}