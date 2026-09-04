// routes/modelagem.novo.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Brain, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { Card, Badge, Button, PageHeader, Field, Input, Select } from "@/components/ui-kit";
import { modelsApi, datasetsApi } from "@/lib/api";
import type {
    AlgorithmInfo, PreprocessingStepInfo, Dataset,
    ModelAlgorithm, PreprocessingEntry, PreprocessingStep,
} from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/modelagem/novo")({
    head: () => ({ meta: [{ title: "Novo modelo — TcheLab" }] }),
    component: Page,
} as const);

const TYPE_LABEL: Record<string, string> = {
    classification: "Classificação",
    regression:     "Regressão",
    exploratory:    "Exploratório",
};

// Classificação → Regressão → Exploratório
const TYPE_ORDER = ["classification", "regression", "exploratory"];

// ─── Page ─────────────────────────────────────────────────────────────────────

function Page() {
    const navigate = useNavigate();

    const [algorithms,    setAlgorithms]    = useState<AlgorithmInfo[]>([]);
    const [prepSteps,     setPrepSteps]     = useState<PreprocessingStepInfo[]>([]);
    const [datasets,      setDatasets]      = useState<Dataset[]>([]);
    const [loadingMeta,   setLoadingMeta]   = useState(true);

    const [name,          setName]          = useState("");
    const [datasetId,     setDatasetId]     = useState("");
    const [algorithm,     setAlgorithm]     = useState<ModelAlgorithm | "">("");
    const [cvFolds,       setCvFolds]       = useState(5);
    const [testSplit,     setTestSplit]     = useState(0.2);
    const [hyperparams,   setHyperparams]   = useState<Record<string, string | number | boolean>>({});
    const [preprocessing, setPreprocessing] = useState<{ step: string; params: Record<string, number> }[]>([]);
    const [submitting,    setSubmitting]    = useState(false);
    const [validationOpen, setValidationOpen] = useState(false);

    useEffect(() => {
        Promise.all([
            modelsApi.listAlgorithms(),
            datasetsApi.list({ limit: 100 }),
        ]).then(([algoRes, dsRes]) => {
            setAlgorithms(algoRes.data.algorithms);
            setPrepSteps(algoRes.data.preprocessing_steps);
            setDatasets(dsRes.data.data);
        }).catch(() => toast.error("Erro ao carregar configurações."))
            .finally(() => setLoadingMeta(false));
    }, []);

    function initHyperparams(algo: AlgorithmInfo) {
        const defaults: Record<string, string | number | boolean> = {};
        Object.entries(algo.hyperparameters).forEach(([k, v]) => {
            defaults[k] = v.default as string | number | boolean;
        });
        setHyperparams(defaults);
    }

    function handleAlgorithmChange(algo: ModelAlgorithm) {
        setAlgorithm(algo);
        const info = algorithms.find(a => a.algorithm === algo);
        if (info) initHyperparams(info);
    }

    function addPreprocessingStep(step: string) {
        if (preprocessing.find(p => p.step === step)) return;
        setPreprocessing(prev => [...prev, { step, params: {} }]);
    }

    function removePreprocessingStep(step: string) {
        setPreprocessing(prev => prev.filter(p => p.step !== step));
    }

    function updatePrepParam(step: string, key: string, value: number) {
        setPreprocessing(prev => prev.map(p =>
            p.step === step ? { ...p, params: { ...p.params, [key]: value } } : p
        ));
    }

    const selectedAlgo    = algorithms.find(a => a.algorithm === algorithm);
    const selectedDataset = datasets.find(d => String(d.id) === datasetId);
    const hasHyperparams  = selectedAlgo && Object.keys(selectedAlgo.hyperparameters).length > 0;

    const grouped = TYPE_ORDER.map(type => ({
        type,
        items: algorithms.filter(a => a.model_type === type),
    })).filter(g => g.items.length > 0);

    async function handleSubmit() {
        if (!algorithm)   { toast.error("Selecione um algoritmo.");        return; }
        if (!name.trim()) { toast.error("Informe um nome para o modelo."); return; }
        if (!datasetId)   { toast.error("Selecione um dataset.");          return; }

        setSubmitting(true);
        try {
            const hp: Record<string, unknown> = {};
            if (selectedAlgo) {
                Object.entries(hyperparams).forEach(([k, v]) => {
                    const schema = selectedAlgo.hyperparameters[k];
                    if (schema?.type === "int")        hp[k] = parseInt(String(v));
                    else if (schema?.type === "float") hp[k] = parseFloat(String(v));
                    else if (schema?.type === "bool")  hp[k] = v === true || v === "true";
                    else                               hp[k] = v;
                });
            }

            const prep: PreprocessingEntry[] = preprocessing.map(p => ({
                step:   p.step as PreprocessingStep,
                params: p.params,
            }));

            const { data } = await modelsApi.train({
                name:            name.trim(),
                dataset_id:      Number(datasetId),
                algorithm:       algorithm as ModelAlgorithm,
                hyperparameters: hp,
                preprocessing:   prep,
                cv_folds:        cvFolds,
                test_split:      testSplit,
            });

            toast.success("Treino enfileirado! Acompanhe no Histórico.");
            navigate({ to: "/modelagem/$id", params: { id: String(data.model_id) } });
        } catch (e: any) {
            toast.error(e?.response?.data?.message ?? "Erro ao iniciar treino.");
        } finally {
            setSubmitting(false);
        }
    }

    if (loadingMeta) return (
        <div className="flex justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );

    return (
        <>
            <PageHeader
                title="Novo modelo"
                subtitle="Escolha um algoritmo, configure o pré-processamento e identifique o modelo."
                actions={
                    <Button variant="outline" size="sm" onClick={() => navigate({ to: "/modelagem" })}>
                        <ArrowLeft className="h-4 w-4" /> Voltar
                    </Button>
                }
            />

            {/* ── Layout 3 colunas ──────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-5">

                {/* ── Col 1: Algoritmos + Pré-processamento ─────────────────── */}
                <div className="space-y-4">

                    {/* 1. Algoritmo */}
                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                            <StepBadge n={1} />
                            <h2 className="font-semibold text-sm">Algoritmo</h2>
                        </div>

                        <div className="space-y-4">
                            {grouped.map(({ type, items }) => (
                                <div key={type}>
                                    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1.5 px-1">
                                        {TYPE_LABEL[type] ?? type}
                                    </p>
                                    <div className="space-y-1.5">
                                        {items.map(a => (
                                            <button
                                                key={a.algorithm}
                                                onClick={() => handleAlgorithmChange(a.algorithm)}
                                                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                                                    algorithm === a.algorithm
                                                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                                        : "border-border hover:bg-muted/50"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-semibold text-sm">{a.algorithm}</span>
                                                    {algorithm === a.algorithm && (
                                                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                                                    {a.description}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* 2. Pré-processamento */}
                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <StepBadge n={2} />
                            <h2 className="font-semibold text-sm">Pré-processamento</h2>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3 ml-7">
                            Aplicado ao espectro antes do treino, na ordem listada.
                        </p>

                        {preprocessing.length > 0 && (
                            <div className="space-y-1.5 mb-3">
                                {preprocessing.map((p, idx) => {
                                    const info = prepSteps.find(s => s.step === p.step);
                                    return (
                                        <div key={p.step} className="border border-border rounded-lg p-2.5">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] text-muted-foreground font-mono">{idx + 1}.</span>
                                                    <span className="text-xs font-medium">{info?.label ?? p.step}</span>
                                                </div>
                                                <button
                                                    onClick={() => removePreprocessingStep(p.step)}
                                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                            {info?.params && Object.keys(info.params).length > 0 && (
                                                <div className="space-y-2 mt-2">
                                                    {Object.entries(info.params).map(([pk, ps]) => (
                                                        <Field key={pk} label={(ps as any).label ?? pk}>
                                                            <Input
                                                                type="number"
                                                                step={(ps as any).step ?? 1}
                                                                min={(ps as any).min}
                                                                max={(ps as any).max}
                                                                value={p.params[pk] ?? (ps as any).default ?? ""}
                                                                onChange={e => updatePrepParam(p.step, pk, Number(e.target.value))}
                                                            />
                                                        </Field>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                            {prepSteps
                                .filter(s => s.step !== "none" && !preprocessing.find(p => p.step === s.step))
                                .map(s => (
                                    <button
                                        key={s.step}
                                        onClick={() => addPreprocessingStep(s.step)}
                                        className="flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                                    >
                                        <Plus className="h-2.5 w-2.5" /> {s.label}
                                    </button>
                                ))}
                        </div>
                        {preprocessing.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                                Nenhuma etapa — espectro bruto será usado.
                            </p>
                        )}
                    </Card>
                </div>

                {/* ── Col 2: Hiperparâmetros ────────────────────────────────── */}
                <Card className="p-5 h-fit">
                    {!algorithm ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                                <Brain className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                            <p className="text-sm font-medium text-muted-foreground">Selecione um algoritmo</p>
                            <p className="text-xs text-muted-foreground/70 max-w-[200px]">
                                Os hiperparâmetros aparecerão aqui após a escolha.
                            </p>
                        </div>
                    ) : !hasHyperparams ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Brain className="h-6 w-6 text-primary/60" />
                            </div>
                            <p className="text-sm font-semibold">{selectedAlgo?.algorithm}</p>
                            <p className="text-xs text-muted-foreground">
                                Este algoritmo não possui hiperparâmetros configuráveis.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                                        Hiperparâmetros
                                    </p>
                                    <p className="font-bold text-lg mt-0.5">{selectedAlgo?.algorithm}</p>
                                </div>
                                <Badge tone="neutral">
                                    {selectedAlgo?.model_type === "classification" ? "Classificação"
                                        : selectedAlgo?.model_type === "regression" ? "Regressão"
                                        : "Exploratório"}
                                </Badge>
                            </div>

                            <div className="space-y-5">
                                {Object.entries(selectedAlgo!.hyperparameters).map(([key, schema]) => (
                                    <div key={key} className="space-y-1.5">
                                        <label className="text-sm font-medium block">{schema.label}</label>
                                        {schema.type === "select" ? (
                                            <Select
                                                value={String(hyperparams[key] ?? schema.default)}
                                                onChange={e => setHyperparams(p => ({ ...p, [key]: e.target.value }))}
                                            >
                                                {schema.options?.map(o => <option key={o} value={o}>{o}</option>)}
                                            </Select>
                                        ) : schema.type === "bool" ? (
                                            <Select
                                                value={String(hyperparams[key] ?? schema.default)}
                                                onChange={e => setHyperparams(p => ({ ...p, [key]: e.target.value === "true" }))}
                                            >
                                                <option value="false">Não</option>
                                                <option value="true">Sim</option>
                                            </Select>
                                        ) : (
                                            <div className="space-y-1">
                                                <Input
                                                    type="number"
                                                    step={schema.step ?? (schema.type === "float" ? 0.01 : 1)}
                                                    min={schema.min}
                                                    max={schema.max}
                                                    value={String(hyperparams[key] ?? schema.default)}
                                                    onChange={e => setHyperparams(p => ({ ...p, [key]: e.target.value }))}
                                                />
                                                {(schema.min != null || schema.max != null) && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {schema.min != null && schema.max != null
                                                            ? `Entre ${schema.min} e ${schema.max}`
                                                            : schema.min != null
                                                            ? `Mínimo ${schema.min}`
                                                            : `Máximo ${schema.max}`}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {selectedAlgo?.description && (
                                <div className="mt-6 pt-4 border-t border-border">
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {selectedAlgo.description}
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </Card>

                {/* ── Col 3: Identificação + Validação + Resumo ─────────────── */}
                <div className="space-y-4">

                    {/* 3. Identificação */}
                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                            <StepBadge n={3} />
                            <h2 className="font-semibold text-sm">Identificação</h2>
                        </div>
                        <div className="space-y-3">
                            <Field label="Nome do modelo">
                                <Input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="ex: PCA_UV-Vis_pigmentos"
                                />
                            </Field>
                            <Field label="Dataset">
                                <Select value={datasetId} onChange={e => setDatasetId(e.target.value)}>
                                    <option value="">Selecione um dataset…</option>
                                    {datasets.map(d => (
                                        <option key={d.id} value={d.id}>
                                            {d.name} — {d.technique} · {d.spectra_count} espectros
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            {selectedDataset && (
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                    <Badge tone="primary">{selectedDataset.technique}</Badge>
                                    <Badge tone="neutral">{selectedDataset.x_unit} / {selectedDataset.y_unit}</Badge>
                                    <Badge tone="neutral">{selectedDataset.spectra_count ?? 0} amostras</Badge>
                                    {selectedDataset.x_points != null && (
                                        <Badge tone="neutral">{selectedDataset.x_points} variáveis</Badge>
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Validação colapsável */}
                    <Card className="overflow-hidden">
                        <button
                            onClick={() => setValidationOpen(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">Validação</span>
                                <span className="text-xs text-muted-foreground">
                                    {cvFolds}-fold · {testSplit === 0 ? "sem teste" : `${(testSplit * 100).toFixed(0)}% teste`}
                                </span>
                            </div>
                            {validationOpen
                                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                        </button>

                        {validationOpen && (
                            <div className="px-4 pb-4 pt-1 border-t border-border space-y-4">
                                <Field label={`Folds de validação cruzada (${cvFolds})`}>
                                    <input
                                        type="range" min={2} max={20} value={cvFolds}
                                        onChange={e => setCvFolds(Number(e.target.value))}
                                        className="w-full accent-primary"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">{cvFolds}-fold CV</p>
                                </Field>
                                <Field label={`Fração de teste (${(testSplit * 100).toFixed(0)}%)`}>
                                    <input
                                        type="range" min={0} max={50} step={5} value={testSplit * 100}
                                        onChange={e => setTestSplit(Number(e.target.value) / 100)}
                                        className="w-full accent-primary"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {testSplit === 0
                                            ? "Sem conjunto de teste separado"
                                            : `${(testSplit * 100).toFixed(0)}% reservados para teste`}
                                    </p>
                                </Field>
                            </div>
                        )}
                    </Card>

                    {/* Resumo + botão */}
                    <Card className="p-4">
                        <h2 className="font-semibold text-sm mb-3">Resumo</h2>
                        <dl className="space-y-2 text-xs mb-4">
                            <SummaryRow k="Algoritmo" v={algorithm || "—"} />
                            <SummaryRow k="Pré-proc." v={preprocessing.length === 0 ? "Nenhum" : preprocessing.map(p => p.step).join(" → ")} />
                            <SummaryRow k="Nome"      v={name.trim() || "—"} />
                            <SummaryRow k="Dataset"   v={selectedDataset?.name ?? "—"} />
                            <SummaryRow k="CV folds"  v={String(cvFolds)} />
                            <SummaryRow k="Teste"     v={testSplit === 0 ? "Nenhum" : `${(testSplit * 100).toFixed(0)}%`} />
                        </dl>
                        <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                            {submitting
                                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                                : <><Brain className="h-4 w-4" /> Iniciar treino</>}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center mt-3">
                            O treino roda em background. Acompanhe no Histórico.
                        </p>
                    </Card>
                </div>
            </div>
        </>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StepBadge({ n }: { n: number }) {
    return (
        <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
            {n}
        </span>
    );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex justify-between gap-3 border-b border-border pb-1.5 last:border-0">
            <dt className="text-muted-foreground shrink-0">{k}</dt>
            <dd className="font-medium text-right truncate max-w-[130px]" title={v}>{v}</dd>
        </div>
    );
}