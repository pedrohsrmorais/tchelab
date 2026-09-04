// modelagem.$id.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Brain, Loader2, Trash2, Globe, Lock } from "lucide-react";
import { Card, Badge, Button, PageHeader } from "@/components/ui-kit";
import { modelsApi } from "@/lib/api";
import type { Model } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/modelagem/$id")({
    head: () => ({ meta: [{ title: "Modelo — TcheLab" }] }),
    component: Page,
});

// ─── Helpers numéricos ────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 4): string {
    return v != null ? v.toFixed(decimals) : "—";
}
function fmtPct(v: number | null | undefined, decimals = 2): string {
    return v != null ? `${(v * 100).toFixed(decimals)}%` : "—";
}
function fmtPctPlusMinus(mean: number | null | undefined, std: number | null | undefined, decimals = 2): string {
    if (mean == null) return "—";
    return `${(mean * 100).toFixed(decimals)} ± ${((std ?? 0) * 100).toFixed(decimals)}%`;
}
function fmtPlusMinus(mean: number | null | undefined, std: number | null | undefined, decimals = 4): string {
    if (mean == null) return "—";
    return `${mean.toFixed(decimals)} ± ${(std ?? 0).toFixed(decimals)}`;
}

// ─── Tipos das métricas ───────────────────────────────────────────────────────

interface ExploratoryMetrics {
    scores: number[][];
    loadings: number[][];
    explained_variance: number[];
    cumulative_variance: number[];
    n_components: number;
    classes: string[];
}

interface ClassificationMetrics {
    accuracy:         number | null;
    f1_weighted:      number | null;
    f1_macro?:        number | null;
    confusion_matrix: number[][];
    classes:          string[];
}

interface CVMetrics {
    cv_folds:          number;
    accuracy_mean?:    number | null;
    accuracy_std?:     number | null;
    f1_weighted_mean?: number | null;
    f1_weighted_std?:  number | null;
    rmsecv?:           number | null;
    note?:             string;
}

interface RegressionMetrics {
    r2:           number | null;
    rmsec:        number | null;
    rmsep?:       number | null;
    bias?:        number | null;
    n_components?: number | null;
    y_cal?:       number[];
    y_pred_cal?:  number[];
}

// ─── Paleta ───────────────────────────────────────────────────────────────────

const CLASS_COLORS = [
    "#378ADD", "#7F77DD", "#1D9E75", "#D4537E", "#BA7517",
    "#888780", "#E07B39", "#5BAD8F", "#9B59B6", "#2ECC71",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

function Page() {
    const { t } = useTranslation();
    const { id } = Route.useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [model,   setModel]   = useState<Model | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab,     setTab]     = useState("results");

    const STATUS_BADGE: Record<string, string> = {
        ready:    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
        pending:  "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400",
        training: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
        failed:   "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
    };
    const STATUS_LABEL: Record<string, string> = {
        ready: t("modelDetail.status.ready"), pending: t("modelDetail.status.pending"),
        training: t("modelDetail.status.training"), failed: t("modelDetail.status.failed"),
    };

    useEffect(() => {
        modelsApi.get(id)
            .then(({ data }) => { setModel(data); })
            .catch(() => { toast.error(t("modelDetail.notFound")); navigate({ to: "/modelagem" }); })
            .finally(() => setLoading(false));
    }, [id]);

    async function handleDelete() {
        if (!confirm(t("modelDetail.confirmDelete", { name: model?.name }))) return;
        try { await modelsApi.delete(id); toast.success(t("modelDetail.removed")); navigate({ to: "/modelagem" }); }
        catch { toast.error(t("modelDetail.deleteError")); }
    }

    async function handleVisibility() {
        if (!model) return;
        const next = model.visibility === "public" ? "private" : "public";
        try {
            await modelsApi.update(id, { visibility: next });
            setModel((m) => m ? { ...m, visibility: next } : m);
            toast.success(next === "public" ? t("modelDetail.published") : t("modelDetail.madePrivate"));
        } catch { toast.error(t("modelDetail.visibilityError")); }
    }

    const isOwner = !!user && !!model && (model as any).owner_id === user.id;
    const cal = model?.metrics_cal as Record<string, unknown> | null;
    const cv  = model?.metrics_cv  as CVMetrics | null;
    const ext = model?.metrics_ext as Record<string, unknown> | null;

    const isExploratory    = !!cal && "scores"   in cal;
    const isClassification = !!cal && "accuracy" in cal;
    const isRegression     = !!cal && "r2"       in cal;

    const tabs: { key: string; label: string }[] = [
        { key: "results", label: isExploratory ? t("modelDetail.tabs.scorePlot") : t("modelDetail.tabs.results") },
        ...(isExploratory ? [
            { key: "loadings", label: t("modelDetail.tabs.loadings") },
            { key: "scree",    label: t("modelDetail.tabs.variance") },
        ] : []),
        ...(isClassification ? [{ key: "confusion", label: t("modelDetail.tabs.confusion") }] : []),
        { key: "info", label: t("modelDetail.tabs.info") },
    ];

    if (loading) return (
        <div className="flex justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );
    if (!model) return null;

    return (
        <>
            <PageHeader
                title={model.name}
                subtitle={`${model.algorithm} · ${model.dataset_name ?? "—"} · ${model.dataset_technique ?? ""}`}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/modelagem" })}>
                            <ArrowLeft className="h-4 w-4" /> {t("common.back")}
                        </Button>
                        {isOwner && (
                            <>
                                <Button variant="outline" size="sm" onClick={handleVisibility}>
                                    {model.visibility === "public"
                                        ? <><Lock className="h-4 w-4" /> {t("modelDetail.makePrivate")}</>
                                        : <><Globe className="h-4 w-4" /> {t("modelDetail.publish")}</>}
                                </Button>
                                <Button variant="ghost" size="sm"
                                    className="text-destructive hover:text-destructive" onClick={handleDelete}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                    </div>
                }
            />

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-6">
                <Badge tone="primary">{model.algorithm}</Badge>
                <Badge tone="neutral">{model.model_type}</Badge>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[model.status] ?? ""}`}>
                    {STATUS_LABEL[model.status] ?? model.status}
                </span>
                <Badge tone={model.visibility === "public" ? "success" : "neutral"}>
                    {model.visibility === "public" ? t("common.public") : t("common.private")}
                </Badge>
                {model.dataset_name && <Badge tone="neutral">{model.dataset_name}</Badge>}
            </div>

            {/* ── Resumo numérico ── */}
            {model.status === "ready" && cal && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    {isExploratory && (() => {
                        const m = cal as unknown as ExploratoryMetrics;
                        return <>
                            <StatCard label={t("modelDetail.stats.components")} value={String(m.n_components)} />
                            <StatCard label={t("modelDetail.stats.samples")}    value={String(model.train_samples ?? m.scores?.length ?? "—")} />
                            <StatCard label={t("modelDetail.stats.pc1Var")}     value={fmtPct(m.explained_variance?.[0])} />
                            <StatCard label={t("modelDetail.stats.cumulativeVar")} value={fmtPct(m.cumulative_variance?.[m.n_components - 1])} />
                        </>;
                    })()}

                    {isClassification && (() => {
                        const m = cal as unknown as ClassificationMetrics;
                        return <>
                            <StatCard label={t("modelDetail.stats.accuracyCal")} value={fmtPct(m.accuracy)} />
                            <StatCard label={t("modelDetail.stats.f1Weighted")}  value={fmt(m.f1_weighted, 3)} />
                            {cv?.accuracy_mean    != null && <StatCard label={t("modelDetail.stats.accuracyCv")} value={fmtPctPlusMinus(cv.accuracy_mean, cv.accuracy_std)} />}
                            {cv?.f1_weighted_mean != null && <StatCard label={t("modelDetail.stats.f1Cv")}       value={fmtPlusMinus(cv.f1_weighted_mean, cv.f1_weighted_std, 3)} />}
                            {model.train_samples  != null && <StatCard label={t("modelDetail.stats.trainSamples")} value={String(model.train_samples)} />}
                        </>;
                    })()}

                    {isRegression && (() => {
                        const m    = cal as unknown as RegressionMetrics;
                        const mExt = ext as unknown as RegressionMetrics | null;
                        return <>
                            <StatCard label={t("modelDetail.stats.r2Cal")}   value={fmt(m.r2)} />
                            <StatCard label={t("modelDetail.stats.rmsec")}  value={fmt(m.rmsec)} />
                            {cv?.rmsecv    != null && <StatCard label={t("modelDetail.stats.rmsecv")}  value={fmt(cv.rmsecv)} />}
                            {mExt?.r2      != null && <StatCard label={t("modelDetail.stats.r2Ext")} value={fmt(mExt.r2)} />}
                            {mExt?.rmsep   != null && <StatCard label={t("modelDetail.stats.rmsep")}   value={fmt(mExt.rmsep)} />}
                            {m.n_components != null && <StatCard label={t("modelDetail.stats.components")} value={String(m.n_components)} />}
                        </>;
                    })()}
                </div>
            )}

            {/* Modelo ainda não pronto */}
            {model.status !== "ready" && (
                <Card className="p-8 flex flex-col items-center gap-3 text-center">
                    <Brain className="h-10 w-10 text-muted-foreground/40" />
                    <p className="font-semibold">
                        {model.status === "training" ? t("modelDetail.training") : t("modelDetail.pendingTraining")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {t("modelDetail.resultsHint")}
                    </p>
                </Card>
            )}

            {/* Tabs */}
            {model.status === "ready" && (
                <>
                    <div className="flex gap-2 mb-4 flex-wrap">
                        {tabs.map((tb) => (
                            <button key={tb.key} onClick={() => setTab(tb.key)}
                                className={`px-4 h-8 rounded-full text-xs font-medium border transition-colors ${tab === tb.key
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-card border-border hover:bg-muted"
                                }`}>
                                {tb.label}
                            </button>
                        ))}
                    </div>

                    {isExploratory    && tab === "results"   && <ScorePlot   cal={cal as unknown as ExploratoryMetrics} />}
                    {isExploratory    && tab === "loadings"  && <LoadingsPlot cal={cal as unknown as ExploratoryMetrics} />}
                    {isExploratory    && tab === "scree"     && <ScreePlot   cal={cal as unknown as ExploratoryMetrics} />}
                    {isClassification && tab === "results"   && <ClassResults cal={cal as unknown as ClassificationMetrics} cv={cv} ext={ext as unknown as ClassificationMetrics | null} />}
                    {isClassification && tab === "confusion" && <ConfusionMatrix cal={cal as unknown as ClassificationMetrics} />}
                    {isRegression     && tab === "results"   && <RegressionResults cal={cal as unknown as RegressionMetrics} cv={cv} ext={ext as unknown as RegressionMetrics | null} />}
                    {tab === "info"                          && <ModelInfo model={model} />}
                </>
            )}
        </>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOCOS EXPLORATÓRIOS
// ══════════════════════════════════════════════════════════════════════════════

function ScorePlot({ cal }: { cal: ExploratoryMetrics }) {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef   = useRef<HTMLDivElement>(null);
    const [pcX,     setPcX]     = useState(0);
    const [pcY,     setPcY]     = useState(1);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; px: number; py: number } | null>(null);

    const uniqueClasses = Array.from(new Set(cal.classes));
    const colorMap: Record<string, string> = {};
    uniqueClasses.forEach((c, i) => { colorMap[c ?? "__none__"] = CLASS_COLORS[i % CLASS_COLORS.length]; });

    const draw = useCallback(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const W = canvas.width; const H = canvas.height;
        const PAD = { top: 24, right: 24, bottom: 48, left: 60 };
        ctx.clearRect(0, 0, W, H);

        const xs = cal.scores.map(s => s[pcX]);
        const ys = cal.scores.map(s => s[pcY]);
        const xMin = Math.min(...xs); const xMax = Math.max(...xs);
        const yMin = Math.min(...ys); const yMax = Math.max(...ys);
        const xPad = (xMax - xMin) * 0.12 || 1; const yPad = (yMax - yMin) * 0.12 || 1;

        const toX = (v: number) => PAD.left + ((v - (xMin - xPad)) / ((xMax + xPad) - (xMin - xPad))) * (W - PAD.left - PAD.right);
        const toY = (v: number) => H - PAD.bottom - ((v - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad))) * (H - PAD.top - PAD.bottom);

        const dk    = window.matchMedia("(prefers-color-scheme:dark)").matches;
        const grid  = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        const axis  = dk ? "rgba(255,255,255,0.2)"  : "rgba(0,0,0,0.2)";
        const label = dk ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
        const zero  = dk ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";

        ctx.font = "11px ui-sans-serif,system-ui,sans-serif";
        for (let i = 0; i <= 5; i++) {
            const xv = (xMin - xPad) + ((xMax + xPad) - (xMin - xPad)) / 5 * i;
            const yv = (yMin - yPad) + ((yMax + yPad) - (yMin - yPad)) / 5 * i;
            ctx.strokeStyle = grid; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(toX(xv), PAD.top); ctx.lineTo(toX(xv), H - PAD.bottom); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(PAD.left, toY(yv)); ctx.lineTo(W - PAD.right, toY(yv)); ctx.stroke();
            ctx.fillStyle = label;
            ctx.textAlign = "center"; ctx.fillText(xv.toFixed(2), toX(xv), H - PAD.bottom + 14);
            ctx.textAlign = "right";  ctx.fillText(yv.toFixed(2), PAD.left - 4, toY(yv) + 4);
        }
        ctx.strokeStyle = zero; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(toX(0), PAD.top); ctx.lineTo(toX(0), H - PAD.bottom); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(PAD.left, toY(0)); ctx.lineTo(W - PAD.right, toY(0)); ctx.stroke();
        ctx.setLineDash([]);

        cal.scores.forEach((s, i) => {
            const cls = cal.classes[i] ?? "__none__";
            const col = colorMap[cls];
            ctx.beginPath(); ctx.arc(toX(s[pcX]), toY(s[pcY]), 5, 0, Math.PI * 2);
            ctx.fillStyle = col + "cc"; ctx.fill();
            ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
        });

        const evX = cal.explained_variance?.[pcX];
        const evY = cal.explained_variance?.[pcY];
        ctx.fillStyle = label; ctx.textAlign = "center";
        ctx.fillText(`PC${pcX + 1}${evX != null ? ` (${(evX * 100).toFixed(1)}%)` : ""}`, W / 2, H - 6);
        ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText(`PC${pcY + 1}${evY != null ? ` (${(evY * 100).toFixed(1)}%)` : ""}`, 0, 0); ctx.restore();
        ctx.strokeStyle = axis; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, H - PAD.bottom); ctx.lineTo(W - PAD.right, H - PAD.bottom); ctx.stroke();
    }, [cal, pcX, pcY]);

    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ro = new ResizeObserver(() => {
            canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
            canvas.height = canvas.offsetHeight * window.devicePixelRatio;
            canvas.getContext("2d")?.scale(window.devicePixelRatio, window.devicePixelRatio);
            draw();
        });
        ro.observe(canvas); return () => ro.disconnect();
    }, [draw]);
    useEffect(() => { draw(); }, [draw]);

    function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
        const canvas = canvasRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
        const PAD_L = 60, PAD_R = 24, PAD_T = 24, PAD_B = 48;
        const xs = cal.scores.map(s => s[pcX]); const ys = cal.scores.map(s => s[pcY]);
        const xMin = Math.min(...xs); const xMax = Math.max(...xs);
        const yMin = Math.min(...ys); const yMax = Math.max(...ys);
        const xPad = (xMax - xMin) * 0.12 || 1; const yPad = (yMax - yMin) * 0.12 || 1;
        const toX = (v: number) => PAD_L + ((v - (xMin - xPad)) / ((xMax + xPad) - (xMin - xPad))) * (rect.width  - PAD_L - PAD_R);
        const toY = (v: number) => rect.height - PAD_B - ((v - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad))) * (rect.height - PAD_T - PAD_B);
        let closestIdx: number | null = null;
        let closestDist = Infinity;
        cal.scores.forEach((s, i) => {
            const d = Math.hypot(mx - toX(s[pcX]), my - toY(s[pcY]));
            if (closestIdx === null || d < closestDist) { closestIdx = i; closestDist = d; }
        });
        if (closestIdx !== null && closestDist < 16) {
            const i = closestIdx;
            setTooltip({ x: cal.scores[i][pcX], y: cal.scores[i][pcY], label: cal.classes[i] ?? t("modelDetail.scorePlot.sample", { n: i + 1 }), px: toX(cal.scores[i][pcX]), py: toY(cal.scores[i][pcY]) });
        } else { setTooltip(null); }
    }

    const opts = Array.from({ length: cal.n_components }, (_, i) => i);
    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-semibold text-sm">{t("modelDetail.scorePlot.title")}</h3>
                <div className="flex gap-3 text-xs">
                    {([[t("modelDetail.scorePlot.xAxis"), pcX, setPcX], [t("modelDetail.scorePlot.yAxis"), pcY, setPcY]] as const).map(([lbl, val, set]) => (
                        <label key={String(lbl)} className="flex items-center gap-1.5 text-muted-foreground">
                            {String(lbl)}:
                            <select value={Number(val)} onChange={e => { (set as any)(Number(e.target.value)); setTooltip(null); }}
                                className="border border-border rounded px-2 py-1 bg-card text-foreground text-xs focus:outline-none">
                                {opts.map(i => <option key={i} value={i}>PC{i + 1}</option>)}
                            </select>
                        </label>
                    ))}
                </div>
            </div>
            <div className="relative h-[380px]" ref={wrapRef} onMouseMove={onMouseMove} onMouseLeave={() => setTooltip(null)}>
                <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />
                {tooltip && (
                    <div className="pointer-events-none absolute z-10 bg-card border border-border rounded-lg shadow px-2.5 py-1.5 text-xs"
                        style={{ left: tooltip.px + 12, top: tooltip.py - 32, transform: tooltip.px > 300 ? "translateX(-120%)" : undefined }}>
                        <p className="font-semibold">{tooltip.label}</p>
                        <p className="text-muted-foreground font-mono">PC{pcX + 1}: {tooltip.x.toFixed(3)} · PC{pcY + 1}: {tooltip.y.toFixed(3)}</p>
                    </div>
                )}
            </div>
            {uniqueClasses.length > 0 && uniqueClasses[0] !== null && (
                <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border">
                    {uniqueClasses.map((cls, i) => (
                        <div key={cls ?? i} className="flex items-center gap-1.5 text-xs">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CLASS_COLORS[i % CLASS_COLORS.length] }} />
                            {cls ?? t("modelDetail.scorePlot.noClass")}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

function LoadingsPlot({ cal }: { cal: ExploratoryMetrics }) {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pc, setPc] = useState(0);

    const draw = useCallback(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const W = canvas.width; const H = canvas.height;
        const PAD = { top: 24, right: 24, bottom: 44, left: 60 };
        ctx.clearRect(0, 0, W, H);
        const loadings = cal.loadings?.[pc] ?? [];
        const n = loadings.length; if (!n) return;
        const yMax = Math.max(...loadings.map(Math.abs)) * 1.15 || 1;
        const toX = (i: number) => PAD.left + (i / (n - 1 || 1)) * (W - PAD.left - PAD.right);
        const toY = (v: number) => H - PAD.bottom - ((v + yMax) / (2 * yMax)) * (H - PAD.top - PAD.bottom);
        const dk   = window.matchMedia("(prefers-color-scheme:dark)").matches;
        const grid = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        const axis = dk ? "rgba(255,255,255,0.2)"  : "rgba(0,0,0,0.2)";
        const lbl  = dk ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
        const zero = dk ? "rgba(255,255,255,0.2)"  : "rgba(0,0,0,0.2)";
        const col  = CLASS_COLORS[pc % CLASS_COLORS.length];
        ctx.font = "11px ui-sans-serif,system-ui,sans-serif";
        for (let i = -2; i <= 2; i++) {
            const v = (i / 2) * yMax; const cy = toY(v);
            ctx.strokeStyle = grid; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(W - PAD.right, cy); ctx.stroke();
            ctx.fillStyle = lbl; ctx.textAlign = "right"; ctx.fillText(v.toFixed(3), PAD.left - 4, cy + 4);
        }
        ctx.strokeStyle = zero; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(PAD.left, toY(0)); ctx.lineTo(W - PAD.right, toY(0)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = "round";
        loadings.forEach((v, i) => { const x = toX(i); const y = toY(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
        ctx.stroke();
        ctx.lineTo(toX(n - 1), toY(0)); ctx.lineTo(toX(0), toY(0)); ctx.closePath();
        ctx.fillStyle = col + "22"; ctx.fill();
        ctx.fillStyle = lbl; ctx.textAlign = "center"; ctx.fillText(t("modelDetail.loadingsPlot.variableIndex"), W / 2, H - 4);
        ctx.strokeStyle = axis; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, H - PAD.bottom); ctx.lineTo(W - PAD.right, H - PAD.bottom); ctx.stroke();
    }, [cal, pc, t]);

    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ro = new ResizeObserver(() => {
            canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
            canvas.height = canvas.offsetHeight * window.devicePixelRatio;
            canvas.getContext("2d")?.scale(window.devicePixelRatio, window.devicePixelRatio);
            draw();
        });
        ro.observe(canvas); return () => ro.disconnect();
    }, [draw]);
    useEffect(() => { draw(); }, [draw]);

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="font-semibold text-sm">{t("modelDetail.loadingsPlot.title")}</h3>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t("modelDetail.loadingsPlot.component")}
                    <select value={pc} onChange={e => setPc(Number(e.target.value))}
                        className="border border-border rounded px-2 py-1 bg-card text-foreground text-xs focus:outline-none">
                        {Array.from({ length: cal.n_components }, (_, i) => (
                            <option key={i} value={i}>
                                PC{i + 1} {cal.explained_variance?.[i] != null ? `(${(cal.explained_variance[i] * 100).toFixed(1)}%)` : ""}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="h-[320px]"><canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} /></div>
        </Card>
    );
}

function ScreePlot({ cal }: { cal: ExploratoryMetrics }) {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const draw = useCallback(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const W = canvas.width; const H = canvas.height;
        const PAD = { top: 32, right: 40, bottom: 48, left: 64 };
        ctx.clearRect(0, 0, W, H);
        const n   = cal.n_components;
        const ev  = cal.explained_variance  ?? [];
        const cum = cal.cumulative_variance ?? [];
        const barGap = (W - PAD.left - PAD.right) / n;
        const barW   = barGap * 0.6;
        const toX = (i: number) => PAD.left + i * barGap + barGap / 2;
        const toY = (v: number) => H - PAD.bottom - v * (H - PAD.top - PAD.bottom);
        const dk   = window.matchMedia("(prefers-color-scheme:dark)").matches;
        const grid = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        const axis = dk ? "rgba(255,255,255,0.2)"  : "rgba(0,0,0,0.2)";
        const lbl  = dk ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
        ctx.font = "11px ui-sans-serif,system-ui,sans-serif";
        for (let i = 0; i <= 5; i++) {
            const v = i / 5; const cy = toY(v);
            ctx.strokeStyle = grid; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(W - PAD.right, cy); ctx.stroke();
            ctx.fillStyle = lbl; ctx.textAlign = "right"; ctx.fillText(`${(v * 100).toFixed(0)}%`, PAD.left - 4, cy + 4);
        }
        ev.forEach((v, i) => {
            const x = toX(i) - barW / 2; const y = toY(v); const h = H - PAD.bottom - y;
            ctx.fillStyle   = "#378ADD" + "bb"; ctx.fillRect(x, y, barW, h);
            ctx.strokeStyle = "#378ADD"; ctx.lineWidth = 1; ctx.strokeRect(x, y, barW, h);
            ctx.fillStyle = lbl; ctx.textAlign = "center";
            ctx.fillText(`${(v * 100).toFixed(1)}%`, toX(i), y - 5);
            ctx.fillText(`${t("modelDetail.screePlot.pc")}${i + 1}`, toX(i), H - PAD.bottom + 14);
        });
        if (cum.length > 0) {
            ctx.beginPath(); ctx.strokeStyle = "#D4537E"; ctx.lineWidth = 2; ctx.lineJoin = "round";
            cum.forEach((v, i) => { const x = toX(i); const y = toY(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
            ctx.stroke();
            cum.forEach((v, i) => {
                const x = toX(i); const y = toY(v);
                ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fillStyle = "#D4537E"; ctx.fill();
                ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
            });
        }
        ctx.fillStyle = lbl; ctx.textAlign = "center"; ctx.fillText(t("modelDetail.screePlot.principalComponent"), W / 2, H - 6);
        ctx.strokeStyle = axis; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, H - PAD.bottom); ctx.lineTo(W - PAD.right, H - PAD.bottom); ctx.stroke();
    }, [cal, t]);

    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ro = new ResizeObserver(() => {
            canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
            canvas.height = canvas.offsetHeight * window.devicePixelRatio;
            canvas.getContext("2d")?.scale(window.devicePixelRatio, window.devicePixelRatio);
            draw();
        });
        ro.observe(canvas); return () => ro.disconnect();
    }, [draw]);
    useEffect(() => { draw(); }, [draw]);

    return (
        <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">{t("modelDetail.screePlot.title")}</h3>
            <div className="h-[280px]"><canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} /></div>
            <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                            <th className="text-left px-3 py-2">{t("modelDetail.screePlot.pc")}</th>
                            <th className="text-right px-3 py-2">{t("modelDetail.screePlot.individual")}</th>
                            <th className="text-right px-3 py-2">{t("modelDetail.screePlot.cumulative")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(cal.explained_variance ?? []).map((v, i) => (
                            <tr key={i} className="border-t border-border">
                                <td className="px-3 py-1.5 font-medium">{t("modelDetail.screePlot.pc")}{i + 1}</td>
                                <td className="px-3 py-1.5 text-right font-mono">{(v * 100).toFixed(2)}%</td>
                                <td className="px-3 py-1.5 text-right font-mono">
                                    {cal.cumulative_variance?.[i] != null ? `${(cal.cumulative_variance[i] * 100).toFixed(2)}%` : "—"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOCOS CLASSIFICAÇÃO
// ══════════════════════════════════════════════════════════════════════════════

function ClassResults({ cal, cv, ext }: {
    cal: ClassificationMetrics;
    cv:  CVMetrics | null;
    ext: ClassificationMetrics | null;
}) {
    const { t } = useTranslation();
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricTable title={t("modelDetail.classResults.calibration")} rows={[
                    [t("modelDetail.classResults.accuracy"),     fmtPct(cal.accuracy)],
                    [t("modelDetail.classResults.f1Weighted"), fmt(cal.f1_weighted, 4)],
                    ...(cal.f1_macro != null ? [[t("modelDetail.classResults.f1Macro"), fmt(cal.f1_macro, 4)] as [string, string]] : []),
                    [t("modelDetail.classResults.classes"),      cal.classes?.join(", ") ?? "—"],
                ]} />
                {cv && (
                    <MetricTable title={t("modelDetail.classResults.crossValidation", { n: cv.cv_folds ?? "?" })} rows={[
                        ...(cv.accuracy_mean    != null ? [[t("modelDetail.classResults.accuracy"),     fmtPctPlusMinus(cv.accuracy_mean, cv.accuracy_std)]          as [string, string]] : []),
                        ...(cv.f1_weighted_mean != null ? [[t("modelDetail.classResults.f1Weighted"), fmtPlusMinus(cv.f1_weighted_mean, cv.f1_weighted_std, 4)]    as [string, string]] : []),
                        ...(cv.note             ? [[t("modelDetail.classResults.note"),         cv.note]                                                             as [string, string]] : []),
                    ]} />
                )}
                {ext && (
                    <MetricTable title={t("modelDetail.classResults.externalSet")} rows={[
                        [t("modelDetail.classResults.accuracy"),     fmtPct(ext.accuracy)],
                        [t("modelDetail.classResults.f1Weighted"), fmt(ext.f1_weighted, 4)],
                    ]} />
                )}
            </div>
        </div>
    );
}

function ConfusionMatrix({ cal }: { cal: ClassificationMetrics }) {
    const { t } = useTranslation();
    const mat     = cal.confusion_matrix;
    const classes = cal.classes;
    if (!mat?.length) return <Card className="p-6 text-sm text-muted-foreground">{t("modelDetail.confusionMatrix.unavailable")}</Card>;
    const maxVal = Math.max(...mat.flat());
    return (
        <Card className="p-5 overflow-x-auto">
            <h3 className="font-semibold text-sm mb-4">{t("modelDetail.confusionMatrix.title")}</h3>
            <table className="text-xs border-collapse">
                <thead>
                    <tr>
                        <th className="px-3 py-2 text-muted-foreground font-medium text-right">{t("modelDetail.confusionMatrix.realPred")}</th>
                        {classes.map(c => <th key={c} className="px-3 py-2 font-medium text-center">{c}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {mat.map((row, i) => (
                        <tr key={i}>
                            <td className="px-3 py-2 font-medium text-muted-foreground text-right">{classes[i]}</td>
                            {row.map((val, j) => {
                                const isCorrect = i === j;
                                const intensity = maxVal > 0 ? val / maxVal : 0;
                                const bg = isCorrect
                                    ? `rgba(29,158,117,${0.15 + intensity * 0.7})`
                                    : val > 0 ? `rgba(212,83,126,${0.1 + intensity * 0.6})` : "transparent";
                                return (
                                    <td key={j} className="px-3 py-2 text-center font-mono font-semibold rounded"
                                        style={{ backgroundColor: bg, minWidth: 48 }}>
                                        {val}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">{t("modelDetail.confusionMatrix.legend")}</p>
        </Card>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOCOS REGRESSÃO
// ══════════════════════════════════════════════════════════════════════════════

function RegressionResults({ cal, cv, ext }: {
    cal: RegressionMetrics;
    cv:  CVMetrics | null;
    ext: RegressionMetrics | null;
}) {
    const { t } = useTranslation();
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MetricTable title={t("modelDetail.regressionResults.calibration")} rows={[
                    [t("modelDetail.regressionResults.r2"),          fmt(cal.r2)],
                    [t("modelDetail.regressionResults.rmsec"),       fmt(cal.rmsec)],
                    ...(cal.bias         != null ? [[t("modelDetail.regressionResults.bias"),        fmt(cal.bias)]              as [string, string]] : []),
                    ...(cal.n_components != null ? [[t("modelDetail.regressionResults.components"), String(cal.n_components)]   as [string, string]] : []),
                ]} />
                {cv?.rmsecv != null && (
                    <MetricTable title={t("modelDetail.regressionResults.crossValidation")} rows={[
                        [t("modelDetail.regressionResults.rmsecv"), fmt(cv.rmsecv)],
                        ...(cv.note ? [[t("modelDetail.regressionResults.note"), cv.note] as [string, string]] : []),
                    ]} />
                )}
                {ext && (
                    <MetricTable title={t("modelDetail.regressionResults.externalSet")} rows={[
                        ...(ext.r2    != null ? [[t("modelDetail.regressionResults.r2"),    fmt(ext.r2)]    as [string, string]] : []),
                        ...(ext.rmsep != null ? [[t("modelDetail.regressionResults.rmsep"), fmt(ext.rmsep)] as [string, string]] : []),
                    ]} />
                )}
            </div>
            {cal.y_cal && cal.y_pred_cal && (
                <ScatterCalPred y_cal={cal.y_cal} y_pred={cal.y_pred_cal} />
            )}
        </div>
    );
}

function ScatterCalPred({ y_cal, y_pred }: { y_cal: number[]; y_pred: number[] }) {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const draw = useCallback(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext("2d"); if (!ctx) return;
        const W = canvas.width; const H = canvas.height;
        const PAD = { top: 24, right: 24, bottom: 48, left: 60 };
        ctx.clearRect(0, 0, W, H);
        const all = [...y_cal, ...y_pred];
        const mn = Math.min(...all); const mx = Math.max(...all);
        const pad = (mx - mn) * 0.1 || 1;
        const toX = (v: number) => PAD.left + ((v - (mn - pad)) / ((mx + pad) - (mn - pad))) * (W - PAD.left - PAD.right);
        const toY = (v: number) => H - PAD.bottom - ((v - (mn - pad)) / ((mx + pad) - (mn - pad))) * (H - PAD.top - PAD.bottom);
        const dk   = window.matchMedia("(prefers-color-scheme:dark)").matches;
        const grid = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
        const axis = dk ? "rgba(255,255,255,0.2)"  : "rgba(0,0,0,0.2)";
        const lbl  = dk ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
        ctx.font = "11px ui-sans-serif,system-ui,sans-serif";
        for (let i = 0; i <= 5; i++) {
            const v = (mn - pad) + ((mx + pad) - (mn - pad)) / 5 * i;
            ctx.strokeStyle = grid; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(toX(v), PAD.top); ctx.lineTo(toX(v), H - PAD.bottom); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(PAD.left, toY(v)); ctx.lineTo(W - PAD.right, toY(v)); ctx.stroke();
            ctx.fillStyle = lbl;
            ctx.textAlign = "center"; ctx.fillText(v.toFixed(2), toX(v), H - PAD.bottom + 14);
            ctx.textAlign = "right";  ctx.fillText(v.toFixed(2), PAD.left - 4, toY(v) + 4);
        }
        ctx.strokeStyle = "#378ADD" + "88"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(toX(mn - pad), toY(mn - pad)); ctx.lineTo(toX(mx + pad), toY(mx + pad)); ctx.stroke();
        ctx.setLineDash([]);
        y_cal.forEach((yc, i) => {
            ctx.beginPath(); ctx.arc(toX(yc), toY(y_pred[i]), 5, 0, Math.PI * 2);
            ctx.fillStyle = "#378ADD" + "cc"; ctx.fill();
            ctx.strokeStyle = "#378ADD"; ctx.lineWidth = 1; ctx.stroke();
        });
        ctx.fillStyle = lbl; ctx.textAlign = "center"; ctx.fillText(t("modelDetail.scatterPlot.yMeasured"), W / 2, H - 6);
        ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(t("modelDetail.scatterPlot.yPredicted"), 0, 0); ctx.restore();
        ctx.strokeStyle = axis; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, H - PAD.bottom); ctx.lineTo(W - PAD.right, H - PAD.bottom); ctx.stroke();
    }, [y_cal, y_pred, t]);
    useEffect(() => {
        const c = canvasRef.current; if (!c) return;
        const ro = new ResizeObserver(() => {
            c.width  = c.offsetWidth  * window.devicePixelRatio;
            c.height = c.offsetHeight * window.devicePixelRatio;
            c.getContext("2d")?.scale(window.devicePixelRatio, window.devicePixelRatio);
            draw();
        });
        ro.observe(c); return () => ro.disconnect();
    }, [draw]);
    useEffect(() => { draw(); }, [draw]);

    return (
        <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">{t("modelDetail.scatterPlot.title")}</h3>
            <div className="h-[300px]"><canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} /></div>
            <p className="text-xs text-muted-foreground mt-2">{t("modelDetail.scatterPlot.note")}</p>
        </Card>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// INFORMAÇÕES DO MODELO
// ══════════════════════════════════════════════════════════════════════════════

function ModelInfo({ model }: { model: Model }) {
    const { t } = useTranslation();
    const hp = model.hyperparameters as Record<string, unknown> | null;
    const pp = model.preprocessing   as Array<{ step: string; [k: string]: unknown }> | null;
    return (
        <Card className="p-6 max-w-lg">
            <dl className="space-y-2 text-sm">
                <Row k={t("modelDetail.info.name")}        v={model.name} />
                <Row k={t("modelDetail.info.algorithm")}   v={model.algorithm} />
                <Row k={t("modelDetail.info.type")}        v={model.model_type} />
                <Row k={t("modelDetail.info.dataset")}     v={model.dataset_name ?? "—"} />
                <Row k={t("modelDetail.info.technique")}     v={model.dataset_technique ?? "—"} />
                <Row k={t("modelDetail.info.status")}      v={model.status} />
                <Row k={t("modelDetail.info.visibility")} v={model.visibility === "public" ? t("common.public") : t("common.private")} />
                {model.train_samples  != null && <Row k={t("modelDetail.info.trainSamples")} v={String(model.train_samples)} />}
                {model.model_size_kb  != null && <Row k={t("modelDetail.info.size")}         v={`${model.model_size_kb} KB`} />}
                <Row k={t("modelDetail.info.createdAt")}   v={new Date(model.created_at).toLocaleString()} />
            </dl>
            {hp && Object.keys(hp).length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t("modelDetail.info.hyperparameters")}</p>
                    <dl className="space-y-1.5 text-xs">
                        {Object.entries(hp).map(([k, v]) => (
                            <div key={k} className="flex justify-between">
                                <dt className="text-muted-foreground">{k}</dt>
                                <dd className="font-mono font-medium">{String(v)}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
            {pp && pp.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t("modelDetail.info.preprocessing")}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {pp.map((s, i) => <span key={i} className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{s.step}</span>)}
                    </div>
                </div>
            )}
        </Card>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function MetricTable({ title, rows }: { title: string; rows: [string, string][] }) {
    return (
        <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">{title}</p>
            <dl className="space-y-2">
                {rows.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-border pb-1.5 last:border-0 text-sm">
                        <dt className="text-muted-foreground text-xs">{k}</dt>
                        <dd className="font-mono font-semibold text-xs">{v}</dd>
                    </div>
                ))}
            </dl>
        </Card>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
            <p className="font-mono font-semibold text-lg mt-1">{value}</p>
        </Card>
    );
}

function Row({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex justify-between gap-4 border-b border-border pb-1.5 last:border-0">
            <dt className="text-muted-foreground shrink-0 text-xs">{k}</dt>
            <dd className="font-medium text-xs text-right truncate">{v}</dd>
        </div>
    );
}