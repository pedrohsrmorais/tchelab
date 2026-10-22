import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, Columns3, Table2, Kanban, Check, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import Popover from './Popover';
import { TYPE_ICON } from './BoardTable';
import { PALETTE, ink, labelsOf, arr } from './boardUtils';
import { api } from '../../api';
import { parseApiError } from '../../utils/errors';

const TYPES = ['status', 'people', 'date', 'timeline', 'text', 'number', 'dropdown', 'checkbox', 'link'];

/* ── Barra de ferramentas ───────────────────────────────────────────────── */
export function Toolbar({ columns, members, me, filters, setFilters, view, setView, hiddenCols, toggleHidden, activeCount, canCreate, onNew, onSettings, structure, laneCols, laneCol, setLaneCol }) {
  const { t } = useTranslation();
  const [pop, setPop] = useState(null);
  const filterBtn = useRef(null); const colsBtn = useRef(null);
  const statusCols = columns.filter((c) => c.type === 'status' || c.type === 'dropdown');
  const meUuid = me?.uuid;
  const togglePerson = (u) => setFilters((f) => ({ ...f, people: f.people.includes(u) ? f.people.filter((x) => x !== u) : [...f.people, u] }));
  const toggleStatus = (cu, id) => setFilters((f) => { const cur = arr(f.status[cu]); return { ...f, status: { ...f.status, [cu]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } }; });
  const clear = () => setFilters({ q: '', people: [], status: {}, overdue: false, hideDone: false });

  return (
    <div className="board-toolbar" role="toolbar" aria-label={t('board.toolbar')}>
      {canCreate && <button type="button" className="btn-primary text-sm flex items-center gap-1.5" onClick={onNew} data-testid="new-item"><Plus className="w-4 h-4" /> {t('board.newItem')}</button>}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input className="input-field text-sm" style={{ paddingLeft: 30, paddingTop: 6, paddingBottom: 6, width: 190 }} value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder={t('board.search')} aria-label={t('board.search')} data-testid="board-search" />
      </div>
      <button type="button" className={`board-tool ${filters.people.includes(meUuid) ? 'on' : ''}`} onClick={() => togglePerson(meUuid)} aria-pressed={filters.people.includes(meUuid)} data-testid="filter-mine"><Avatar user={me} size={18} /> {t('board.onlyMine')}</button>
      <button ref={filterBtn} type="button" className={`board-tool ${activeCount ? 'on' : ''}`} onClick={() => setPop(pop === 'filter' ? null : 'filter')} data-testid="filter-btn"><Filter className="w-3.5 h-3.5" /> {t('board.filter')}{activeCount ? ` (${activeCount})` : ''}</button>
      <button ref={colsBtn} type="button" className={`board-tool ${hiddenCols.length ? 'on' : ''}`} onClick={() => setPop(pop === 'cols' ? null : 'cols')} data-testid="cols-btn" style={{ display: view === 'table' ? undefined : 'none' }}><Columns3 className="w-3.5 h-3.5" /> {t('board.columns')}{hiddenCols.length ? ` (${columns.length - hiddenCols.length}/${columns.length})` : ''}</button>
      {view === 'kanban' && laneCols.length > 1 && (
        <select className="input-field text-sm" style={{ width: 'auto', paddingTop: 5, paddingBottom: 5 }} value={laneCol?.uuid || ''} onChange={(e) => setLaneCol(e.target.value)} aria-label={t('board.groupByColumn')}>
          {laneCols.map((c) => <option key={c.uuid} value={c.uuid}>{t('board.lanesBy', { name: c.title })}</option>)}
        </select>
      )}
      <span className="flex-1" />
      <div className="flex rounded-lg overflow-hidden border" role="group" aria-label={t('board.view')} style={{ borderColor: 'var(--border)' }}>
        {[['table', Table2, t('board.viewTable')], ['kanban', Kanban, t('board.viewKanban')]].map(([k, Icon, label]) => (
          <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className="board-tool" data-testid={`view-${k}`} style={{ borderRadius: 0, background: view === k ? 'var(--accent)' : 'transparent', color: view === k ? '#fff' : undefined }}><Icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{label}</span></button>
        ))}
      </div>
      {structure && <button type="button" className="board-tool" onClick={onSettings} data-testid="board-settings"><span className="sr-only">{t('board.settings')}</span>⚙<span className="hidden sm:inline">{t('board.settings')}</span></button>}

      {pop === 'filter' && (
        <Popover anchor={filterBtn.current} onClose={() => setPop(null)} width={310} maxHeight={460}>
          <div className="p-3 space-y-4">
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('board.person')}</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={`board-tool ${filters.people.includes('none') ? 'on' : ''}`} onClick={() => togglePerson('none')}>{t('board.unassigned')}</button>
                {members.map((m) => (
                  <button key={m.uuid} type="button" className={`board-tool ${filters.people.includes(m.uuid) ? 'on' : ''}`} onClick={() => togglePerson(m.uuid)} title={m.name}><Avatar user={m} size={18} /><span className="max-w-[90px] truncate">{m.name.split(' ')[0]}</span></button>
                ))}
              </div>
            </div>
            {statusCols.map((c) => (
              <div key={c.uuid}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{c.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {labelsOf(c).map((l) => { const on = arr(filters.status[c.uuid]).includes(l.id); return (
                    <button key={l.id} type="button" onClick={() => toggleStatus(c.uuid, l.id)} className="board-chip" aria-pressed={on} style={{ background: l.color, color: ink(l.color), outline: on ? '2px solid var(--text-primary)' : 'none', opacity: on || !arr(filters.status[c.uuid]).length ? 1 : 0.55 }}>{l.label}</button>
                  ); })}
                  <button type="button" onClick={() => toggleStatus(c.uuid, 'none')} className="board-chip" aria-pressed={arr(filters.status[c.uuid]).includes('none')} style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', outline: arr(filters.status[c.uuid]).includes('none') ? '2px solid var(--text-primary)' : 'none' }}>{t('board.noStatus')}</button>
                </div>
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}><input type="checkbox" checked={filters.overdue} onChange={(e) => setFilters((f) => ({ ...f, overdue: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} /> {t('board.onlyOverdue')}</label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}><input type="checkbox" checked={filters.hideDone} onChange={(e) => setFilters((f) => ({ ...f, hideDone: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} /> {t('board.hideDone')}</label>
            {activeCount > 0 && <button type="button" className="text-xs underline" style={{ color: 'var(--text-accent)' }} onClick={clear} data-testid="filter-clear">{t('board.clearFilters')}</button>}
          </div>
        </Popover>
      )}
      {pop === 'cols' && (
        <Popover anchor={colsBtn.current} onClose={() => setPop(null)} width={240}>
          <ul className="p-2">
            {columns.map((c) => { const Icon = TYPE_ICON[c.type]; const shown = !hiddenCols.includes(c.uuid); return (
              <li key={c.uuid}><button type="button" className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-[var(--bg-hover)]" onClick={() => toggleHidden(c.uuid)} aria-pressed={shown}>
                <span className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0" style={{ borderColor: 'var(--border-strong)', background: shown ? 'var(--accent)' : 'transparent' }}>{shown && <Check className="w-3 h-3 text-white" />}</span>
                <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /><span className="truncate" style={{ color: 'var(--text-primary)' }}>{c.title}</span></button></li>
            ); })}
          </ul>
        </Popover>
      )}
    </div>
  );
}

/* ── Nova coluna: escolher o tipo ───────────────────────────────────────── */
export function AddColumnMenu({ anchor, onClose, onPick }) {
  const { t } = useTranslation();
  return (
    <Popover anchor={anchor} onClose={onClose} width={290} align="right" maxHeight={420}>
      <p className="px-3 pt-2 pb-1 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('board.chooseColumnType')}</p>
      <ul className="p-1">
        {TYPES.map((ty) => { const Icon = TYPE_ICON[ty]; return (
          <li key={ty}>
            <button type="button" onClick={() => onPick(ty)} data-coltype={ty} className="w-full flex items-start gap-3 px-2 py-2 rounded-md hover:bg-[var(--bg-hover)] text-left">
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-accent)' }} />
              <span><span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t(`board.type.${ty}`)}</span><span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{t(`board.typeDesc.${ty}`)}</span></span>
            </button>
          </li>
        ); })}
      </ul>
    </Popover>
  );
}

/* ── Renomear / configurar coluna ───────────────────────────────────────── */
export function ColumnModal({ cid, bid, col, onClose, onSaved }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(col?.title || '');
  const [unit, setUnit] = useState(col?.config?.unit || '');
  const [decimals, setDecimals] = useState(col?.config?.decimals ?? '');
  const [multiple, setMultiple] = useState(col?.config?.multiple !== false);
  const [type, setType] = useState(col?.type);
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (col) { setTitle(col.title); setUnit(col.config?.unit || ''); setDecimals(col.config?.decimals ?? ''); setMultiple(col.config?.multiple !== false); setType(col.type); setConflict(null); } }, [col]);
  if (!col) return null;
  const save = async (confirm) => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const body = { title: title.trim() };
      if (type !== col.type) { body.type = type; if (confirm) body.confirm = true; } else if (type === 'number') body.config = { unit: unit.trim(), decimals: decimals === '' ? null : Number(decimals) };
      else if (type === 'people') body.config = { multiple };
      await api.boards.updateColumn(cid, bid, col.uuid, body);
      onSaved(); onClose();
    } catch (err) {
      const e = parseApiError(err, t('common.error'));
      if (e.code === 'HAS_VALUES') setConflict(err.response.data.error.details.items); else toast.error(e.message);
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('board.columnSettings')} size="sm">
      <div className="space-y-4">
        <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('board.columnName')}</label>
          <input autoFocus className="input-field" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(!!conflict); }} data-testid="column-name" /></div>
        <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('board.columnType')}</label>
          <select className="input-field" value={type} onChange={(e) => { setType(e.target.value); setConflict(null); }}>{TYPES.map((ty) => <option key={ty} value={ty}>{t(`board.type.${ty}`)}</option>)}</select></div>
        {type === col.type && type === 'number' && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('board.unit')}</label><input className="input-field" value={unit} maxLength={12} placeholder="h, kg, R$…" onChange={(e) => setUnit(e.target.value)} /></div>
            <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('board.decimals')}</label><input className="input-field" type="number" min={0} max={6} value={decimals} onChange={(e) => setDecimals(e.target.value)} /></div>
          </div>
        )}
        {type === col.type && type === 'people' && (
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> {t('board.allowMultiple')}</label>
        )}
        {conflict != null && <p className="text-sm rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', color: 'var(--text-primary)' }}>{t('board.typeChangeWarning', { count: conflict })}</p>}
        <div className="flex gap-3 justify-end"><button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button><button type="button" className="btn-primary" disabled={busy || !title.trim()} onClick={() => save(!!conflict)}>{conflict != null ? t('board.confirmAndSave') : t('common.save')}</button></div>
      </div>
    </Modal>
  );
}

/* ── Configurações do quadro ────────────────────────────────────────────── */
export function BoardSettingsModal({ cid, board, onClose, onSaved, onDeleted }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(board.title); const [desc, setDesc] = useState(board.description || '');
  const [color, setColor] = useState(board.color || '#579bfc'); const [policy, setPolicy] = useState(board.edit_policy);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try { await api.boards.update(cid, board.uuid, { title: title.trim(), description: desc.trim(), color, edit_policy: policy }); toast.success(t('board.saved')); onSaved(); onClose(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(t('board.deleteBoardConfirm', { name: board.title }))) return;
    try { await api.boards.remove(cid, board.uuid); toast.success(t('board.boardDeleted')); onDeleted(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
  };
  return (
    <Modal open onClose={onClose} title={t('board.settings')} size="md">
      <div className="space-y-4">
        <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('board.boardTitle')}</label><input className="input-field" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} data-testid="board-title-input" /></div>
        <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('board.description')}</label><textarea className="input-field" rows={2} value={desc} maxLength={5000} onChange={(e) => setDesc(e.target.value)} /></div>
        <div><label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('board.color')}</label>
          <div className="flex flex-wrap gap-1.5">{PALETTE.map((c) => <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: c, color: ink(c) }}>{c === color && <Check className="w-4 h-4" />}</button>)}</div></div>
        <fieldset>
          <legend className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('board.whoCanEdit')}</legend>
          {['members', 'own', 'staff'].map((p) => (
            <label key={p} className="flex items-start gap-2 p-2 rounded-lg cursor-pointer" style={{ background: policy === p ? 'var(--bg-hover)' : 'transparent' }}>
              <input type="radio" name="policy" checked={policy === p} onChange={() => setPolicy(p)} className="mt-1" style={{ accentColor: 'var(--accent)' }} />
              <span><span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t(`board.policy.${p}`)}</span><span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{t(`board.policyDesc.${p}`)}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-danger flex items-center gap-1.5 text-sm" onClick={remove} data-testid="board-delete"><Trash2 className="w-4 h-4" /> {t('board.deleteBoard')}</button>
          <span className="flex-1" />
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary" disabled={busy || !title.trim()} onClick={save}>{t('common.save')}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Cor do grupo ───────────────────────────────────────────────────────── */
export function GroupColorModal({ group, onClose, onPick }) {
  const { t } = useTranslation();
  return (
    <Modal open onClose={onClose} title={t('board.changeColor')} size="sm">
      <div className="flex flex-wrap gap-2">{PALETTE.map((c) => <button key={c} type="button" aria-label={c} onClick={() => onPick(c)} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: c, color: ink(c) }}>{c === group.color && <Check className="w-4 h-4" />}</button>)}</div>
    </Modal>
  );
}

