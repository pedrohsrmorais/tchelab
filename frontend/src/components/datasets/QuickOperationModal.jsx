/**
 * QuickOperationModal — o botão "Realizar operação matricial" do dataset.
 *
 * Importante (decisão explícita do usuário): isto NÃO é um atalho que
 * ignora workflows. Mesmo sendo uma "tela rápida" — escolher a operação,
 * dar um nome, executar e já ver o resultado sem abrir o editor de nós —
 * por baixo isso sempre cria um `workflows` real (1 nó) e dispara pelo
 * mesmo caminho do editor visual (`POST /datasets/:id/operations` no
 * backend, que por sua vez usa `dispatchExecutionCore`). O resultado da
 * operação aparece depois tanto aqui quanto na lista de workflows do
 * usuário, podendo ser reaberto no editor.
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Sigma, Loader2, CheckCircle2, XCircle, ArrowRight, Database } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';

function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Agrupa as técnicas aplicáveis por subcategoria, pra não jogar uma lista
// enorme e sem contexto na cara do usuário.
function groupBySubcategory(techniques) {
  const groups = {};
  for (const t of techniques) {
    const key = t.subcategory || t.family || 'Outras';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}

const SUBCATEGORY_LABELS = {
  algebra_linear: 'Álgebra Linear',
  estatistica_basica: 'Estatística Básica',
};

function ParamField({ name, spec, value, onChange }) {
  const type = spec?.type;
  const label = name + (spec?.description ? '' : '');

  if (Array.isArray(spec?.options)) {
    return (
      <label className="block">
        <span className="text-xs text-slate-400 block mb-1">{name}</span>
        <select
          className="input-field w-full"
          value={value ?? spec.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {spec.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {spec.description && <span className="text-[11px] text-slate-500 block mt-1">{spec.description}</span>}
      </label>
    );
  }

  if (type === 'integer' || type === 'number') {
    return (
      <label className="block">
        <span className="text-xs text-slate-400 block mb-1">{name}</span>
        <input
          type="number"
          className="input-field w-full"
          value={value ?? spec?.default ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder={spec?.default != null ? String(spec.default) : ''}
        />
        {spec?.description && <span className="text-[11px] text-slate-500 block mt-1">{spec.description}</span>}
      </label>
    );
  }

  if (type === 'array' || type === 'object') {
    return (
      <label className="block">
        <span className="text-xs text-slate-400 block mb-1">{name} (JSON)</span>
        <input
          type="text"
          className="input-field w-full font-mono"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={spec?.description || '[ ... ]'}
        />
        {spec?.description && <span className="text-[11px] text-slate-500 block mt-1">{spec.description}</span>}
      </label>
    );
  }

  return (
    <label className="block">
      <span className="text-xs text-slate-400 block mb-1">{name}</span>
      <input
        type="text"
        className="input-field w-full"
        value={value ?? spec?.default ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {spec?.description && <span className="text-[11px] text-slate-500 block mt-1">{spec.description}</span>}
    </label>
  );
}

export default function QuickOperationModal({ dataset, onClose, onCompleted }) {
  const ndim = useMemo(() => {
    const dims = parseJsonField(dataset?.dimensions, null);
    return Array.isArray(dims) ? dims.length : null;
  }, [dataset]);

  // Catálogo completo de técnicas "utility" (as que operam sobre dados já
  // importados — exclui as de categoria "input"/importação).
  const { data: techRaw, loading: loadingTech } = useApi(
    () => api.techniques.list({ category: 'utility', per_page: 200 }),
    [],
  );
  const allTechniques = useMemo(() => techRaw?.data ?? (Array.isArray(techRaw) ? techRaw : []), [techRaw]);

  const applicableTechniques = useMemo(() => {
    return allTechniques.filter((t) => {
      if (ndim == null) return true;
      if (t.min_order != null && ndim < t.min_order) return false;
      if (t.max_order != null && ndim > t.max_order) return false;
      return true;
    });
  }, [allTechniques, ndim]);

  const grouped = useMemo(() => groupBySubcategory(applicableTechniques), [applicableTechniques]);

  const [step, setStep] = useState('pick'); // pick | configure | running | done | error
  const [selected, setSelected] = useState(null);
  const [workflowName, setWorkflowName] = useState('');
  const [saveMode, setSaveMode] = useState('new_dataset'); // padrão: preserva o dataset original
  const [newDatasetName, setNewDatasetName] = useState('');
  const [paramValues, setParamValues] = useState({});
  const [extraInputs, setExtraInputs] = useState({}); // { B: { mode: 'literal'|'dataset', literalText, datasetId } }
  const [submitError, setSubmitError] = useState(null);
  const [resultOp, setResultOp] = useState(null);

  const { data: userDatasetsRaw } = useApi(() => api.datasets.list({ per_page: 200 }), []);
  const userDatasets = useMemo(() => {
    const list = userDatasetsRaw?.data ?? (Array.isArray(userDatasetsRaw) ? userDatasetsRaw : []);
    return list.filter((d) => d.uuid !== dataset?.uuid);
  }, [userDatasetsRaw, dataset]);

  const parameterSchema = useMemo(() => parseJsonField(selected?.parameter_schema, {}), [selected]);
  const inputSchema = useMemo(() => parseJsonField(selected?.input_schema, {}), [selected]);
  const extraKeys = useMemo(() => Object.keys(inputSchema || {}).slice(1), [inputSchema]);

  const pickTechnique = useCallback((t) => {
    setSelected(t);
    setParamValues({});
    const schema = parseJsonField(t.parameter_schema, {});
    const defaults = {};
    for (const [k, spec] of Object.entries(schema || {})) {
      if (spec?.default !== undefined) defaults[k] = spec.default;
    }
    setParamValues(defaults);
    const extras = {};
    for (const k of Object.keys(parseJsonField(t.input_schema, {}) || {}).slice(1)) {
      extras[k] = { mode: 'literal', literalText: '', datasetId: '' };
    }
    setExtraInputs(extras);
    setWorkflowName(`${t.name} em "${dataset?.name}"`);
    setStep('configure');
  }, [dataset]);

  async function handleSubmit() {
    setSubmitError(null);
    if (!workflowName.trim()) {
      setSubmitError('Dê um nome ao workflow desta operação (ex: "Transformação teste 1").');
      return;
    }

    // Monta extra_inputs no formato que o backend espera.
    const resolvedExtraInputs = {};
    for (const key of extraKeys) {
      const cfg = extraInputs[key] || {};
      if (cfg.mode === 'dataset') {
        if (!cfg.datasetId) { setSubmitError(`Escolha um dataset para "${key}".`); return; }
        resolvedExtraInputs[key] = { type: 'dataset', dataset_id: cfg.datasetId };
      } else {
        let value = cfg.literalText;
        if (value === '' || value == null) { setSubmitError(`Informe um valor para "${key}".`); return; }
        try { value = JSON.parse(value); } catch { /* mantém como número/string crua */
          const asNum = Number(value);
          if (!Number.isNaN(asNum)) value = asNum;
        }
        resolvedExtraInputs[key] = { type: 'literal', value };
      }
    }

    // Monta params a partir do parameter_schema (convertendo campos "array"
    // digitados como texto JSON).
    const params = {};
    for (const [k, spec] of Object.entries(parameterSchema || {})) {
      let v = paramValues[k];
      if (v === undefined || v === null || v === '') continue;
      if ((spec?.type === 'array' || spec?.type === 'object') && typeof v === 'string') {
        try { v = JSON.parse(v); } catch { setSubmitError(`"${k}" precisa ser um JSON válido.`); return; }
      }
      params[k] = v;
    }

    setStep('running');
    try {
      const res = await api.datasets.createOperation(dataset.uuid, {
        technique_id: selected.uuid,
        params,
        workflow_name: workflowName.trim(),
        save_mode: saveMode,
        new_dataset_name: saveMode === 'new_dataset' && newDatasetName.trim() ? newDatasetName.trim() : undefined,
        extra_inputs: resolvedExtraInputs,
      });
      const operationId = (res.data?.data ?? res.data)?.operation_id;
      pollOperation(operationId);
    } catch (e) {
      setStep('error');
      setSubmitError(e.response?.data?.error?.message || e.message);
    }
  }

  function pollOperation(operationId) {
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const res = await api.operations.get(operationId);
        const op = res.data?.data ?? res.data;
        if (op.status === 'completed' || op.status === 'failed') {
          setResultOp(op);
          setStep(op.status === 'completed' ? 'done' : 'error');
          if (op.status === 'failed') setSubmitError(op.error_message);
          if (op.status === 'completed') onCompleted?.(op);
          return;
        }
        if (attempts < 40) setTimeout(tick, 1500);
        else { setStep('error'); setSubmitError('A operação está demorando mais que o esperado. Verifique a lista de workflows.'); }
      } catch (e) {
        setStep('error');
        setSubmitError(e.response?.data?.error?.message || e.message);
      }
    };
    tick();
  }

  return (
    <Modal open onClose={onClose} title="Realizar operação matricial" size="lg">
      {step === 'pick' && (
        <div className="space-y-5">
          <p className="text-sm text-slate-400">
            Escolha a operação a aplicar em <strong className="text-slate-200">{dataset?.name}</strong>.
            {ndim != null && <> Este dataset tem <strong className="text-slate-200">{ndim}</strong> dimensão{ndim !== 1 ? 'ões' : ''}.</>}
          </p>

          {loadingTech && <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando técnicas…</div>}

          {!loadingTech && Object.keys(grouped).length === 0 && (
            <p className="text-sm text-amber-400">Nenhuma operação compatível com as dimensões deste dataset foi encontrada.</p>
          )}

          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {SUBCATEGORY_LABELS[group] || group}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((t) => (
                  <button
                    key={t.uuid}
                    onClick={() => pickTechnique(t)}
                    className="text-left p-3 rounded-lg border border-white/10 hover:border-blue-400/50 hover:bg-blue-500/10 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Sigma className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-200">{t.name}</span>
                    </div>
                    {t.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {step === 'configure' && selected && (
        <div className="space-y-5">
          <button onClick={() => setStep('pick')} className="text-xs text-slate-400 hover:text-white">← Escolher outra operação</button>

          <div className="flex items-center gap-2">
            <Sigma className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-semibold text-white">{selected.name}</h3>
          </div>
          {selected.description && <p className="text-sm text-slate-400">{selected.description}</p>}

          {/* Nome do workflow — toda operação, mesmo rápida, fica salva como um workflow real */}
          <label className="block">
            <span className="text-xs text-slate-400 block mb-1">Nome do workflow <span className="text-red-400">*</span></span>
            <input
              type="text"
              className="input-field w-full"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder='Ex: "Transformação teste 1"'
            />
            <span className="text-[11px] text-slate-500 block mt-1">
              Esta operação será salva como um workflow de verdade na sua lista de workflows, mesmo sendo executada aqui de forma rápida.
            </span>
          </label>

          {/* Entradas extras (operações binárias: soma, subtração, produto matricial...) */}
          {extraKeys.map((key) => {
            const cfg = extraInputs[key] || { mode: 'literal', literalText: '', datasetId: '' };
            return (
              <div key={key} className="p-3 rounded-lg border border-white/10 space-y-2">
                <span className="text-xs text-slate-400 block">Segunda entrada ("{key}")</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setExtraInputs((p) => ({ ...p, [key]: { ...cfg, mode: 'literal' } }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${cfg.mode === 'literal' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400'}`}
                  >
                    Valor literal
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtraInputs((p) => ({ ...p, [key]: { ...cfg, mode: 'dataset' } }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${cfg.mode === 'dataset' ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400'}`}
                  >
                    Outro dataset
                  </button>
                </div>
                {cfg.mode === 'literal' ? (
                  <input
                    type="text"
                    className="input-field w-full font-mono"
                    placeholder='Ex: 1 ou [[1,0],[0,1]]'
                    value={cfg.literalText}
                    onChange={(e) => setExtraInputs((p) => ({ ...p, [key]: { ...cfg, literalText: e.target.value } }))}
                  />
                ) : (
                  <select
                    className="input-field w-full"
                    value={cfg.datasetId}
                    onChange={(e) => setExtraInputs((p) => ({ ...p, [key]: { ...cfg, datasetId: e.target.value } }))}
                  >
                    <option value="">Selecione um dataset…</option>
                    {userDatasets.map((d) => (
                      <option key={d.uuid} value={d.uuid}>{d.name}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}

          {/* Parâmetros específicos da técnica */}
          {Object.keys(parameterSchema || {}).length > 0 && (
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Parâmetros</span>
              {Object.entries(parameterSchema).map(([name, spec]) => (
                <ParamField
                  key={name}
                  name={name}
                  spec={spec}
                  value={paramValues[name]}
                  onChange={(v) => setParamValues((p) => ({ ...p, [name]: v }))}
                />
              ))}
            </div>
          )}

          {/* Destino do resultado — "Salvar como novo dataset" é o padrão
              porque ~90% dos casos são pré-processamento e os dados
              originais não devem ser perdidos. */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Resultado</span>
            <label className="flex items-start gap-2 p-3 rounded-lg border border-white/10 cursor-pointer" style={saveMode === 'new_dataset' ? { borderColor: 'rgba(96,165,250,0.5)', background: 'rgba(59,130,246,0.08)' } : {}}>
              <input type="radio" className="mt-1" checked={saveMode === 'new_dataset'} onChange={() => setSaveMode('new_dataset')} />
              <div>
                <span className="text-sm text-slate-200 font-medium">Salvar resultado como novo dataset</span>
                <p className="text-xs text-slate-500">Recomendado — preserva os dados originais. Ideal para pré-processamento.</p>
                {saveMode === 'new_dataset' && (
                  <input
                    type="text"
                    className="input-field w-full mt-2"
                    placeholder={`Ex: "${dataset?.name} — ${selected.name}"`}
                    value={newDatasetName}
                    onChange={(e) => setNewDatasetName(e.target.value)}
                  />
                )}
              </div>
            </label>
            <label className="flex items-start gap-2 p-3 rounded-lg border border-white/10 cursor-pointer" style={saveMode === 'in_place' ? { borderColor: 'rgba(96,165,250,0.5)', background: 'rgba(59,130,246,0.08)' } : {}}>
              <input type="radio" className="mt-1" checked={saveMode === 'in_place'} onChange={() => setSaveMode('in_place')} />
              <div>
                <span className="text-sm text-slate-200 font-medium">Aplicar neste dataset</span>
                <p className="text-xs text-slate-500">Substitui os dados deste dataset pelo resultado da operação.</p>
              </div>
            </label>
          </div>

          {submitError && <p className="text-sm text-red-400">{submitError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancelar</button>
            <button onClick={handleSubmit} className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2">
              Executar <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'running' && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm text-slate-300">Executando "{selected?.name}"…</p>
          <p className="text-xs text-slate-500">O workflow "{workflowName}" foi criado e está sendo processado.</p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
          <p className="text-sm text-slate-200 font-medium">Operação concluída!</p>
          {resultOp?.output_dataset_name ? (
            <p className="text-sm text-slate-400 inline-flex items-center gap-1.5">
              <Database className="w-4 h-4" /> Novo dataset: <strong className="text-slate-200">{resultOp.output_dataset_name}</strong>
            </p>
          ) : (
            <p className="text-sm text-slate-400">O dataset foi atualizado com o resultado.</p>
          )}
          <div className="flex gap-2 mt-2">
            <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Fechar</button>
            {resultOp?.output_dataset_uuid && (
              <a href={`/datasets/${resultOp.output_dataset_uuid}`} className="btn-primary px-4 py-2 text-sm">Abrir novo dataset</a>
            )}
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <XCircle className="w-10 h-10 text-red-400" />
          <p className="text-sm text-slate-200 font-medium">Não foi possível concluir a operação.</p>
          {submitError && <p className="text-xs text-red-400 max-w-md">{submitError}</p>}
          <div className="flex gap-2 mt-2">
            <button onClick={() => setStep('configure')} className="btn-ghost px-4 py-2 text-sm">Voltar</button>
            <button onClick={onClose} className="btn-primary px-4 py-2 text-sm">Fechar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
