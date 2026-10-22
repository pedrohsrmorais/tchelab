import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Copy, Trash2, Send, MessageSquare, History, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import Avatar from '../ui/Avatar';
import { Cell } from './Cells';
import { api } from '../../api';
import { parseApiError } from '../../utils/errors';
import { arr, timeAgo, fmtDateTime } from './boardUtils';

function Activity({ a }) {
  const { t } = useTranslation();
  const d = a.data || {};
  const who = <strong style={{ color: 'var(--text-primary)' }}>{a.user?.name || t('board.someone')}</strong>;
  let what;
  switch (a.kind) {
    case 'item_created': what = d.copy_of ? t('board.act.duplicated', { n: d.copy_of }) : t('board.act.created'); break;
    case 'renamed': what = t('board.act.renamed', { old: d.old, new: d.new }); break;
    case 'moved': what = d.from ? t('board.act.moved', { from: d.from, to: d.to }) : t('board.act.movedTo', { to: d.to }); break;
    case 'cell':
      what = (
        <>{t('board.act.changed', { col: d.col })}{' '}
          <span style={{ color: 'var(--text-muted)' }}>{d.old || t('board.empty')}</span> <ArrowRight className="w-3 h-3 inline" /> <span style={{ color: 'var(--text-primary)' }}>{d.new || t('board.empty')}</span></>
      );
      break;
    default: what = a.kind;
  }
  return (
    <li className="flex gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
      <Avatar user={a.user || { name: '?' }} size={24} />
      <div className="min-w-0"><p>{who} {what}</p><p className="text-xs" style={{ color: 'var(--text-muted)' }} title={fmtDateTime(a.created_at)}>{timeAgo(a.created_at, t)}</p></div>
    </li>
  );
}

/** Painel lateral do item (estilo "ticket"): campos editáveis, atualizações (comentários) e atividade. */
export default function ItemPanel({ cid, bid, item, board, ctx, autoFocusTitle, onClose, onRename, onMoveGroup, onDuplicate, onDelete, rev }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('updates');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState(item?.title || '');
  const titleRef = useRef(null);
  const iid = item?.uuid;

  const load = useCallback(async () => {
    if (!iid) return;
    try { const r = await api.boards.getItem(cid, bid, iid); setDetail(r.data.data); } catch { /* item pode ter sido excluído */ }
  }, [cid, bid, iid]);

  useEffect(() => { setDetail(null); setText(''); setTab('updates'); load(); }, [iid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [rev]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTitle(item?.title || ''); }, [item?.title, iid]);
  useEffect(() => { if (autoFocusTitle) { titleRef.current?.focus(); titleRef.current?.select(); } }, [autoFocusTitle, iid]);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape' && !document.querySelector('.board-pop')) onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  if (!item) return null;
  const canEditTitle = item.access === 'all';
  const commitTitle = () => { const v = title.trim(); if (!v) { setTitle(item.title); return; } if (v !== item.title) onRename(item, v); };
  const send = async () => {
    const body = text.trim(); if (!body) return;
    setSending(true);
    try { await api.boards.addComment(cid, bid, iid, body); setText(''); await load(); ctx.refresh?.(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSending(false); }
  };
  const delComment = async (id) => {
    try { await api.boards.removeComment(cid, bid, iid, id); await load(); ctx.refresh?.(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
  };
  const group = board.groups.find((g) => g.uuid === item.group);

  return (
    <>
      <div className="board-drawer-back" onClick={onClose} aria-hidden />
      <aside className="board-drawer" role="dialog" aria-label={item.title} data-testid="item-panel">
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="board-seq text-sm" data-testid="item-seq">#{item.seq}</span>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: group?.color }} aria-hidden />
          {canEditTitle ? (
            <select className="text-xs bg-transparent border rounded-md px-1.5 py-1 min-w-0" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', maxWidth: 190 }}
              value={item.group} onChange={(e) => onMoveGroup(item, e.target.value)} aria-label={t('board.group')}>
              {board.groups.map((g) => <option key={g.uuid} value={g.uuid}>{g.title}</option>)}
            </select>
          ) : <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{group?.title}</span>}
          <span className="flex-1" />
          {ctx.canCreate && <button type="button" className="btn-ghost p-1.5" onClick={() => onDuplicate(item)} aria-label={t('board.duplicate')} title={t('board.duplicate')}><Copy className="w-4 h-4" /></button>}
          {detail?.can_delete && <button type="button" className="btn-ghost p-1.5" onClick={() => onDelete(item)} aria-label={t('board.deleteItem')} title={t('board.deleteItem')} data-testid="item-delete"><Trash2 className="w-4 h-4" /></button>}
          <button type="button" className="btn-ghost p-1.5" onClick={onClose} aria-label={t('common.close')}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-4 pb-2">
            <input ref={titleRef} className="w-full bg-transparent text-xl font-bold outline-none rounded-md px-1 -mx-1" style={{ color: 'var(--text-primary)', border: '1.5px solid transparent' }}
              value={title} maxLength={300} readOnly={!canEditTitle} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
              onFocus={(e) => { if (canEditTitle) e.target.style.borderColor = 'var(--accent)'; }} onBlurCapture={(e) => { e.target.style.borderColor = 'transparent'; }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTitle(item.title); e.currentTarget.blur(); } }}
              aria-label={t('board.itemTitle')} data-testid="item-title" />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {item.created_by ? t('board.createdBy', { name: item.created_by.name, when: timeAgo(item.created_at, t) }) : timeAgo(item.created_at, t)}
              {item.access === 'none' && ` · ${t('board.readOnly')}`}{item.access === 'status' && ` · ${t('board.onlyStatus')}`}
            </p>
          </div>

          <div className="px-4 pb-3">
            {board.columns.filter((c) => true).map((c) => (
              <div key={c.uuid} className="board-field">
                <span className="truncate" style={{ color: 'var(--text-muted)' }} title={c.title}>{c.title}</span>
                <div className="min-w-0 relative"><Cell col={c} item={item} ctx={ctx} form /></div>
              </div>
            ))}
          </div>

          <div className="px-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex gap-1 pt-2" role="tablist">
              {[['updates', MessageSquare, t('board.updates'), arr(detail?.comments).length], ['activity', History, t('board.activity'), null]].map(([k, Icon, label, n]) => (
                <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className="board-tool" style={tab === k ? { background: 'var(--bg-hover)', color: 'var(--text-primary)' } : undefined}>
                  <Icon className="w-3.5 h-3.5" /> {label}{n ? ` (${n})` : ''}
                </button>
              ))}
            </div>

            {tab === 'updates' && (
              <div className="py-3 space-y-3">
                <div>
                  <textarea className="input-field text-sm" rows={3} placeholder={t('board.writeUpdate')} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(); }} aria-label={t('board.writeUpdate')} data-testid="comment-input" />
                  <div className="flex justify-end mt-1.5"><button type="button" className="btn-primary text-sm flex items-center gap-1.5" disabled={sending || !text.trim()} onClick={send} data-testid="comment-send"><Send className="w-3.5 h-3.5" /> {t('board.comment')}</button></div>
                </div>
                <ul className="space-y-3">
                  {arr(detail?.comments).map((c) => (
                    <li key={c.uuid} className="flex gap-2" data-testid="comment">
                      <Avatar user={c.user || { name: '?' }} size={28} />
                      <div className="min-w-0 flex-1 rounded-lg px-3 py-2" style={{ background: 'var(--bg-hover)' }}>
                        <div className="flex items-center gap-2 text-xs"><strong style={{ color: 'var(--text-primary)' }}>{c.user?.name || t('board.someone')}</strong><span style={{ color: 'var(--text-muted)' }} title={fmtDateTime(c.created_at)}>{timeAgo(c.created_at, t)}</span>
                          {c.can_delete && <button type="button" className="ml-auto" aria-label={t('board.remove')} onClick={() => delComment(c.uuid)} style={{ color: 'var(--text-muted)' }}><Trash2 className="w-3 h-3" /></button>}</div>
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                      </div>
                    </li>
                  ))}
                  {detail && arr(detail.comments).length === 0 && <li className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>{t('board.noUpdates')}</li>}
                </ul>
              </div>
            )}
            {tab === 'activity' && (
              <ul className="py-3 space-y-3">
                {arr(detail?.activity).map((a, i) => <Activity key={i} a={a} />)}
                {detail && arr(detail.activity).length === 0 && <li className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>{t('board.noActivity')}</li>}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
