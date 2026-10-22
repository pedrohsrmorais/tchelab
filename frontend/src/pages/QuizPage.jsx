import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save, Send, GitBranch, Database, Check, X, Eye, Lock, Unlock,
  ClipboardList, Copy, Paperclip, Pencil, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { currentLocale } from '../i18n';
import { parseApiError } from '../utils/errors';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import PreviewModal from '../components/community/PreviewModal';
import AppCrumbs from '../components/apps/AppsNav';

const arr = (x) => (Array.isArray(x) ? x : []);
const lbl = { color: 'var(--text-secondary)' };
const muted = { color: 'var(--text-muted)' };
const KINDS = ['tf', 'choice', 'text', 'dataset', 'workflow'];
const fmtDate = (d) => (d ? new Date(d).toLocaleString(currentLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '');
const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString(currentLocale(), { maximumFractionDigits: 2 }));
const newId = () => Math.random().toString(36).slice(2, 8);

export function StatusBadge({ status }) {
  const { t } = useTranslation();
  const cls = status === 'open' ? 'badge-green' : status === 'closed' ? 'badge-amber' : 'badge-blue';
  return <span className={`badge ${cls}`}>{t(`quiz.status.${status}`)}</span>;
}

export function SubStatusBadge({ status }) {
  const { t } = useTranslation();
  if (!status) return null;
  const cls = status === 'graded' ? 'badge-green' : status === 'submitted' ? 'badge-blue' : 'badge-amber';
  return <span className={`badge ${cls}`}>{t(`quiz.sub.${status}`)}</span>;
}

/* ═══════════════════════════ Anexos (dados X, workflow-modelo) ═══════════════════════════ */
function AttachmentList({ items, onPreview, onRemove, copyable }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  if (!items.length) return null;
  const copy = async (a) => {
    setBusy(a.uuid);
    try {
      if (a.kind === 'dataset') { await api.datasets.copy(a.uuid); toast.success(t('communities.datasetCopied')); } else {
        const res = await api.workflows.fork(a.uuid); const wf = res.data?.data ?? res.data;
        toast.success(t('communities.workflowCopied')); if (wf?.uuid) navigate(`/workflows/${wf.uuid}`);
      }
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(''); }
  };
  return (
    <ul className="space-y-1.5 mt-2">
      {items.map((a, i) => (
        <li key={`${a.kind}:${a.uuid || i}`} className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg-hover)' }}>
          {a.kind === 'workflow' ? <GitBranch className="w-4 h-4 text-purple-400" /> : <Database className="w-4 h-4 text-cyan-400" />}
          <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
            {a.name || t('communities.refUnavailable')}
            {Array.isArray(a.dimensions) && <span className="text-xs ml-2" style={muted}>{a.dimensions.join('×')}</span>}
          </span>
          {a.available !== false && a.uuid && (
            <>
              <button type="button" className="btn-ghost text-xs py-1 px-2 flex items-center gap-1" onClick={() => onPreview({ kind: a.kind, uuid: a.uuid, name: a.name })}><Eye className="w-3 h-3" /> {t('quiz.preview')}</button>
              {copyable && <button type="button" className="btn-ghost text-xs py-1 px-2 flex items-center gap-1" disabled={busy === a.uuid} onClick={() => copy(a)}><Copy className="w-3 h-3" /> {a.kind === 'dataset' ? t('communities.copyDataset') : t('communities.copyWorkflow')}</button>}
            </>
          )}
          {onRemove && <button type="button" className="btn-ghost p-1" aria-label={t('common.delete')} onClick={() => onRemove(i)}><X className="w-3.5 h-3.5" /></button>}
        </li>
      ))}
    </ul>
  );
}

/* ═══════════════════════════ Construtor (professor) ═══════════════════════════ */
const blankQuestion = (kind) => ({
  key: newId(), uuid: null, kind, prompt: '', points: 1, attachments: [],
  config: kind === 'tf' ? { answer: true }
    : kind === 'choice' ? { multiple: false, options: [{ id: 'a', text: '', correct: true }, { id: 'b', text: '', correct: false }] }
      : {},
});

function QuestionEditor({ q, idx, total, onChange, onMove, onRemove, wfList, dsList, locked, onPreview }) {
  const { t } = useTranslation();
  const set = (patch) => onChange({ ...q, ...patch });
  const setCfg = (patch) => set({ config: { ...q.config, ...patch } });
  const opts = q.config.options || [];
  const [attKind, setAttKind] = useState('dataset');
  const [attRef, setAttRef] = useState('');
  const pool = attKind === 'dataset' ? dsList : wfList;
  const addAttachment = () => {
    const found = pool.find(x => x.uuid === attRef);
    if (!found || q.attachments.some(a => a.uuid === found.uuid && a.kind === attKind)) return;
    set({ attachments: [...q.attachments, { kind: attKind, uuid: found.uuid, name: found.name, available: true, dimensions: attKind === 'dataset' ? found.dimensions : undefined }] });
    setAttRef('');
  };
  return (
    <div className="card p-4 space-y-3" data-testid="question-editor">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-blue">{idx + 1}</span>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t(`quiz.kind.${q.kind}`)}</span>
        <div className="ml-auto flex items-center gap-1">
          <label className="text-xs flex items-center gap-1.5" style={muted}>{t('quiz.points')}
            <input type="number" min="0" step="0.5" className="input-field !py-1 !w-20" value={q.points} disabled={locked}
              onChange={e => set({ points: e.target.value })} aria-label={t('quiz.points')} />
          </label>
          <button type="button" className="btn-ghost p-1.5" disabled={idx === 0 || locked} aria-label={t('communities.moveUp')} onClick={() => onMove(-1)}><ChevronUp className="w-4 h-4" /></button>
          <button type="button" className="btn-ghost p-1.5" disabled={idx === total - 1 || locked} aria-label={t('communities.moveDown')} onClick={() => onMove(1)}><ChevronDown className="w-4 h-4" /></button>
          <button type="button" className="btn-ghost p-1.5" disabled={locked} aria-label={t('common.delete')} onClick={onRemove}><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <textarea className="input-field resize-none" rows={2} placeholder={t('quiz.promptPlaceholder')} value={q.prompt} disabled={locked}
        onChange={e => set({ prompt: e.target.value })} aria-label={t('quiz.prompt')} />

      {q.kind === 'tf' && (
        <div className="flex flex-wrap gap-4 text-sm" style={lbl} role="radiogroup" aria-label={t('quiz.correctAnswer')}>
          <span style={muted}>{t('quiz.correctAnswer')}:</span>
          {[true, false].map(v => (
            <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" disabled={locked} checked={q.config.answer === v} onChange={() => setCfg({ answer: v })} /> {v ? t('quiz.true') : t('quiz.false')}
            </label>
          ))}
        </div>
      )}

      {q.kind === 'choice' && (
        <div className="space-y-2">
          <label className="text-xs flex items-center gap-1.5 cursor-pointer" style={muted}>
            <input type="checkbox" disabled={locked} checked={!!q.config.multiple}
              onChange={e => { const multiple = e.target.checked; setCfg({ multiple, options: multiple ? opts : opts.map((o, i) => ({ ...o, correct: i === Math.max(0, opts.findIndex(x => x.correct)) })) }); }} />
            {t('quiz.multipleCorrect')}
          </label>
          {opts.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2">
              <input type={q.config.multiple ? 'checkbox' : 'radio'} disabled={locked} checked={!!o.correct} aria-label={t('quiz.markCorrect')} title={t('quiz.markCorrect')}
                onChange={e => setCfg({ options: opts.map((x, k) => (q.config.multiple ? (k === i ? { ...x, correct: e.target.checked } : x) : { ...x, correct: k === i })) })} />
              <input className="input-field !py-1.5" value={o.text} disabled={locked} placeholder={`${t('quiz.option')} ${i + 1}`}
                onChange={e => setCfg({ options: opts.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
              <button type="button" className="btn-ghost p-1.5" disabled={locked || opts.length <= 2} aria-label={t('common.delete')}
                onClick={() => setCfg({ options: opts.filter((_, k) => k !== i) })}><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {opts.length < 10 && !locked && (
            <button type="button" className="btn-ghost text-xs flex items-center gap-1"
              onClick={() => setCfg({ options: [...opts, { id: newId(), text: '', correct: false }] })}><Plus className="w-3 h-3" /> {t('quiz.addOption')}</button>
          )}
        </div>
      )}

      {q.kind === 'text' && (
        <textarea className="input-field resize-none" rows={2} disabled={locked} placeholder={t('quiz.modelAnswerPlaceholder')} value={q.config.model_answer || ''}
          onChange={e => setCfg({ model_answer: e.target.value })} aria-label={t('quiz.modelAnswer')} />
      )}

      {(q.kind === 'dataset' || q.kind === 'workflow') && (
        <input className="input-field" disabled={locked} placeholder={t('quiz.hintPlaceholder')} value={q.config.hint || ''} onChange={e => setCfg({ hint: e.target.value })} aria-label={t('quiz.hint')} />
      )}

      <div>
        <div className="text-xs font-medium flex items-center gap-1.5" style={muted}><Paperclip className="w-3 h-3" /> {t('quiz.attachments')}</div>
        <AttachmentList items={q.attachments} onPreview={onPreview} onRemove={locked ? null : (i) => set({ attachments: q.attachments.filter((_, k) => k !== i) })} />
        {!locked && (
          <div className="flex flex-wrap gap-2 mt-2">
            <select className="input-field !w-auto !py-1.5" value={attKind} onChange={e => { setAttKind(e.target.value); setAttRef(''); }} aria-label={t('quiz.attachmentType')}>
              <option value="dataset">{t('communities.itemDataset')}</option>
              <option value="workflow">{t('communities.itemWorkflow')}</option>
            </select>
            <select className="input-field !w-auto !py-1.5 min-w-[10rem] flex-1" value={attRef} onChange={e => setAttRef(e.target.value)} aria-label={t('quiz.attachmentRef')}>
              <option value="">{t('communities.chooseOption')}</option>
              {pool.map(x => <option key={x.uuid} value={x.uuid}>{x.name}</option>)}
            </select>
            <button type="button" className="btn-ghost text-sm" disabled={!attRef} onClick={addAttachment}>{t('common.add')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Builder({ cid, quiz, reload }) {
  const locked = false;
  const { t } = useTranslation();
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(null);
  const { data: wfData } = useApi(() => api.workflows.list({ limit: 200 }), []);
  const { data: dsData } = useApi(() => api.datasets.list({ limit: 200 }), []);
  const wfList = arr(wfData); const dsList = arr(dsData).map(d => ({ ...d, dimensions: Array.isArray(d.dimensions) ? d.dimensions : undefined }));

  useEffect(() => {
    setQuestions(arr(quiz.questions).map(q => ({
      key: q.uuid, uuid: q.uuid, kind: q.kind, prompt: q.prompt, points: q.points, attachments: arr(q.attachments),
      config: q.config || {},
    })));
    setDirty(false);
  }, [quiz.uuid, quiz.questions]); // eslint-disable-line

  const update = (i, nq) => { setQuestions(list => list.map((x, k) => (k === i ? nq : x))); setDirty(true); };
  const move = (i, d) => { setQuestions(list => { const j = i + d; if (j < 0 || j >= list.length) return list; const out = list.slice(); [out[i], out[j]] = [out[j], out[i]]; return out; }); setDirty(true); };
  const add = (kind) => { setQuestions(list => [...list, blankQuestion(kind)]); setDirty(true); };

  const save = async () => {
    const withSubs = !!quiz.has_submissions;
    if (withSubs && !window.confirm(t('quiz.editConfirm', { count: quiz.submitters || 0 }))) return;
    setSaving(true);
    try {
      await api.quizzes.saveQuestions(cid, quiz.uuid, questions.map(q => ({
        uuid: q.uuid, kind: q.kind, prompt: q.prompt, points: Number(q.points), config: q.config,
        attachments: q.attachments.map(a => ({ kind: a.kind, ref: a.uuid })),
      })), withSubs);
      toast.success(t('quiz.questionsSaved')); setDirty(false); await reload();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };

  const total = questions.reduce((s, q) => s + (Number(q.points) || 0), 0);
  return (
    <div className="space-y-4">
      {quiz.has_submissions && <div className="card p-4 text-sm" style={lbl} role="status" data-testid="edit-warning">{t('quiz.editWarning', { count: quiz.submitters || 0 })}</div>}
      {!questions.length && <EmptyState icon={ClipboardList} title={t('quiz.noQuestionsTitle')} description={t('quiz.noQuestionsDesc')} />}
      {questions.map((q, i) => (
        <QuestionEditor key={q.key} q={q} idx={i} total={questions.length} locked={locked} wfList={wfList} dsList={dsList}
          onChange={(nq) => update(i, nq)} onMove={(d) => move(i, d)} onRemove={() => { setQuestions(l => l.filter((_, k) => k !== i)); setDirty(true); }} onPreview={setPreview} />
      ))}
      {!locked && (
        <div className="card p-4 flex flex-wrap items-center gap-2">
          <span className="text-sm mr-1" style={muted}>{t('quiz.addQuestion')}:</span>
          {KINDS.map(k => <button key={k} type="button" className="btn-ghost text-sm flex items-center gap-1" onClick={() => add(k)} data-testid={`add-${k}`}><Plus className="w-3 h-3" /> {t(`quiz.kind.${k}`)}</button>)}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 sticky bottom-0 py-3" style={{ background: 'var(--bg-base, transparent)' }}>
        <span className="text-sm" style={muted}>{t('quiz.totalPoints', { total: fmtNum(total) })}</span>
        {!locked && (
          <button type="button" className="btn-primary flex items-center gap-2" disabled={saving || !dirty} onClick={save} data-testid="save-questions">
            <Save className="w-4 h-4" /> {saving ? t('common.saving') : t('quiz.saveQuestions')}
          </button>
        )}
      </div>
      <PreviewModal target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

/* ═══════════════════════════ Entregas e correção (professor) ═══════════════════════════ */
function AnswerView({ q, a }) {
  const { t } = useTranslation();
  if (!a) return <p className="text-sm italic" style={muted}>{t('quiz.noAnswer')}</p>;
  if (q.kind === 'tf') return <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{a.value === true ? t('quiz.true') : a.value === false ? t('quiz.false') : t('quiz.noAnswer')}</p>;
  if (q.kind === 'choice') {
    const ids = arr(a.value);
    return <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{ids.length ? ids.map(id => (q.config.options.find(o => o.id === id) || {}).text).join(' · ') : t('quiz.noAnswer')}</p>;
  }
  if (q.kind === 'text') return <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{a.value || t('quiz.noAnswer')}</p>;
  return null;
}

function GradePanel({ cid, quiz, sid, onClose, reloadList }) {
  const { t } = useTranslation();
  const { data: sub, loading, refetch } = useApi(() => api.quizzes.submission(cid, quiz.uuid, sid), [sid]);
  const [grades, setGrades] = useState({});
  const [overall, setOverall] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!sub) return;
    const g = {}; arr(sub.questions).forEach(q => { g[q.uuid] = { points: q.answer?.points ?? '', feedback: q.answer?.feedback || '' }; });
    setGrades(g); setOverall(sub.feedback || '');
  }, [sub]);
  if (loading || !sub) return <SkeletonCard className="h-40" />;
  const save = async () => {
    setSaving(true);
    try {
      const res = await api.quizzes.grade(cid, quiz.uuid, sid, {
        feedback: overall,
        answers: arr(sub.questions).filter(q => !['tf', 'choice'].includes(q.kind)).map(q => ({ question: q.uuid, points: grades[q.uuid]?.points === '' ? null : Number(grades[q.uuid]?.points), feedback: grades[q.uuid]?.feedback })),
      });
      const d = res.data?.data ?? res.data;
      toast.success(d.status === 'graded' ? t('quiz.gradedOk', { score: fmtNum(d.score) }) : t('quiz.gradePartial', { count: d.pending }));
      await refetch(); await reloadList();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };
  const reopen = async () => {
    if (!window.confirm(t('quiz.reopenConfirm'))) return;
    try { await api.quizzes.reopen(cid, quiz.uuid, sid); toast.success(t('quiz.reopened')); await reloadList(); onClose(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
  };
  return (
    <div className="card p-5 space-y-4" data-testid="grade-panel">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost text-sm flex items-center gap-1" onClick={onClose}><ArrowLeft className="w-4 h-4" /> {t('quiz.backToList')}</button>
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{sub.user?.name}<span className="text-xs font-normal ml-2" style={muted}>· {t("quiz.attempt")} #{sub.attempt}</span></h3>
        <SubStatusBadge status={sub.status} />
        <span className="text-sm ml-auto" style={muted}>{t('quiz.score')}: <strong style={{ color: 'var(--text-primary)' }}>{fmtNum(sub.score)}</strong> / {fmtNum(arr(sub.questions).reduce((s, q) => s + q.points, 0))}</span>
      </div>
      {arr(sub.questions).map((q, i) => {
        const auto = ['tf', 'choice'].includes(q.kind);
        return (
          <div key={q.uuid} className="rounded-lg p-4 space-y-2" style={{ background: 'var(--bg-hover)' }}>
            <div className="flex items-start gap-2">
              <span className="badge badge-blue">{i + 1}</span>
              <p className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{q.prompt}</p>
              <span className="text-xs whitespace-nowrap" style={muted}>{t(`quiz.kind.${q.kind}`)} · {fmtNum(q.points)} {t('quiz.ptsShort')}</span>
            </div>
            <AnswerView q={q} a={q.answer} />
            {auto && (
              <p className="text-xs" style={muted}>
                {t('quiz.expected')}: {q.kind === 'tf' ? (q.config.answer ? t('quiz.true') : t('quiz.false')) : q.config.options.filter(o => o.correct).map(o => o.text).join(' · ')}
              </p>
            )}
            {q.kind === 'text' && q.config.model_answer && <p className="text-xs" style={muted}>{t('quiz.modelAnswer')}: {q.config.model_answer}</p>}
            {(q.kind === 'workflow' || q.kind === 'dataset') && (
              q.answer?.ref
                ? <AttachmentList items={[q.answer.ref]} onPreview={setPreview} />
                : <p className="text-sm italic" style={muted}>{t('quiz.noAnswer')}</p>
            )}
            {q.answer?.ref?.available && (
              <Link className="btn-primary text-xs inline-flex" to={q.answer.ref.kind === 'workflow' ? `/workflows/${q.answer.ref.uuid}` : `/datasets/${q.answer.ref.uuid}`}>{t('quiz.openStudentWork')}</Link>
            )}
            {auto ? (
              <p className="text-sm" style={lbl}>{t('quiz.autoGraded')}: <strong>{fmtNum(q.answer?.points ?? 0)}</strong> / {fmtNum(q.points)}</p>
            ) : (
              <div className="flex flex-wrap gap-2 items-start">
                <label className="text-xs flex items-center gap-1.5" style={muted}>{t('quiz.points')}
                  <input type="number" min="0" max={q.points} step="0.5" className="input-field !py-1 !w-24" value={grades[q.uuid]?.points ?? ''} aria-label={`${t('quiz.points')} ${i + 1}`}
                    onChange={e => setGrades(g => ({ ...g, [q.uuid]: { ...g[q.uuid], points: e.target.value } }))} />
                  <span>/ {fmtNum(q.points)}</span>
                </label>
                <input className="input-field !py-1 flex-1 min-w-[10rem]" placeholder={t('quiz.feedbackPlaceholder')} value={grades[q.uuid]?.feedback || ''} aria-label={`${t('quiz.feedback')} ${i + 1}`}
                  onChange={e => setGrades(g => ({ ...g, [q.uuid]: { ...g[q.uuid], feedback: e.target.value } }))} />
              </div>
            )}
          </div>
        );
      })}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('quiz.overallFeedback')}</label>
        <textarea className="input-field resize-none" rows={2} value={overall} onChange={e => setOverall(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="btn-ghost" onClick={reopen}>{t('quiz.reopen')}</button>
        <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={save} data-testid="save-grade"><Check className="w-4 h-4" /> {saving ? t('common.saving') : t('quiz.saveGrade')}</button>
      </div>
      <PreviewModal target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function SubmissionsTab({ cid, quiz }) {
  const { t } = useTranslation();
  const { data, loading, refetch } = useApi(() => api.quizzes.submissions(cid, quiz.uuid), [quiz.uuid]);
  const [openId, setOpenId] = useState(null);
  if (loading && !data) return <SkeletonCard className="h-40" />;
  if (openId) return <GradePanel cid={cid} quiz={quiz} sid={openId} onClose={() => setOpenId(null)} reloadList={refetch} />;
  const list = arr(data?.submissions);
  if (!list.length) return <EmptyState icon={ClipboardList} title={t('quiz.noSubmissionsTitle')} description={t('quiz.noSubmissionsDesc')} />;
  return (
    <div className="card overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead><tr style={{ background: 'var(--bg-hover)' }}>
            {['quiz.student', 'quiz.attempt', 'quiz.statusCol', 'quiz.score', 'quiz.submittedAt', ''].map((k, i) => <th key={i} className="px-4 py-2.5 text-left font-medium" style={lbl}>{k ? t(k) : ''}</th>)}
          </tr></thead>
          <tbody>
            {list.map(s => (
              <tr key={s.uuid} style={{ borderTop: '1px solid var(--border)' }} data-testid="submission-row">
                <td className="px-4 py-2.5" style={{ color: 'var(--text-primary)' }}>{s.user.name}</td>
                <td className="px-4 py-2.5 whitespace-nowrap" style={lbl}>#{s.attempt}{s.counted && <span className="badge badge-green ml-2" title={t('quiz.countedHint')}>{t('quiz.counted')}</span>}</td>
                <td className="px-4 py-2.5"><SubStatusBadge status={s.status} /></td>
                <td className="px-4 py-2.5" style={lbl}>{s.score == null ? '—' : `${fmtNum(s.score)} / ${fmtNum(data.total_points)}`}</td>
                <td className="px-4 py-2.5" style={muted}>{fmtDate(s.submitted_at)}</td>
                <td className="px-4 py-2.5 text-right">
                  {s.status !== 'in_progress' && <button type="button" className="btn-ghost text-xs" onClick={() => setOpenId(s.uuid)}>{s.status === 'graded' ? t('quiz.review') : t('quiz.grade')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-xs" style={muted}>{t('quiz.policyNote', { attempts: data.max_attempts === 0 ? t('quiz.unlimited') : data.max_attempts, policy: t(`quiz.policy.${data.grade_policy}`) })}</p>
      <p className="px-4 pb-2 text-xs" style={muted}>{t('quiz.submissionsCount', { count: data.student_count, members: data.member_count })}</p>
    </div>
  );
}

/* ═══════════════════════════ Aluno ═══════════════════════════ */
function StudentView({ cid, quiz, reload }) {
  const { t } = useTranslation();
  const sub = quiz.my_submission;
  const done = sub && sub.status !== 'in_progress';
  const canAnswer = quiz.accepting && !done;
  const [answers, setAnswers] = useState({});
  const [saved, setSaved] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const timers = useRef({});
  const { data: wfData } = useApi(() => (canAnswer ? api.workflows.list({ limit: 200 }) : null), [canAnswer]);
  const { data: dsData } = useApi(() => (canAnswer ? api.datasets.list({ limit: 200 }) : null), [canAnswer]);

  useEffect(() => {
    const m = {};
    arr(sub?.answers).forEach(a => { m[a.question] = { value: a.value, ref: a.ref }; });
    setAnswers(m);
  }, [quiz.uuid, sub?.status, sub?.attempt]); // eslint-disable-line

  const persist = useCallback(async (q, body) => {
    try { await api.quizzes.answer(cid, quiz.uuid, q.uuid, body); setSaved(q.uuid); setTimeout(() => setSaved(s => (s === q.uuid ? '' : s)), 1500); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
  }, [cid, quiz.uuid, t]);
  const setAnswer = (q, patch, { debounce = false } = {}) => {
    const next = { ...(answers[q.uuid] || {}), ...patch };
    setAnswers(a => ({ ...a, [q.uuid]: next }));
    const body = q.kind === 'workflow' || q.kind === 'dataset' ? { ref: next.ref?.uuid || null } : { value: next.value };
    clearTimeout(timers.current[q.uuid]);
    if (debounce) timers.current[q.uuid] = setTimeout(() => persist(q, body), 700); else persist(q, body);
  };

  const submit = async () => {
    const unanswered = arr(quiz.questions).filter(q => { const a = answers[q.uuid]; if (!a) return true; if (q.kind === 'workflow' || q.kind === 'dataset') return !a.ref; if (q.kind === 'choice') return !arr(a.value).length; if (q.kind === 'text') return !a.value; return a.value == null; }).length;
    if (!window.confirm(unanswered ? t('quiz.submitConfirmUnanswered', { count: unanswered }) : t('quiz.submitConfirm'))) return;
    setSubmitting(true);
    try {
      Object.values(timers.current).forEach(clearTimeout);
      for (const q of arr(quiz.questions)) { // garante que tudo foi salvo antes de entregar
        const a = answers[q.uuid]; if (!a) continue;
        await api.quizzes.answer(cid, quiz.uuid, q.uuid, q.kind === 'workflow' || q.kind === 'dataset' ? { ref: a.ref?.uuid || null } : { value: a.value });
      }
      await api.quizzes.submit(cid, quiz.uuid);
      toast.success(t('quiz.submitted')); await reload();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSubmitting(false); }
  };

  const newAttempt = async () => {
    try { await api.quizzes.start(cid, quiz.uuid, { new_attempt: true }); toast.success(t('quiz.newAttemptStarted')); await reload(); window.scrollTo({ top: 0 }); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
  };
  const wfList = arr(wfData); const dsList = arr(dsData);
  const multi = (quiz.max_attempts !== 1) || arr(quiz.attempts).length > 1;
  if (!canAnswer && !sub) return <EmptyState icon={Lock} title={t('quiz.closedTitle')} description={t('quiz.closedDesc')} />;

  return (
    <div className="space-y-4">
      {done && (
        <div className="card p-4 flex flex-wrap items-center gap-3" role="status" data-testid="my-result">
          <SubStatusBadge status={sub.status} />
          {sub.status === 'graded'
            ? <span style={{ color: 'var(--text-primary)' }}>{t('quiz.yourScore')}: <strong>{fmtNum(sub.score)}</strong> / {fmtNum(quiz.total_points)}</span>
            : <span style={lbl}>{t('quiz.awaitingGrade')}</span>}
          {sub.feedback && <span className="w-full text-sm" style={lbl}>{sub.feedback}</span>}
        </div>
      )}
      {multi && (
        <div className="card p-4 space-y-3" data-testid="attempts-box">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={lbl}>
            <span>{t('quiz.attemptsUsed', { used: quiz.attempts_used, max: quiz.max_attempts === 0 ? t('quiz.unlimitedShort') : quiz.max_attempts })}</span>
            {quiz.official_score != null && <span style={{ color: 'var(--text-primary)' }}>{t('quiz.officialScore')}: <strong>{fmtNum(quiz.official_score)}</strong> / {fmtNum(quiz.total_points)} <span style={muted}>({t(`quiz.policy.${quiz.grade_policy}`)})</span></span>}
          </div>
          {arr(quiz.attempts).length > 1 && (
            <ul className="flex flex-wrap gap-2 text-xs" aria-label={t('quiz.history')}>
              {arr(quiz.attempts).map(x => (
                <li key={x.uuid} className="px-2.5 py-1 rounded-lg" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', outline: x.attempt === quiz.official_attempt ? '1px solid var(--accent)' : 'none' }}>
                  #{x.attempt} · {x.status === 'graded' ? `${fmtNum(x.score)} / ${fmtNum(quiz.total_points)}` : t(`quiz.sub.${x.status}`)}
                </li>
              ))}
            </ul>
          )}
          {quiz.can_retry && (
            <button type="button" className="btn-primary text-sm flex items-center gap-2" onClick={newAttempt} data-testid="new-attempt">
              <RefreshCw className="w-4 h-4" /> {t('quiz.newAttempt')}{quiz.attempts_left != null && ` (${t('quiz.attemptsLeft', { n: quiz.attempts_left })})`}
            </button>
          )}
        </div>
      )}
      {!done && !quiz.accepting && <div className="card p-4 text-sm" style={lbl}>{t('quiz.notAccepting')}</div>}
      {arr(quiz.questions).map((q, i) => {
        const a = answers[q.uuid] || {};
        const mine = arr(sub?.answers).find(x => x.question === q.uuid);
        return (
          <div key={q.uuid} className="card p-5 space-y-3" data-testid="student-question">
            <div className="flex items-start gap-2">
              <span className="badge badge-blue">{i + 1}</span>
              <p className="text-sm font-medium flex-1 whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{q.prompt}</p>
              <span className="text-xs whitespace-nowrap" style={muted}>{fmtNum(q.points)} {t('quiz.ptsShort')}</span>
            </div>
            {q.config?.hint && <p className="text-xs" style={muted}>💡 {q.config.hint}</p>}
            <AttachmentList items={arr(q.attachments)} onPreview={setPreview} copyable={canAnswer} />

            {q.kind === 'tf' && (
              <div className="flex gap-5 text-sm" style={lbl} role="radiogroup">
                {[true, false].map(v => (
                  <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer" style={a.value === v ? { color: 'var(--accent)', fontWeight: 600 } : undefined}>
                    <input type="radio" name={`q-${q.uuid}`} style={{ accentColor: 'var(--accent)' }} disabled={!canAnswer} checked={a.value === v} onChange={() => setAnswer(q, { value: v })} /> {v ? t('quiz.true') : t('quiz.false')}
                  </label>
                ))}
              </div>
            )}
            {q.kind === 'choice' && (
              <div className="space-y-1.5">
                {q.config.options.map(o => {
                  const sel = arr(a.value).includes(o.id);
                  const showKey = quiz.revealed && o.correct !== undefined;
                  return (
                    <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg px-3 py-2" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', outline: showKey && o.correct ? '1px solid #22c55e' : (sel && !canAnswer ? '1px solid var(--accent)' : 'none') }}>
                      <input type={q.config.multiple ? 'checkbox' : 'radio'} name={`q-${q.uuid}`} style={{ accentColor: 'var(--accent)' }} disabled={!canAnswer} checked={sel}
                        onChange={e => setAnswer(q, { value: q.config.multiple ? (e.target.checked ? [...arr(a.value), o.id] : arr(a.value).filter(x => x !== o.id)) : [o.id] })} />
                      {o.text}{showKey && o.correct && <Check className="w-3.5 h-3.5 text-green-400 ml-auto" />}
                    </label>
                  );
                })}
                {q.config.multiple && <p className="text-xs" style={muted}>{t('quiz.multipleHint')}</p>}
              </div>
            )}
            {q.kind === 'text' && (
              <textarea className="input-field resize-y" rows={4} disabled={!canAnswer} value={a.value || ''} placeholder={t('quiz.textPlaceholder')} aria-label={t('quiz.yourAnswer')}
                onChange={e => setAnswer(q, { value: e.target.value }, { debounce: true })} />
            )}
            {(q.kind === 'dataset' || q.kind === 'workflow') && (
              <div className="space-y-2">
                <label className="block text-xs font-medium" style={muted}>{q.kind === 'workflow' ? t('quiz.pickWorkflow') : t('quiz.pickDataset')}</label>
                {canAnswer ? (
                  <select className="input-field" value={a.ref?.uuid || ''} aria-label={q.kind === 'workflow' ? t('quiz.pickWorkflow') : t('quiz.pickDataset')}
                    onChange={e => { const list = q.kind === 'workflow' ? wfList : dsList; const f = list.find(x => x.uuid === e.target.value); setAnswer(q, { ref: f ? { kind: q.kind, uuid: f.uuid, name: f.name, available: true } : null }); }}>
                    <option value="">{t('communities.chooseOption')}</option>
                    {(q.kind === 'workflow' ? wfList : dsList).map(x => <option key={x.uuid} value={x.uuid}>{x.name}</option>)}
                  </select>
                ) : null}
                {a.ref && (
                  <AttachmentList items={[a.ref]} onPreview={setPreview} />
                )}
                {canAnswer && <p className="text-xs" style={muted}>{q.kind === 'workflow' ? t('quiz.workflowAnswerHint') : t('quiz.datasetAnswerHint')} <Link className="underline" to={q.kind === 'workflow' ? '/workflows' : '/workspace'}>{q.kind === 'workflow' ? t('quiz.goWorkflows') : t('quiz.goWorkspace')}</Link></p>}
              </div>
            )}
            {saved === q.uuid && <span className="text-xs text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> {t('quiz.saved')}</span>}
            {done && mine && (mine.points != null || mine.feedback) && (
              <p className="text-sm" style={lbl}>
                {mine.points != null && <strong>{fmtNum(mine.points)} / {fmtNum(q.points)} {t('quiz.ptsShort')}</strong>}
                {mine.feedback && <span> — {mine.feedback}</span>}
              </p>
            )}
            {quiz.revealed && q.kind === 'tf' && q.config.answer !== undefined && <p className="text-xs" style={muted}>{t('quiz.expected')}: {q.config.answer ? t('quiz.true') : t('quiz.false')}</p>}
            {quiz.revealed && q.kind === 'text' && q.config.model_answer && <p className="text-xs" style={muted}>{t('quiz.modelAnswer')}: {q.config.model_answer}</p>}
          </div>
        );
      })}
      {canAnswer && (
        <div className="flex justify-end">
          <button type="button" className="btn-primary flex items-center gap-2" disabled={submitting} onClick={submit} data-testid="submit-quiz"><Send className="w-4 h-4" /> {submitting ? t('common.saving') : t('quiz.submit')}</button>
        </div>
      )}
      <PreviewModal target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

/* ═══════════════════════════ Página ═══════════════════════════ */
function SettingsModal({ open, onClose, cid, quiz, sections, reload }) {
  const { t } = useTranslation();
  const [f, setF] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setF({ title: quiz.title, description: quiz.description || '', due_at: toLocalInput(quiz.due_at), show_results: quiz.show_results, section: quiz.section || '', max_attempts: quiz.max_attempts ?? 1, grade_policy: quiz.grade_policy || 'highest' }); }, [open]); // eslint-disable-line
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.quizzes.update(cid, quiz.uuid, { title: f.title, description: f.description, due_at: f.due_at ? new Date(f.due_at).toISOString() : null, show_results: f.show_results, section: f.section || null, max_attempts: Number(f.max_attempts), grade_policy: f.grade_policy });
      toast.success(t('quiz.saved')); await reload(); onClose();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('quiz.settings')} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.itemTitle')}</label>
          <input className="input-field" value={f.title || ''} maxLength={255} onChange={e => setF(x => ({ ...x, title: e.target.value }))} /></div>
        <div><label className="block text-sm font-medium mb-1.5" style={lbl}>{t('common.description')}</label>
          <textarea className="input-field resize-none" rows={3} value={f.description || ''} onChange={e => setF(x => ({ ...x, description: e.target.value }))} /></div>
        <div><label className="block text-sm font-medium mb-1.5" style={lbl}>{t('quiz.dueAt')}</label>
          <input type="datetime-local" className="input-field" value={f.due_at || ''} onChange={e => setF(x => ({ ...x, due_at: e.target.value }))} />
          <p className="text-xs mt-1" style={muted}>{t('quiz.dueHint')}</p></div>
        <div><label className="block text-sm font-medium mb-1.5" style={lbl}>{t('quiz.showResults')}</label>
          <select className="input-field" value={f.show_results || 'after_submit'} onChange={e => setF(x => ({ ...x, show_results: e.target.value }))}>
            {['after_submit', 'after_close', 'never'].map(v => <option key={v} value={v}>{t(`quiz.show.${v}`)}</option>)}
          </select></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium mb-1.5" style={lbl} htmlFor="qz-attempts">{t('quiz.maxAttempts')}</label>
            <input id="qz-attempts" type="number" min="0" max="50" step="1" className="input-field" value={f.max_attempts ?? 1} onChange={e => setF(x => ({ ...x, max_attempts: e.target.value }))} data-testid="max-attempts" />
            <p className="text-xs mt-1" style={muted}>{t('quiz.maxAttemptsHint')}</p></div>
          <div><label className="block text-sm font-medium mb-1.5" style={lbl} htmlFor="qz-policy">{t('quiz.gradePolicy')}</label>
            <select id="qz-policy" className="input-field" value={f.grade_policy || 'highest'} onChange={e => setF(x => ({ ...x, grade_policy: e.target.value }))} disabled={Number(f.max_attempts) === 1} data-testid="grade-policy">
              {['highest', 'latest', 'first'].map(v => <option key={v} value={v}>{t(`quiz.policy.${v}`)}</option>)}
            </select>
            <p className="text-xs mt-1" style={muted}>{t('quiz.gradePolicyHint')}</p></div>
        </div>
        <div><label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.topic')}</label>
          <select className="input-field" value={f.section || ''} onChange={e => setF(x => ({ ...x, section: e.target.value }))}>
            <option value="">{t('communities.generalTopic')}</option>
            {sections.map(s => <option key={s.uuid} value={s.uuid}>{'— '.repeat(s.depth || 0)}{s.title}</option>)}
          </select></div>
        <div className="flex gap-3"><button type="button" className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary flex-1" disabled={saving || !(f.title || '').trim()}>{saving ? t('common.saving') : t('common.save')}</button></div>
      </form>
    </Modal>
  );
}

export default function QuizPage() {
  const { id: cid, qid } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: community } = useApi(() => api.communities.get(cid), [cid]);
  const { data: quiz, loading, error, refetch } = useApi(() => api.quizzes.get(cid, qid), [cid, qid]);
  const { data: content } = useApi(() => (community?.permissions?.can_moderate ? api.communities.content(cid) : null), [cid, community?.permissions?.can_moderate]);
  const [tab, setTab] = useState('questions');
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const staff = !!community?.permissions?.can_moderate;

  const flatSections = useMemo(() => {
    const secs = arr(content?.sections); const out = [];
    const walk = (parent, depth) => secs.filter(s => (s.parent || null) === parent).forEach(s => { out.push({ ...s, depth }); walk(s.uuid, depth + 1); });
    walk(null, 0); return out;
  }, [content]);

  if (loading && !quiz) return <div className="space-y-4"><SkeletonCard className="h-24" /><SkeletonCard className="h-64" /></div>;
  if (error || !quiz) return <EmptyState icon={ClipboardList} title={t('quiz.notFound')} action={<Link to={`/communities/${cid}`} className="btn-primary">{t('communities.backToCommunities')}</Link>} />;

  const setStatus = async (status) => {
    setBusy(true);
    try { await api.quizzes.update(cid, qid, { status }); toast.success(t(`quiz.statusChanged.${status}`)); await refetch(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(t('quiz.deleteConfirm'))) return;
    try { await api.quizzes.remove(cid, qid); toast.success(t('quiz.deleted')); navigate(`/communities/${cid}`); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <AppCrumbs cid={cid} community={community} app="quizzes" trail={[{ label: quiz.title }]} />
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-primary)' }}>
              <ClipboardList className="w-5 h-5" /> {quiz.title} <StatusBadge status={quiz.status} />
            </h1>
            {quiz.description && <p className="text-sm mt-2 whitespace-pre-wrap" style={lbl}>{quiz.description}</p>}
            <p className="text-xs mt-2" style={muted}>
              {t('quiz.questionsCount', { count: arr(quiz.questions).length })} · {t('quiz.totalPoints', { total: fmtNum(quiz.total_points) })}
              {quiz.due_at && ` · ${t('quiz.dueOn', { date: fmtDate(quiz.due_at) })}`}
            </p>
          </div>
          {staff && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => setSettings(true)}><Pencil className="w-3.5 h-3.5" /> {t('quiz.settings')}</button>
              {quiz.status === 'draft' && <button type="button" className="btn-primary text-sm flex items-center gap-1.5" disabled={busy || !arr(quiz.questions).length} onClick={() => setStatus('open')} data-testid="publish"><Unlock className="w-3.5 h-3.5" /> {t('quiz.publish')}</button>}
              {quiz.status === 'open' && <button type="button" className="btn-ghost text-sm flex items-center gap-1.5" disabled={busy} onClick={() => setStatus('closed')}><Lock className="w-3.5 h-3.5" /> {t('quiz.close')}</button>}
              {quiz.status === 'closed' && <button type="button" className="btn-ghost text-sm flex items-center gap-1.5" disabled={busy} onClick={() => setStatus('open')}><Unlock className="w-3.5 h-3.5" /> {t('quiz.reopenQuiz')}</button>}
              {quiz.status !== 'draft' && <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => setStatus('draft')}>{t('quiz.unpublish')}</button>}
              <button type="button" className="btn-ghost text-sm flex items-center gap-1.5" onClick={remove} aria-label={t('common.delete')}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </div>

      {staff ? (
        <>
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-hover)' }} role="tablist">
            {['questions', 'submissions'].map(k => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="px-4 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: tab === k ? 'var(--accent)' : 'transparent', color: tab === k ? '#fff' : 'var(--text-secondary)' }}>{t(`quiz.tab.${k}`)}</button>
            ))}
          </div>
          {tab === 'questions' && <Builder cid={cid} quiz={quiz} reload={refetch} />}
          {tab === 'submissions' && <SubmissionsTab cid={cid} quiz={quiz} />}
        </>
      ) : <StudentView cid={cid} quiz={quiz} reload={refetch} />}

      {staff && <SettingsModal open={settings} onClose={() => setSettings(false)} cid={cid} quiz={quiz} sections={flatSections} reload={refetch} />}
    </div>
  );
}
