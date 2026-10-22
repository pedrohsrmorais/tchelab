import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SquareKanban, Plus, ChevronRight, ListChecks, Ticket, GraduationCap, LayoutTemplate, Users, UserCheck, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { parseApiError } from '../../utils/errors';
import { todayKey, arr } from './boardUtils';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';

const TEMPLATES = [['lab_tasks', ListChecks], ['tickets', Ticket], ['course', GraduationCap], ['blank', LayoutTemplate]];
const POLICY_ICON = { members: Users, own: UserCheck, staff: Lock };

export function BoardCreateModal({ open, onClose, cid }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [template, setTemplate] = useState('lab_tasks');
  const [title, setTitle] = useState('');
  const [policy, setPolicy] = useState('members');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const r = await api.boards.create(cid, { title: title.trim(), template, edit_policy: policy, lang: (i18n.language || 'pt').slice(0, 2) });
      toast.success(t('board.created')); onClose(); setTitle('');
      navigate(`/communities/${cid}/boards/${r.data.data.uuid}`);
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('board.newBoard')} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('board.boardTitle')}</label>
          <input autoFocus className="input-field" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} placeholder={t('board.boardTitlePlaceholder')} data-testid="new-board-title" />
        </div>
        <fieldset>
          <legend className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('board.startFrom')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map(([k, Icon]) => (
              <button key={k} type="button" onClick={() => setTemplate(k)} aria-pressed={template === k} data-template={k}
                className="flex items-start gap-3 p-3 rounded-xl text-left border" style={{ borderColor: template === k ? 'var(--accent)' : 'var(--border)', boxShadow: template === k ? '0 0 0 1px var(--accent)' : 'none', background: template === k ? 'var(--bg-hover)' : 'transparent' }}>
                <Icon className="w-5 h-5 mt-0.5 flex-shrink-0 text-sky-400" />
                <span><span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t(`board.template.${k}`)}</span><span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{t(`board.templateDesc.${k}`)}</span></span>
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('board.whoCanEdit')}</label>
          <select className="input-field" value={policy} onChange={(e) => setPolicy(e.target.value)}>
            {['members', 'own', 'staff'].map((p) => <option key={p} value={p}>{t(`board.policy.${p}`)}</option>)}
          </select>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t(`board.policyDesc.${policy}`)}</p>
        </div>
        <div className="flex gap-3 justify-end"><button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="btn-primary" disabled={busy || !title.trim()} data-testid="create-board">{t('board.createBoard')}</button></div>
      </form>
    </Modal>
  );
}

/** Lista de quadros da comunidade (aba Apps). */
export default function BoardsSection({ id, canEdit, onAdd, refreshKey }) {
  const { t } = useTranslation();
  const { data } = useApi(() => api.boards.list(id, todayKey()), [id, refreshKey]);
  const list = arr(data);
  return (
    <section className="space-y-3" data-testid="boards-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{t('board.appTitle')}</h2>
        {canEdit && list.length > 0 && <button className="btn-primary text-sm flex items-center gap-1.5" onClick={onAdd} data-testid="new-board"><Plus className="w-3.5 h-3.5" /> {t('board.newBoard')}</button>}
      </div>
      {data && list.length === 0 ? (
        <EmptyState icon={SquareKanban} title={t('board.noneTitle')} description={canEdit ? t('board.noneDescEdit') : t('board.noneDesc')}
          action={canEdit ? <button className="btn-primary text-sm flex items-center gap-1.5" onClick={onAdd}><Plus className="w-3.5 h-3.5" /> {t('board.newBoard')}</button> : undefined} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => {
            const P = POLICY_ICON[b.edit_policy];
            const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
            return (
              <li key={b.uuid}>
                <Link to={`/communities/${id}/boards/${b.uuid}`} className="card block overflow-hidden hover:opacity-90 h-full" data-testid="board-card">
                  <div style={{ height: 6, background: b.color || 'var(--accent)' }} />
                  <div className="p-4 space-y-2">
                    <div className="flex items-start gap-2"><span className="font-semibold text-sm flex-1 min-w-0 break-words" style={{ color: 'var(--text-primary)' }}>{b.title}</span><ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} /></div>
                    {b.description && <p className="text-xs line-clamp-2" style={{ color: 'var(--text-muted)' }}>{b.description}</p>}
                    {b.has_status && (
                      <div><div className="board-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('board.progress')}><span style={{ width: `${pct}%`, background: 'var(--success)' }} /></div>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{t('board.doneCount', { done: b.done, total: b.total })}</p></div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {!b.has_status && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('board.itemsCount', { count: b.total })}</span>}
                      {b.mine > 0 && <span className="badge badge-blue">{t('board.mineCount', { count: b.mine })}</span>}
                      {b.overdue > 0 && <span className="badge badge-red">{t('board.overdueCount', { count: b.overdue })}</span>}
                      <span className="ml-auto" style={{ color: 'var(--text-muted)' }} title={t(`board.policyDesc.${b.edit_policy}`)}><P className="w-3.5 h-3.5" /></span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
