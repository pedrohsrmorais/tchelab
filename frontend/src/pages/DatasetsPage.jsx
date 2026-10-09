import React, { useState, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Plus, Database, Search, Upload, FileSpreadsheet, FileText, ClipboardPaste, X, CheckCircle2, ArrowRight, Boxes } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi, useMutation } from '../hooks/useApi';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';
import Modal from '../components/ui/Modal';

const MultiDimModal = lazy(() => import('../components/datasets/MultiDimModal'));

// Smart import modal
function ImportModal({ open, onClose, onImported }) {
  const [step, setStep] = useState('method'); // method | config | preview
  const [method, setMethod] = useState(null); // 'file' | 'paste'
  const [file, setFile] = useState(null);
  const [pasteContent, setPasteContent] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [separator, setSeparator] = useState(',');
  const [previewRows, setPreviewRows] = useState([]);
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const fileRef = useRef();
  const { mutate: importDs, loading: importing } = useMutation(api.datasets.import);
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
    if (!pasteContent.trim()) { toast.error('Cole o conteúdo antes de continuar'); return; }
    const sep = detectSeparator(pasteContent);
    setSeparator(sep);
    parsePreview(pasteContent, sep);
    setStep('config');
  };

  const handleImport = async () => {
    if (!name.trim()) { toast.error('Nome obrigatório'); return; }
    let result;
    if (method === 'file' && file) {
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
      toast.success('Dataset importado com sucesso!');
      onImported();
      onClose();
      resetState();
    }
  };

  const resetState = () => { setStep('method'); setMethod(null); setFile(null); setPasteContent(''); setName(''); setDescription(''); setPreviewRows([]); setPreviewHeaders([]); };
  const handleClose = () => { onClose(); resetState(); };
  const stepLabel = { method: 'Escolha o método', config: 'Configurar importação' };

  return (
    <Modal open={open} onClose={handleClose} title="Importar Dataset" size="lg">
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

      <AnimatePresence mode="wait">
        {step === 'method' && (
          <motion.div key="method" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <div className="grid grid-cols-2 gap-4">
              <div
                onClick={() => { setMethod('file'); fileRef.current?.click(); }}
                className="card card-hover p-6 flex flex-col items-center gap-3 cursor-pointer text-center group"
              >
                <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                  <Upload className="w-7 h-7 text-blue-400" />
                </div>
                <div>
                  <div className="font-semibold text-white">Arquivo</div>
                  <div className="text-xs text-slate-400 mt-1">CSV, XLSX, TXT</div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <FileSpreadsheet className="w-3 h-3" /> <FileText className="w-3 h-3" />
                  Suportados
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
                  <div className="font-semibold text-white">Colar Dados</div>
                  <div className="text-xs text-slate-400 mt-1">CSV, TSV, texto livre</div>
                </div>
                <div className="text-xs text-slate-500">Cole direto do Excel</div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'paste' && (
          <motion.div key="paste" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
            <label className="block text-sm font-medium text-blue-200 mb-1.5">Cole seus dados abaixo</label>
            <textarea
              className="input-field font-mono text-xs resize-none h-48"
              placeholder={"Col1,Col2,Col3\n1.2,3.4,5.6\n7.8,9.0,1.2"}
              value={pasteContent}
              onChange={e => setPasteContent(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => setStep('method')} className="btn-ghost flex-1">Voltar</button>
              <button onClick={handlePasteNext} className="btn-primary flex-1 flex items-center justify-center gap-2">
                Continuar <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'config' && (
          <motion.div key="config" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">Nome do Dataset *</label>
                <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Amostras Solo 2024" />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">Separador</label>
                <select className="input-field" value={separator} onChange={e => { setSeparator(e.target.value); if (pasteContent) parsePreview(pasteContent, e.target.value); }}>
                  <option value=",">Vírgula (,)</option>
                  <option value=";">Ponto-vírgula (;)</option>
                  <option value="\t">Tab</option>
                  <option value=" ">Espaço</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">Descrição</label>
              <input className="input-field" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição opcional..." />
            </div>

            {previewHeaders.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">Pré-visualização</label>
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
                <p className="text-xs text-slate-500 mt-1">{previewHeaders.length} colunas detectadas</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(method === 'paste' ? 'paste' : 'method')} className="btn-ghost flex-1">Voltar</button>
              <button onClick={handleImport} disabled={importing || creating} className="btn-primary flex-1">
                {importing || creating ? 'Importando...' : 'Importar Dataset'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

function DatasetCard({ ds, onVisualize }) {
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
        <p className="text-sm text-slate-400 mt-1 line-clamp-2">{ds.description || 'Sem descrição'}</p>
      </div>

      <div className="text-xs text-slate-500 flex items-center gap-3">
        {nSamples   !== null && <span><strong className="text-slate-400">{nSamples}</strong> amostras</span>}
        {nVariables !== null && <span><strong className="text-slate-400">{nVariables}</strong> variáveis</span>}
        {nSamples === null && nVariables === null && <span>Sem dados</span>}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
        {/* Botão de visualização multidimensional */}
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onVisualize(ds); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center"
          style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.2)' }}
          title="Visualização multidimensional"
        >
          <Boxes className="w-3.5 h-3.5" />
          Visualizar{ndim ? ` (${ndim}D)` : ''}
        </button>

        {/* Link para detalhes */}
        <Link
          to={`/datasets/${ds.uuid}`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center"
          style={{ background: 'rgba(59,130,246,0.08)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.15)' }}
        >
          Detalhes
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

export default function DatasetsPage() {
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [vizDataset, setVizDataset] = useState(null); // dataset sendo visualizado
  const { data, loading, refetch } = useApi(api.datasets.list, []);

  const datasets = (data?.data ?? data ?? []).filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Datasets</h1>
          <p className="text-slate-400 text-sm mt-0.5">Seus conjuntos de dados para análise</p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => setImportOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Importar Dados
        </motion.button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input-field pl-10" placeholder="Buscar datasets..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : datasets.length === 0 ? (
        <EmptyState icon={Database} title="Nenhum dataset"
          description={search ? 'Tente outro termo.' : 'Importe seu primeiro dataset.'}
          action={!search && <button onClick={() => setImportOpen(true)} className="btn-primary">Importar Dados</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map(ds => (
            <DatasetCard key={ds.uuid} ds={ds} onVisualize={setVizDataset} />
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
