import React, { useState, useRef, useEffect } from 'react';
import { Zap, Send, Sparkles, Brain, FlaskConical, BarChart2, Database, Cpu, MessageSquare, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useMutation } from '../hooks/useApi';
import { api } from '../api';

function getSuggestions(t) {
  return [
    { icon: FlaskConical, text: t('ai.suggestions.calibration.text'), category: t('ai.suggestions.calibration.category') },
    { icon: BarChart2, text: t('ai.suggestions.pcaLoadings.text'), category: t('ai.suggestions.pcaLoadings.category') },
    { icon: Brain, text: t('ai.suggestions.preprocessing.text'), category: t('ai.suggestions.preprocessing.category') },
    { icon: Database, text: t('ai.suggestions.outliers.text'), category: t('ai.suggestions.outliers.category') },
    { icon: Cpu, text: t('ai.suggestions.plsVsSvr.text'), category: t('ai.suggestions.plsVsSvr.category') },
    { icon: Sparkles, text: t('ai.suggestions.syntheticData.text'), category: t('ai.suggestions.syntheticData.category') },
  ];
}

function Message({ msg, t }) {
  const isUser = msg.role === 'user';
  return (
    <div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-blue-600' : 'bg-purple-600'}`}>
        {isUser ? <MessageSquare className="w-4 h-4 text-white" /> : <Zap className="w-4 h-4 text-white" />}
      </div>
      <div className={`max-w-2xl px-4 py-3 rounded-2xl text-sm ${isUser ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'}`}>
        {msg.loading ? (
          <div className="flex items-center gap-2">
            <span className="anim-spin inline-block w-3 h-3 border-2 border-purple-400/30 border-t-purple-400 rounded-full" />
            {t('ai.generatingResponse')}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
        )}
      </div>
    </div>
  );
}

export default function AIPage() {
  const { t, i18n } = useTranslation();
  const SUGGESTIONS = getSuggestions(t);
  const [messages, setMessages] = useState([
    { id: 0, role: 'assistant', content: t('ai.welcomeMessage') }
  ]);
  const [input, setInput] = useState('');
  const [tab, setTab] = useState('chat'); // chat | synthetic
  const [syntheticForm, setSyntheticForm] = useState({ technique: 'pca', n_samples: 100, n_features: 20, noise_level: 0.05 });
  const messagesEndRef = useRef(null);

  const { mutate: askAI, loading: thinking } = useMutation((q) => api.ai.ask(q));
  const { mutate: generateSynthetic, loading: generating } = useMutation(api.synthetic.generate);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { id: Date.now(), role: 'user', content: text };
    const loadingMsg = { id: Date.now() + 1, role: 'assistant', content: '', loading: true };
    setMessages(m => [...m, userMsg, loadingMsg]);
    setInput('');

    const result = await askAI({ message: text, context: 'chemometrics' });
    setMessages(m => m.map(msg => msg.id === loadingMsg.id
      ? { ...msg, loading: false, content: result?.answer ?? result?.message ?? result?.data ?? t('ai.fallbackAnswer') }
      : msg));
  };

  const handleSyntheticGenerate = async () => {
    // A API espera `name` (obrigatório) e `n_variables` (não `n_features`)
    const { n_features, ...rest } = syntheticForm;
    const payload = {
      ...rest,
      name: `${t('ai.syntheticNamePrefix')} ${syntheticForm.technique.toUpperCase()} ${new Date().toLocaleString(i18n.language)}`,
      n_variables: n_features,
    };
    const result = await generateSynthetic(payload);
    if (result) toast.success(t('ai.syntheticGenerated'));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden card p-6">
        <div className="absolute inset-0 opacity-10" style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }} />
        <div className="relative flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
            <Zap className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{t('ai.title')}</h1>
              <span className="badge badge-plus"><Zap className="w-3 h-3 inline mr-1" />PLUS</span>
            </div>
            <p className="text-purple-300 text-sm">{t('ai.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[{ key: 'chat', label: t('ai.tabChat'), icon: MessageSquare }, { key: 'synthetic', label: t('ai.tabSynthetic'), icon: Sparkles }].map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === tb.key ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <tb.icon className="w-4 h-4" /> {tb.label}
          </button>
        ))}
      </div>

      {tab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Suggestions sidebar */}
          <div className="card p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('ai.suggestionsLabel')}</div>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => sendMessage(s.text)}
                className="w-full text-left p-2.5 rounded-lg hover:bg-white/5 transition-colors group">
                <div className="flex items-start gap-2">
                  <s.icon className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-purple-400">{s.category}</div>
                    <div className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors mt-0.5 leading-relaxed">{s.text}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Chat area */}
          <div className="lg:col-span-3 card flex flex-col" style={{ height: '600px' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-sm font-medium text-slate-300">{t('ai.conversationLabel')}</span>
              <button onClick={() => setMessages([{ id: 0, role: 'assistant', content: t('ai.chatCleared') }])}
                className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> {t('ai.clearChat')}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(msg => <Message key={msg.id} msg={msg} t={t} />)}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t border-white/10 p-3">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
                <input
                  className="input-field flex-1"
                  placeholder={t('ai.askPlaceholder')}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={thinking}
                />
                <button type="submit" disabled={thinking || !input.trim()}
                  className="btn-primary p-2.5 flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {tab === 'synthetic' && (
        <div className="max-w-xl">
          <div className="card p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">{t('ai.syntheticTitle')}</h2>
              <p className="text-slate-400 text-sm">{t('ai.syntheticDesc')}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('models.technique')}</label>
                <select className="input-field" value={syntheticForm.technique} onChange={e => setSyntheticForm(f => ({ ...f, technique: e.target.value }))}>
                  <option value="pca">PCA</option>
                  <option value="pls">PLS</option>
                  <option value="spectral">{t('ai.techniqueSpectral')}</option>
                  <option value="multivariate">{t('ai.techniqueMultivariate')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('datasets.samples')}</label>
                <input type="number" className="input-field" min={10} max={10000} value={syntheticForm.n_samples} onChange={e => setSyntheticForm(f => ({ ...f, n_samples: +e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('datasets.variables')}</label>
                <input type="number" className="input-field" min={2} max={1000} value={syntheticForm.n_features} onChange={e => setSyntheticForm(f => ({ ...f, n_features: +e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('ai.noiseLevel')}</label>
                <input type="number" className="input-field" min={0} max={1} step={0.01} value={syntheticForm.noise_level} onChange={e => setSyntheticForm(f => ({ ...f, noise_level: +e.target.value }))} />
              </div>
            </div>
            <button onClick={handleSyntheticGenerate} disabled={generating}
              className="btn-primary w-full flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
              <Sparkles className="w-4 h-4" />
              {generating ? t('ai.generating') : t('ai.generateSyntheticDataset')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
