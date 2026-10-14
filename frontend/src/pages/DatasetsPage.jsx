import React, { useState, useRef, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Database, Search, Upload, FileSpreadsheet, FileText, ClipboardPaste, X, CheckCircle2, ArrowRight, Boxes, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useApi, useMutation } from '../hooks/useApi';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';
import Modal from '../components/ui/Modal';

const MultiDimModal = lazy(() => import('../components/datasets/MultiDimModal'));

// Smart import modal
function ImportModal({ open, onClose, onImported }) {
  const { t } = useTranslation();
  const [step, setStep] = useState('method'); // method | config | preview
  const [method, setMethod] = useState(null); // 'file' | 'paste'
  const [file, setFile] = useState(null);
  const [pasteContent, setPasteContent] = useState('');
  const [pasteFormat, setPasteFormat] = useState('auto'); // auto | csv | json — formato da colagem
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [separator, setSeparator] = useState(',');
  const [previewRows, setPreviewRows] = useState([]);
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [tensorInfo, setTensorInfo] = useState(null); // { tensor, shape } quando detectado tensor 3D/4D+
  const [tensorDims, setTensorDims] = useState(''); // dimensões opcionais informadas pelo usuário, ex: "4,2,3,5"
  const fileRef = useRef();
  const { mutate: importDs, loading: importing } = useMutation(api.datasets.import);
  const { mutate: importTensor, loading: importingTensor } = useMutation(api.datasets.importTensor);
  const { mutate: createDs, loading: creating } = useMutation(api.datasets.create);

  const detectSeparator = (text) => {
    const line = text.split('\n')[0] || '';
    if (line.includes('\t')) return '\t';
    if (line.includes(';')) return ';';
    return ',';
  };

  const parsePreview = (text, sep) => {
    const lines = text.trim().split('\n').slice(0, 6);
    if (lines.length === 0) return;
    const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
    setPreviewHeaders(headers);
    setPreviewRows(rows);
  };

  // --- Detecção de tensor em blocos (3D/4D+) ---------------------------------
  // Os blocos são separados por linhas vazias ou linhas iniciadas em "#".
  // Cada bloco representa uma fatia 2D do tensor; todos os blocos precisam ter
  // o mesmo shape (linhas x colunas) e valores numéricos para serem aceitos.
  const splitBlocks = (text) => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let current = [];
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (trimmed === '' || trimmed.startsWith('#')) {
        if (current.length) { blocks.push(current); current = []; }
        continue;
      }
      current.push(raw);
    }
    if (current.length) blocks.push(current);
    return blocks;
  };

  const detectBlockTensor = (text) => {
    const blocks = splitBlocks(text);
    if (blocks.length < 2) return null; // precisa de >= 2 blocos para formar um tensor 3D
    const sep = detectSeparator(blocks[0][0] || '');
    const parsedBlocks = blocks.map(b => b.map(line => line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))));
    const rowCount = parsedBlocks[0].length;
    const colCount = parsedBlocks[0][0]?.length || 0;
    if (!rowCount || !colCount) return null;
    const sameShape = parsedBlocks.every(b => b.length === rowCount && b.every(r => r.length === colCount));
    if (!sameShape) return null;
    const allNumeric = parsedBlocks.every(b => b.every(r => r.every(c => c !== '' && !isNaN(Number(c)))));
    if (!allNumeric) return null;
    const tensor = parsedBlocks.map(b => b.map(r => r.map(Number)));
    return { tensor, shape: [blocks.length, rowCount, colCount] };
  };

  const inferShape = (arr) => {
    const dims = [];
    let cur = arr;
    while (Array.isArray(cur)) { dims.push(cur.length); cur = cur[0]; }
    return dims;
  };

  const detectJsonTensor = (text) => {
    let parsed;
    try { parsed = JSON.parse(text); } catch { return null; }
    if (!Array.isArray(parsed) || !Array.isArray(parsed[0])) return null;
    return { tensor: parsed, shape: inferShape(parsed) };
  };

  const handleFileSelect = (f) => {
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const sep = detectSeparator(text);
      setSeparator(sep);
      parsePreview(text, sep);
    };
    reader.readAsText(f);
    setStep('config');
  };

  const handlePasteNext = () => {
    if (!pasteContent.trim()) { toast.error(t('datasets.importModal.pasteRequired')); return; }

    // Formato explicitamente escolhido como JSON: espera um array aninhado.
    if (pasteFormat === 'json') {
      const det = detectJsonTensor(pasteContent);
      if (!det) { toast.error(t('datasets.importModal.invalidJson')); return; }
      setTensorInfo(det);
      setTensorDims('');
      setStep('config');
      return;
    }

    // Auto-detecção (ou formato "csv" forçado pelo usuário): tenta reconhecer
    // um tensor em blocos primeiro; se não for o caso, cai no fluxo CSV atual.
    if (pasteFormat !== 'csv') {
      const det = detectBlockTensor(pasteContent);
      if (det) {
        setTensorInfo(det);
        setTensorDims('');
        setStep('config');
        return;
      }
    }

    setTensorInfo(null);
    const sep = detectSeparator(pasteContent);
    setSeparator(sep);
    parsePreview(pasteContent, sep);
    setStep('config');
  };

  const handleImport = async () => {
    if (!name.trim()) { toast.error(t('datasets.importModal.nameRequired')); return; }
    let result;
    if (tensorInfo) {
      const dims = tensorDims.trim()
        ? tensorDims.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0)
        : undefined;
      if (tensorDims.trim() && (!dims.length || dims.length < 2)) {
        toast.error(t('datasets.importModal.dimensionsInvalid'));
        return;
      }
      result = await importTensor({
        name,
        description,
        data_type: 'tensor',
        tensor: tensorInfo.tensor,
        dimensions: dims,
      });
    } else if (method === 'file' && file) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name);
      fd.append('description', description);
      fd.append('separator', separator);
      result = await importDs(fd);
    } else {
      const blob = new Blob([pasteContent], { type: 'text/plain' });
      const pasteFile = new File([blob], `${name || 'dataset'}.csv`, { type: 'text/csv' });
      const fd = new FormData();
      fd.append('file', pasteFile);
      fd.append('name', name);
      fd.append('description', description);
      fd.append('separator', separator);
      result = await importDs(fd);
    }
    if (result) {
      toast.success(t('datasets.importModal.success'));
      onImported();
      onClose();
      resetState();
    }
  };

  const resetState = () => {
    setStep('method'); setMethod(null); setFile(null); setPasteContent(''); setPasteFormat('auto');
    setName(''); setDescription(''); setPreviewRows([]); setPreviewHeaders([]); setTensorInfo(null); setTensorDims('');
  };
  const handleClose = () => { onClose(); resetState(); };
  const stepLabel = { method: t('datasets.importModal.stepMethod'), config: t('datasets.importModal.stepConfig') };

  return (
    <Modal open={open} onClose={handleClose} title={t('datasets.importModal.importDataset')} size="lg">
      <div className="flex items-center gap-2 mb-6">
        {['method', 'config'].map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${step === s || (i === 0 && step === 'config') ? 'text-blue-400' : 'text-slate-500'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${step === s ? 'bg-blue-600 text-white' : i === 0 && step === 'config' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {i === 0 && step === 'config' ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
              </div>
              {stepLabel[s]}
            </div>
            {i === 0 && <div className="flex-1 h-px bg-slate-700" />}
          </React.Fragment>
        ))}
      </div>

      <div>
        {step === 'method' && (
          <div>
            <div className="grid grid-cols-2 gap-4">
              <div
                onClick={() => { setMethod('file'); fileRef.current?.click(); }}
                className="card card-hover p-6 flex flex-col items-center gap-3 cursor-pointer text-center group"
              >
                <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                  <Upload className="w-7 h-7 text-blue-400" />
                </div>
                <div>
                  <div className="font-semibold text-white">{t('datasets.importModal.fileOption')}</div>
                  <div className="text-xs text-slate-400 mt-1">{t('datasets.importModal.fileFormats')}</div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <FileSpreadsheet className="w-3 h-3" /> <FileText className="w-3 h-3" />
                  {t('datasets.importModal.fileSupported')}
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={e => { if (e.target.files[0]) { setMethod('file'); handleFileSelect(e.target.files[0]); } }} />

              <div
                onClick={() => { setMethod('paste'); setStep('paste'); }}
                className="card card-hover p-6 flex flex-col items-center gap-3 cursor-pointer text-center group"
              >
                <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                  <ClipboardPaste className="w-7 h-7 text-purple-400" />
                </div>
                <div>
                  <div className="font-semibold text-white">{t('datasets.importModal.pasteOption')}</div>
                  <div className="text-xs text-slate-400 mt-1">{t('datasets.importModal.pasteFormats')}</div>
                </div>
                <div className="text-xs text-slate-500">{t('datasets.importModal.pasteFromExcel')}</div>
              </div>
            </div>
          </div>
        )}

        {step === 'paste' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('datasets.importModal.pasteFormatLabel')}</label>
              <div className="flex gap-2">
                {[
                  { key: 'auto', label: t('datasets.importModal.autoDetect') },
                  { key: 'csv', label: t('datasets.importModal.csvTable') },
                  { key: 'json', label: t('datasets.importModal.jsonTensor') },
                ].map(opt => (
                  <button key={opt.key} type="button" onClick={() => setPasteFormat(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${pasteFormat === opt.key ? 'bg-purple-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                {pasteFormat === 'json'
                  ? t('datasets.importModal.jsonHint')
                  : t('datasets.importModal.csvHint')}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('datasets.importModal.pasteDataLabel')}</label>
              <textarea
                className="input-field font-mono text-xs resize-none h-48"
                placeholder={pasteFormat === 'json'
                  ? t('datasets.importModal.jsonPastePlaceholder')
                  : t('datasets.importModal.csvPastePlaceholder')}
                value={pasteContent}
                onChange={e => setPasteContent(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('method')} className="btn-ghost flex-1">{t('common.back')}</button>
              <button onClick={handlePasteNext} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {t('datasets.importModal.continueBtn')} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'config' && (
          <div className="space-y-4">
            {tensorInfo && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300">
                <Boxes className="w-4 h-4 flex-shrink-0" />
                {t('datasets.importModal.tensorDetected')} <span className="font-mono text-purple-200">[{tensorInfo.shape.join(' × ')}]</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('datasets.importModal.datasetNameLabel')}</label>
                <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder={t('datasets.importModal.datasetNamePlaceholder')} />
              </div>
              {tensorInfo ? (
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('datasets.importModal.dimensionsOptional')}</label>
                  <input className="input-field font-mono" value={tensorDims} onChange={e => setTensorDims(e.target.value)} placeholder={t('datasets.importModal.dimensionsPlaceholder')} />
                  <p className="text-xs text-slate-500 mt-1">{t('datasets.importModal.dimensionsHint')}</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('datasets.importModal.separatorLabel')}</label>
                  <select className="input-field" value={separator} onChange={e => { setSeparator(e.target.value); if (pasteContent) parsePreview(pasteContent, e.target.value); }}>
                    <option value=",">{t('datasets.importModal.separatorComma')}</option>
                    <option value=";">{t('datasets.importModal.separatorSemicolon')}</option>
                    <option value="\t">{t('datasets.importModal.separatorTab')}</option>
                    <option value=" ">{t('datasets.importModal.separatorSpace')}</option>
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('common.description')}</label>
              <input className="input-field" value={description} onChange={e => setDescription(e.target.value)} placeholder={t('datasets.importModal.descriptionPlaceholder')} />
            </div>

            {tensorInfo ? (
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('datasets.importModal.previewSlice')}</label>
                <pre className="rounded-lg overflow-auto border border-white/10 p-3 text-xs text-slate-300 font-mono" style={{ maxHeight: '160px' }}>
                  {JSON.stringify(tensorInfo.tensor[0], null, 1)}
                </pre>
                <p className="text-xs text-slate-500 mt-1">{t('datasets.importModal.tensorDimsDetected', { count: tensorInfo.shape.length, shape: tensorInfo.shape.join(' × ') })}</p>
              </div>
            ) : previewHeaders.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('datasets.preview')}</label>
                <div className="rounded-lg overflow-auto border border-white/10" style={{ maxHeight: '160px' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-blue-900/30">
                        {previewHeaders.map((h, i) => <th key={i} className="px-3 py-2 text-left text-blue-300 font-medium whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri} className="border-t border-white/5 hover:bg-white/5">
                          {row.map((cell, ci) => <td key={ci} className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-1">{t('datasets.importModal.columnsDetectedCount', { count: previewHeaders.length })}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(method === 'paste' ? 'paste' : 'method')} className="btn-ghost flex-1">{t('common.back')}</button>
              <button onClick={handleImport} disabled={importing || creating || importingTensor} className="btn-primary flex-1">
                {importing || creating || importingTensor ? t('datasets.importModal.importing') : t('datasets.importModal.importDataset')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DatasetCard({ ds, onVisualize, visualizingUuid }) {
  const { t } = useTranslation();
  const typeColors = { spectral: 'purple', tabular: 'blue', time_series: 'green', image: 'amber' };
  const dataType = ds.data_type || 'tabular';
  const color = typeColors[dataType] || 'blue';

  let dims = null;
  try { dims = ds.dimensions ? (typeof ds.dimensions === 'string' ? JSON.parse(ds.dimensions) : ds.dimensions) : null; } catch {}
  const nSamples   = dims?.[0] ?? null;
  const nVariables = dims?.[1] ?? null;
  const ndim = Array.isArray(dims) ? dims.length : null;

  const colorMap = { blue: 'blue', purple: 'purple', green: 'green', amber: 'amber' };
  const badgeColor = colorMap[color] || 'blue';
  const isLoading = visualizingUuid === ds.uuid;

  return (
    <div className="card card-hover p-5 flex flex-col gap-3 group h-full relative">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl bg-${color}-500/20 flex items-center justify-center`}>
          <Database className={`w-5 h-5 text-${color}-400`} />
        </div>
        <span className={`badge badge-${badgeColor}`}>
          {dataType}
        </span>
      </div>

      <div className="flex-1">
        <h3 className="font-semibold text-white truncate">{ds.name}</h3>
        <p className="text-sm text-slate-400 mt-1 line-clamp-2">{ds.description || t('common.noDescription')}</p>
      </div>

      <div className="text-xs text-slate-500 flex items-center gap-3">
        {nSamples   !== null && <span><strong className="text-slate-400">{nSamples}</strong> {t('datasets.card.sampleCountLabel')}</span>}
        {nVariables !== null && <span><strong className="text-slate-400">{nVariables}</strong> {t('datasets.card.variableCountLabel')}</span>}
        {nSamples === null && nVariables === null && <span>{t('datasets.card.noData')}</span>}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
        {/* Botão de visualização multidimensional */}
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onVisualize(ds); }}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center disabled:opacity-60"
          style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.2)' }}
          title={t('datasets.multiDimTooltip')}
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Boxes className="w-3.5 h-3.5" />}
          {isLoading ? t('datasets.card.loading') : `${t('datasets.card.visualize')}${ndim ? ` (${ndim}D)` : ''}`}
        </button>

        {/* Link para detalhes */}
        <Link
          to={`/datasets/${ds.uuid}`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center"
          style={{ background: 'rgba(59,130,246,0.08)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.15)' }}
        >
          {t('common.details')}
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

export default function DatasetsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [vizDataset, setVizDataset] = useState(null); // dataset completo sendo visualizado
  const [visualizingUuid, setVisualizingUuid] = useState(null); // uuid em carregamento
  const { data, loading, refetch } = useApi(api.datasets.list, []);

  const datasets = (data?.data ?? data ?? []).filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  // A listagem de datasets não traz `metadata` (payload pesado com a matriz de
  // dados) por motivos de performance. Antes de abrir o modal de visualização
  // multidimensional, buscamos o dataset completo via GET /datasets/:id —
  // só então os dados numéricos (tensor/matriz) ficam disponíveis.
  const handleVisualize = async (ds) => {
    setVisualizingUuid(ds.uuid);
    try {
      const res = await api.datasets.get(ds.uuid);
      const full = res.data?.data ?? res.data;
      setVizDataset(full || ds);
    } catch {
      toast.error(t('datasets.loadError'));
    } finally {
      setVisualizingUuid(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('datasets.title')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('datasets.subtitle')}</p>
        </div>
        <button onClick={() => setImportOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('datasets.importData')}
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input-field pl-10" placeholder={t('datasets.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : datasets.length === 0 ? (
        <EmptyState icon={Database} title={t('datasets.empty.title')}
          description={search ? t('datasets.empty.noResults') : t('datasets.empty.noData')}
          action={!search && <button onClick={() => setImportOpen(true)} className="btn-primary">{t('datasets.importData')}</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map(ds => (
            <DatasetCard key={ds.uuid} ds={ds} onVisualize={handleVisualize} visualizingUuid={visualizingUuid} />
          ))}
        </div>
      )}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={refetch} />

      {/* Modal de visualização multidimensional */}
      {vizDataset && (
        <Suspense fallback={null}>
          <MultiDimModal dataset={vizDataset} onClose={() => setVizDataset(null)} />
        </Suspense>
      )}
    </div>
  );
}
