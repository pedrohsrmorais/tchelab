import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CalendarClock, MessageSquare } from 'lucide-react';
import { AvatarStack } from './Cells';
import { ink, fmtDay, labelsOf, dueOf, isOverdue, arr } from './boardUtils';

/** Visão Kanban: uma coluna por rótulo da coluna de status escolhida. Arrastar o cartão muda o status. */
export default function BoardKanban({ columns, items, members, ctx, laneCol, onOpen, onAdd }) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState(null);
  const K = (id) => (id === null ? '__none' : id); // null (sem status) também é uma raia
  const [over, setOver] = useState(undefined);
  const [adding, setAdding] = useState(undefined);
  const [title, setTitle] = useState('');
  if (!laneCol) return <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('board.kanbanNeedsStatus')}</p>;
  const lanes = [...labelsOf(laneCol).map((l) => ({ id: l.id, label: l.label, color: l.color })), { id: null, label: t('board.noStatus'), color: 'var(--text-muted)' }];
  const peopleCols = columns.filter((c) => c.type === 'people');

  const dropOn = (id) => {
    const it = items.find((i) => i.uuid === drag);
    setDrag(null); setOver(undefined);
    if (!it || (it.cells[laneCol.uuid] || null) === id) return;
    ctx.onSet(it, laneCol, id);
  };

  return (
    <div className="board-kanban" data-testid="board-kanban">
      {lanes.map((ln) => {
        const list = items.filter((i) => (i.cells[laneCol.uuid] || null) === ln.id);
        if (ln.id === null && list.length === 0 && lanes.length > 1 && !drag) return null;
        return (
          <section key={String(ln.id)} className={`board-lane ${over === K(ln.id) ? 'over' : ''}`} aria-label={ln.label} data-lane={ln.label}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(K(ln.id)); } }} onDragLeave={() => setOver((o) => (o === K(ln.id) ? undefined : o))} onDrop={(e) => { e.preventDefault(); dropOn(ln.id); }}>
            <header className="flex items-center gap-2 px-3 py-2.5 rounded-t-[inherit]" style={{ borderTop: `4px solid ${ln.color}` }}>
              <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{ln.label}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{list.length}</span>
            </header>
            <div className="px-2 pb-2 space-y-2 overflow-y-auto" style={{ minHeight: 24 }}>
              {list.map((it) => {
                const due = dueOf(columns, it); const late = isOverdue(columns, it);
                const who = peopleCols.flatMap((c) => arr(it.cells[c.uuid]));
                return (
                  <button key={it.uuid} type="button" className={`board-card ${drag === it.uuid ? 'is-dragging' : ''}`} draggable={it.access !== 'none'} data-card={it.title}
                    onDragStart={(e) => { setDrag(it.uuid); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.uuid); }} onDragEnd={() => { setDrag(null); setOver(undefined); }}
                    onClick={() => onOpen(it)}>
                    <span className="board-seq">#{it.seq}</span>
                    <span className="block text-sm font-medium mt-0.5 break-words" style={{ color: 'var(--text-primary)' }}>{it.title}</span>
                    <span className="flex items-center gap-2 mt-2 flex-wrap">
                      {columns.filter((c) => c.type === 'status' && c.uuid !== laneCol.uuid).map((c) => {
                        const l = labelsOf(c).find((x) => x.id === it.cells[c.uuid]);
                        return l ? <span key={c.uuid} className="board-chip" style={{ background: l.color, color: ink(l.color) }}>{l.label}</span> : null;
                      })}
                      {due && <span className="text-xs flex items-center gap-1" style={{ color: late ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: late ? 600 : 400 }}><CalendarClock className="w-3 h-3" />{fmtDay(due)}</span>}
                      {it.comments > 0 && <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><MessageSquare className="w-3 h-3" />{it.comments}</span>}
                      <span className="ml-auto">{who.length > 0 && <AvatarStack uuids={[...new Set(who)]} members={members} size={22} max={3} />}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {ctx.canCreate && (
              <div className="px-2 pb-2">
                {adding === K(ln.id) ? (
                  <input autoFocus className="input-field text-sm" value={title} placeholder={t('board.itemTitle')} maxLength={300} onChange={(e) => setTitle(e.target.value)} aria-label={t('board.itemTitle')}
                    onBlur={() => { setAdding(undefined); setTitle(''); }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(undefined); setTitle(''); } if (e.key === 'Enter' && title.trim()) { onAdd(title.trim(), ln.id); setTitle(''); } }} />
                ) : (
                  <button type="button" className="board-tool w-full justify-start" onClick={() => { setAdding(K(ln.id)); setTitle(''); }}><Plus className="w-3.5 h-3.5" /> {t('board.addItem')}</button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
