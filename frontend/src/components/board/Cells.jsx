import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Pencil, Search, CalendarClock, ExternalLink, Settings2, Plus } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Popover from './Popover';
import MiniCalendar from './MiniCalendar';
import { arr, ink, labelsOf, labelOf, fmtDay, fmtRangeKeys, todayKey, formatNumber } from './boardUtils';

/**
 * Uma célula do quadro (tabela ou formulário do painel). Editar = clicar; cada alteração vai direto para a API
 * (`ctx.onSet(item, col, valor)`), uma célula por vez.
 *   ctx = { members, editable(item, col), onSet, structure (pode editar rótulos), onEditLabels(col), overdue(item) }
 */
export function Cell({ col, item, ctx, form = false }) {
  const editable = ctx.editable(item, col);
  const p = { col, item, ctx, editable, form, value: item.cells[col.uuid] };
  switch (col.type) {
    case 'status': return <StatusCell {...p} />;
    case 'people': return <PeopleCell {...p} />;
    case 'date': return <DateCell {...p} />;
    case 'timeline': return <TimelineCell {...p} />;
    case 'dropdown': return <DropdownCell {...p} />;
    case 'checkbox': return <CheckboxCell {...p} />;
    case 'link': return <LinkCell {...p} />;
    case 'number': return <TextCell {...p} number />;
    default: return <TextCell {...p} />;
  }
}

const wrap = (form) => (form ? 'flex items-center min-h-[38px] w-full' : 'flex items-center h-full w-full');

/* ── Texto / número ─────────────────────────────────────────────────────── */
function TextCell({ col, item, ctx, editable, form, value, number }) {
  const { t } = useTranslation();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef(null);
  useEffect(() => { if (edit) { ref.current?.focus(); ref.current?.select?.(); } }, [edit]);
  const start = () => { if (!editable) return; setDraft(value == null ? '' : String(value)); setEdit(true); };
  const commit = () => {
    setEdit(false);
    const next = draft.trim();
    if (next === (value == null ? '' : String(value))) return;
    ctx.onSet(item, col, next === '' ? null : next);
  };
  if (edit) {
    return (
      <input ref={ref} className="board-input" value={draft} onChange={(e) => setDraft(e.target.value)} inputMode={number ? 'decimal' : undefined}
        maxLength={number ? 24 : 1000} aria-label={col.title}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(false); }}
        style={{ textAlign: number && !form ? 'right' : 'left' }} />
    );
  }
  const shown = number ? formatNumber(value, col) : value;
  return (
    <button type="button" className={`${wrap(form)} board-cell-btn ${number && !form ? 'justify-end' : ''}`} onClick={start} disabled={!editable} title={shown || undefined}
      aria-label={`${col.title}: ${shown || t('board.empty')}`}>
      <span className="truncate" style={{ color: shown ? 'var(--text-primary)' : 'var(--text-muted)' }}>{shown || (editable && form ? t('board.empty') : '')}</span>
    </button>
  );
}

/* ── Status ─────────────────────────────────────────────────────────────── */
function StatusCell({ col, item, ctx, editable, form, value }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const label = labelOf(col, value);
  const set = (id) => { setOpen(false); if (id !== value) ctx.onSet(item, col, id); };
  return (
    <>
      <button ref={ref} type="button" disabled={!editable} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox"
        className={`board-status ${form ? 'board-status-form' : ''}`} data-testid="status-cell"
        style={{ background: label ? label.color : 'var(--bg-hover)', color: label ? ink(label.color) : 'var(--text-muted)', cursor: editable ? 'pointer' : 'default' }}>
        <span className="truncate">{label ? label.label : (editable ? '—' : '')}</span>
      </button>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} width={220}>
          <ul className="p-2 space-y-1.5" role="listbox">
            {labelsOf(col).map((l) => (
              <li key={l.id}>
                <button type="button" role="option" aria-selected={l.id === value} onClick={() => set(l.id)} className="board-status w-full" data-label={l.label}
                  style={{ background: l.color, color: ink(l.color), outline: l.id === value ? '2px solid var(--text-primary)' : 'none' }}>
                  <span className="truncate">{l.label}</span>{l.done && <Check className="w-3.5 h-3.5 ml-1 flex-shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t px-2 py-1.5 flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
            {value ? <button type="button" className="text-xs underline" style={{ color: 'var(--text-muted)' }} onClick={() => set(null)}>{t('board.clear')}</button> : <span />}
            {ctx.structure && <button type="button" className="text-xs flex items-center gap-1" style={{ color: 'var(--text-accent)' }} onClick={() => { setOpen(false); ctx.onEditLabels(col); }}><Settings2 className="w-3 h-3" /> {t('board.editLabels')}</button>}
          </div>
        </Popover>
      )}
    </>
  );
}

/* ── Lista (várias opções) ──────────────────────────────────────────────── */
function DropdownCell({ col, item, ctx, editable, form, value }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const sel = arr(value);
  const toggle = (id) => ctx.onSet(item, col, sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <>
      <button ref={ref} type="button" disabled={!editable} onClick={() => setOpen((o) => !o)} className={`${wrap(form)} board-cell-btn gap-1 overflow-hidden`} aria-label={col.title}>
        {sel.length === 0 && <span style={{ color: 'var(--text-muted)' }}>{editable && form ? t('board.empty') : ''}</span>}
        {sel.map((id) => { const l = labelOf(col, id); return l ? <span key={id} className="board-chip" style={{ background: l.color, color: ink(l.color) }}>{l.label}</span> : null; })}
      </button>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} width={230}>
          <ul className="p-2 space-y-1">
            {labelsOf(col).map((l) => (
              <li key={l.id}>
                <button type="button" className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-[var(--bg-hover)]" onClick={() => toggle(l.id)}>
                  <span className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0" style={{ borderColor: 'var(--border-strong)', background: sel.includes(l.id) ? 'var(--accent)' : 'transparent' }}>{sel.includes(l.id) && <Check className="w-3 h-3 text-white" />}</span>
                  <span className="board-chip" style={{ background: l.color, color: ink(l.color) }}>{l.label}</span>
                </button>
              </li>
            ))}
            {labelsOf(col).length === 0 && <li className="text-xs px-2 py-1" style={{ color: 'var(--text-muted)' }}>{t('board.noOptions')}</li>}
          </ul>
          {ctx.structure && (
            <div className="border-t px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
              <button type="button" className="text-xs flex items-center gap-1" style={{ color: 'var(--text-accent)' }} onClick={() => { setOpen(false); ctx.onEditLabels(col); }}><Settings2 className="w-3 h-3" /> {t('board.editOptions')}</button>
            </div>
          )}
        </Popover>
      )}
    </>
  );
}

/* ── Pessoas ────────────────────────────────────────────────────────────── */
export function AvatarStack({ uuids, members, size = 24, max = 3 }) {
  const list = arr(uuids).map((u) => members.find((m) => m.uuid === u)).filter(Boolean);
  const shown = list.slice(0, max);
  return (
    <span className="flex items-center" style={{ paddingLeft: 4 }}>
      {shown.map((m, i) => <span key={m.uuid} style={{ marginLeft: i ? -6 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--bg-surface)' }}><Avatar user={m} size={size} /></span>)}
      {list.length > max && <span className="text-[0.7rem] ml-1" style={{ color: 'var(--text-secondary)' }}>+{list.length - max}</span>}
    </span>
  );
}

function PeopleCell({ col, item, ctx, editable, form, value }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const sel = arr(value);
  const multiple = col.config?.multiple !== false;
  const pick = (uuid) => {
    if (!multiple) { ctx.onSet(item, col, sel.includes(uuid) ? [] : [uuid]); setOpen(false); return; }
    ctx.onSet(item, col, sel.includes(uuid) ? sel.filter((x) => x !== uuid) : [...sel, uuid]);
  };
  const list = ctx.members.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));
  const names = sel.map((u) => ctx.members.find((m) => m.uuid === u)?.name).filter(Boolean);
  return (
    <>
      <button ref={ref} type="button" disabled={!editable} onClick={() => { setQ(''); setOpen((o) => !o); }} className={`${wrap(form)} board-cell-btn gap-2`} aria-label={`${col.title}: ${names.join(', ') || t('board.empty')}`} data-testid="people-cell">
        {sel.length ? <AvatarStack uuids={sel} members={ctx.members} size={form ? 26 : 24} max={form ? 6 : 3} /> : <span style={{ color: 'var(--text-muted)' }}>{editable ? (form ? t('board.assign') : <Plus className="w-3.5 h-3.5 opacity-0 board-hover-show" />) : ''}</span>}
        {form && names.length > 0 && <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{names.join(', ')}</span>}
      </button>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} width={250}>
          <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input autoFocus className="input-field text-sm" style={{ paddingLeft: 28, paddingTop: 6, paddingBottom: 6 }} placeholder={t('board.searchPeople')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('board.searchPeople')} /></div>
          </div>
          <ul className="p-1" role="listbox">
            {list.map((m) => (
              <li key={m.uuid}>
                <button type="button" role="option" aria-selected={sel.includes(m.uuid)} onClick={() => pick(m.uuid)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-[var(--bg-hover)]" data-person={m.name}>
                  <Avatar user={m} size={24} /><span className="truncate flex-1 text-left" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                  {sel.includes(m.uuid) && <Check className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="text-xs p-2" style={{ color: 'var(--text-muted)' }}>{t('board.noPeople')}</li>}
          </ul>
        </Popover>
      )}
    </>
  );
}

/* ── Data / período ─────────────────────────────────────────────────────── */
function DateCell({ col, item, ctx, editable, form, value }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const late = value && value < todayKey() && ctx.overdue?.(item) && col === ctx.dueCol;
  const set = (v) => { setOpen(false); ctx.onSet(item, col, v); };
  return (
    <>
      <button ref={ref} type="button" disabled={!editable} onClick={() => setOpen((o) => !o)} className={`${wrap(form)} board-cell-btn gap-1.5`} aria-label={`${col.title}: ${value ? fmtDay(value, { withYear: true }) : t('board.empty')}`} data-testid="date-cell">
        {value ? <><CalendarClock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: late ? 'var(--danger)' : 'var(--text-muted)' }} /><span className="truncate" style={{ color: late ? 'var(--danger)' : 'var(--text-primary)', fontWeight: late ? 600 : 400 }}>{fmtDay(value)}</span></>
          : <span style={{ color: 'var(--text-muted)' }}>{editable && form ? t('board.empty') : ''}</span>}
      </button>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} width={260}>
          <MiniCalendar value={value} onPick={set} />
          <div className="border-t px-2 py-1.5 flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <button type="button" className="text-xs underline" style={{ color: 'var(--text-accent)' }} onClick={() => set(todayKey())}>{t('board.today')}</button>
            {value && <button type="button" className="text-xs underline" style={{ color: 'var(--text-muted)' }} onClick={() => set(null)}>{t('board.clear')}</button>}
          </div>
        </Popover>
      )}
    </>
  );
}

function TimelineCell({ col, item, ctx, editable, form, value }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const set = (v) => { setOpen(false); ctx.onSet(item, col, v); };
  return (
    <>
      <button ref={ref} type="button" disabled={!editable} onClick={() => setOpen((o) => !o)} className={`${wrap(form)} board-cell-btn`} aria-label={`${col.title}: ${value ? fmtRangeKeys(value.start, value.end) : t('board.empty')}`}>
        {value ? <span className="board-chip" style={{ background: 'var(--accent)', color: '#fff', minWidth: 0 }}><span className="truncate">{fmtRangeKeys(value.start, value.end)}</span></span>
          : <span style={{ color: 'var(--text-muted)' }}>{editable && form ? t('board.empty') : ''}</span>}
      </button>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} width={260}>
          <MiniCalendar range value={value} onPick={set} />
          {value && <div className="border-t px-2 py-1.5 text-right" style={{ borderColor: 'var(--border)' }}><button type="button" className="text-xs underline" style={{ color: 'var(--text-muted)' }} onClick={() => set(null)}>{t('board.clear')}</button></div>}
        </Popover>
      )}
    </>
  );
}

/* ── Caixa de seleção ───────────────────────────────────────────────────── */
function CheckboxCell({ col, item, ctx, editable, form, value }) {
  return (
    <span className={`${wrap(form)} ${form ? '' : 'justify-center'}`}>
      <input type="checkbox" checked={!!value} disabled={!editable} onChange={(e) => ctx.onSet(item, col, e.target.checked)} aria-label={col.title}
        style={{ width: 17, height: 17, accentColor: 'var(--accent)', cursor: editable ? 'pointer' : 'default' }} />
    </span>
  );
}

/* ── Link ───────────────────────────────────────────────────────────────── */
function LinkCell({ col, item, ctx, editable, form, value }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(''); const [text, setText] = useState('');
  const ref = useRef(null);
  const start = () => { setUrl(value?.url || ''); setText(value?.text || ''); setOpen(true); };
  const save = () => { const u = url.trim(); setOpen(false); if (!u) { if (value) ctx.onSet(item, col, null); return; } ctx.onSet(item, col, text.trim() ? { url: u, text: text.trim() } : { url: u }); };
  return (
    <>
      <span ref={ref} className={`${wrap(form)} gap-1.5 min-w-0`}>
        {value ? (
          <a href={value.url} target="_blank" rel="noopener noreferrer" className="truncate text-sm underline flex items-center gap-1 min-w-0" style={{ color: 'var(--text-accent)' }} onClick={(e) => e.stopPropagation()}>
            <ExternalLink className="w-3 h-3 flex-shrink-0" /><span className="truncate">{value.text || value.url}</span>
          </a>
        ) : <span style={{ color: 'var(--text-muted)' }}>{editable && form ? t('board.empty') : ''}</span>}
        {editable && <button type="button" className="board-hover-show ml-auto p-1 rounded" aria-label={t('board.editLink')} onClick={start}><Pencil className="w-3 h-3" /></button>}
      </span>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} width={280}>
          <div className="p-3 space-y-2">
            <input autoFocus className="input-field text-sm" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="URL" onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            <input className="input-field text-sm" placeholder={t('board.linkText')} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('board.linkText')} maxLength={100} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            <div className="flex justify-between">
              {value ? <button type="button" className="text-xs underline" style={{ color: 'var(--danger)' }} onClick={() => { setOpen(false); ctx.onSet(item, col, null); }}>{t('board.remove')}</button> : <span />}
              <button type="button" className="btn-primary text-xs py-1" onClick={save}>{t('common.save')}</button>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

