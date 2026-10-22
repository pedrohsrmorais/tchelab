import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SquareKanban, Trash2, X, Users, Lock, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '../hooks/useApi';
import { useAuthStore } from '../store/auth';
import { api } from '../api';
import { parseApiError } from '../utils/errors';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';
import AppCrumbs from '../components/apps/AppsNav';
import BoardTable from '../components/board/BoardTable';
import BoardKanban from '../components/board/BoardKanban';
import ItemPanel from '../components/board/ItemPanel';
import LabelsEditor from '../components/board/LabelsEditor';
import { Toolbar, AddColumnMenu, ColumnModal, BoardSettingsModal, GroupColorModal } from '../components/board/BoardParts';
import { applyFilters, canEditCell, isOverdue, isDoneItem, loadPrefs, savePrefs, arr } from '../components/board/boardUtils';
import { StatusBar } from '../components/board/BoardTable';
import '../components/board/board.css';

const EMPTY_FILTERS = { q: '', people: [], status: {}, overdue: false, hideDone: false };
const POLL_MS = 10000;

/** Aplica o valor de uma célula ao objeto `cells` (null/[]/false limpa a chave). */
function withCell(cells, uuid, value) {
  const next = { ...cells };
  if (value === null || value === undefined || (Array.isArray(value) && !value.length)) delete next[uuid]; else next[uuid] = value;
  return next;
}

export default function BoardPage() {
  const { id: cid, bid } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const me = useAuthStore((s) => s.user);
  const { data: community } = useApi(() => api.communities.get(cid), [cid]);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const revRef = useRef(null);
  const busy = useRef(0);
  const [prefs, setPrefsState] = useState(() => loadPrefs(bid));
  const setPrefs = useCallback((fn) => setPrefsState((p) => { const n = typeof fn === 'function' ? fn(p) : fn; savePrefs(bid, n); return n; }), [bid]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ col: null, dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [openId, setOpenId] = useState(sp.get('item'));
  const [focusTitle, setFocusTitle] = useState(false);
  const [addCol, setAddCol] = useState(null);
  const [colModal, setColModal] = useState(null);
  const [labelsCol, setLabelsCol] = useState(null);
  const [settings, setSettings] = useState(false);
  const [groupColor, setGroupColor] = useState(null);

  const load = useCallback(async (force = false) => {
    try {
      const r = await api.boards.get(cid, bid, force ? undefined : revRef.current || undefined);
      const d = r.data.data;
      if (d.unchanged) return;
      revRef.current = d.board.rev; setData(d); setError(null);
    } catch (e) { if (!revRef.current) setError(e); }
  }, [cid, bid]);

  useEffect(() => { revRef.current = null; setData(null); setPrefsState(loadPrefs(bid)); load(true); }, [bid, load]);
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden && busy.current === 0) load(); }, POLL_MS);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); };
  }, [load]);

  const track = async (fn) => { busy.current += 1; try { return await fn(); } finally { busy.current -= 1; } };
  const fail = (err) => toast.error(parseApiError(err, t('common.error')).message);
  const patchItem = (uuid, fn) => setData((d) => (d ? { ...d, items: d.items.map((i) => (i.uuid === uuid ? fn(i) : i)) } : d));

  const board = data?.board;
  const columns = data?.columns || [];
  const members = data?.members || [];
  const structure = !!data?.permissions.structure;
  const canCreate = !!data?.permissions.create;
  const hidden = prefs.hidden || [];
  const visibleCols = columns.filter((c) => !hidden.includes(c.uuid));
  const statusCol = columns.find((c) => c.type === 'status');
  const dueCol = columns.find((c) => c.type === 'date' || c.type === 'timeline');
  const laneCols = columns.filter((c) => c.type === 'status');
  const laneCol = laneCols.find((c) => c.uuid === prefs.laneCol) || laneCols[0];
  const view = prefs.view || 'table';

  const rawItems = data?.items;
  const items = useMemo(() => [...(rawItems || [])].sort((a, b) => a.position - b.position), [rawItems]);
  const shown = useMemo(() => applyFilters(items, columns, members, filters, sort), [items, columns, members, filters, sort]);
  const activeFilters = filters.people.length + Object.values(filters.status).reduce((n, a) => n + arr(a).length, 0) + (filters.overdue ? 1 : 0) + (filters.hideDone ? 1 : 0);
  const done = items.filter((i) => isDoneItem(columns, i)).length;
  const overdue = items.filter((i) => isOverdue(columns, i)).length;

  /* ── ações sobre células/itens ─────────────────────────────────────────── */
  const onSet = useCallback(async (item, col, value) => {
    const prev = item.cells[col.uuid];
    patchItem(item.uuid, (i) => ({ ...i, cells: withCell(i.cells, col.uuid, value) }));
    try {
      const r = await track(() => api.boards.setCell(cid, bid, item.uuid, col.uuid, value));
      patchItem(item.uuid, () => r.data.data);
    } catch (err) {
      patchItem(item.uuid, (i) => ({ ...i, cells: withCell(i.cells, col.uuid, prev) }));
      fail(err);
    }
  }, [cid, bid]); // eslint-disable-line react-hooks/exhaustive-deps

  const createItem = async (title, groupUuid, extra = {}) => {
    try {
      const r = await track(() => api.boards.createItem(cid, bid, { title, group: groupUuid || data.groups[0].uuid, ...extra }));
      setData((d) => ({ ...d, items: [...d.items, r.data.data] }));
      return r.data.data;
    } catch (err) { fail(err); return null; }
  };
  const newItem = async () => {
    const it = await createItem(t('board.newItemTitle'), null, { top: true });
    if (it) { setFocusTitle(true); setOpenId(it.uuid); }
  };
  const renameItem = async (item, title) => {
    patchItem(item.uuid, (i) => ({ ...i, title }));
    try { await track(() => api.boards.updateItem(cid, bid, item.uuid, { title })); } catch (err) { patchItem(item.uuid, (i) => ({ ...i, title: item.title })); fail(err); }
  };
  const moveItem = async (uuid, group, before) => {
    const sibs = items.filter((i) => i.group === group && i.uuid !== uuid).sort((a, b) => a.position - b.position);
    let pos;
    const idx = before ? sibs.findIndex((s) => s.uuid === before) : -1;
    if (idx >= 0) { const hi = sibs[idx].position; const lo = idx > 0 ? sibs[idx - 1].position : hi - 2048; pos = (lo + hi) / 2; } else pos = sibs.length ? sibs[sibs.length - 1].position + 1024 : 1024;
    const prev = items.find((i) => i.uuid === uuid);
    patchItem(uuid, (i) => ({ ...i, group, position: pos }));
    try { await track(() => api.boards.moveItem(cid, bid, uuid, { group, before })); } catch (err) { patchItem(uuid, () => prev); fail(err); }
  };
  const duplicate = async (item) => {
    try { await track(() => api.boards.duplicateItem(cid, bid, item.uuid)); toast.success(t('board.duplicated')); await load(true); } catch (err) { fail(err); }
  };
  const removeItem = async (item) => {
    if (!window.confirm(t('board.deleteItemConfirm', { name: item.title }))) return;
    try { await track(() => api.boards.removeItem(cid, bid, item.uuid)); setOpenId(null); setData((d) => ({ ...d, items: d.items.filter((i) => i.uuid !== item.uuid) })); toast.success(t('board.itemDeleted')); } catch (err) { fail(err); }
  };

  /* ── seleção em lote ───────────────────────────────────────────────────── */
  const bulk = async (action, group) => {
    const ids = [...selected];
    if (action === 'delete' && !window.confirm(t('board.deleteManyConfirm', { count: ids.length }))) return;
    try {
      const r = await track(() => api.boards.bulkItems(cid, bid, { items: ids, action, group }));
      if (r.data.data.denied.length) toast(t('board.someDenied', { count: r.data.data.denied.length }));
      setSelected(new Set()); await load(true);
    } catch (err) { fail(err); }
  };

  /* ── grupos ────────────────────────────────────────────────────────────── */
  const onGroup = async (action, g, value) => {
    try {
      if (action === 'save') { await track(() => api.boards.updateGroup(cid, bid, g.uuid, { title: value })); await load(true); }
      else if (action === 'color') setGroupColor(g);
      else if (action === 'up' || action === 'down') {
        const order = data.groups.map((x) => x.uuid); const i = order.indexOf(g.uuid); const j = action === 'up' ? i - 1 : i + 1;
        [order[i], order[j]] = [order[j], order[i]];
        await track(() => api.boards.reorderGroups(cid, bid, order)); await load(true);
      } else if (action === 'delete') {
        try { await api.boards.removeGroup(cid, bid, g.uuid, false); } catch (err) {
          if (parseApiError(err).code === 'HAS_ITEMS') {
            if (!window.confirm(t('board.deleteGroupConfirm', { name: g.title, count: err.response.data.error.details.items }))) return;
            await api.boards.removeGroup(cid, bid, g.uuid, true);
          } else throw err;
        }
        toast.success(t('board.groupDeleted')); await load(true);
      }
    } catch (err) { fail(err); }
  };
  const addGroup = async () => {
    try { const r = await track(() => api.boards.createGroup(cid, bid, { title: t('board.newGroup') })); await load(true); void r; } catch (err) { fail(err); }
  };

  /* ── colunas ───────────────────────────────────────────────────────────── */
  const onColumn = async (action, col) => {
    try {
      if (action === 'edit') setColModal(col);
      else if (action === 'labels') setLabelsCol(col);
      else if (action === 'hide') setPrefs((p) => ({ ...p, hidden: [...arr(p.hidden), col.uuid] }));
      else if (action === 'left' || action === 'right') {
        const order = columns.map((c) => c.uuid); const i = order.indexOf(col.uuid); const j = action === 'left' ? i - 1 : i + 1;
        [order[i], order[j]] = [order[j], order[i]];
        await track(() => api.boards.reorderColumns(cid, bid, order)); await load(true);
      } else if (action === 'delete') {
        try { await api.boards.removeColumn(cid, bid, col.uuid, false); } catch (err) {
          if (parseApiError(err).code === 'HAS_VALUES') {
            if (!window.confirm(t('board.deleteColumnConfirm', { name: col.title, count: err.response.data.error.details.items }))) return;
            await api.boards.removeColumn(cid, bid, col.uuid, true);
          } else throw err;
        }
        toast.success(t('board.columnDeleted')); await load(true);
      }
    } catch (err) { fail(err); }
  };
  const pickColumnType = async (type) => {
    setAddCol(null);
    try {
      const r = await track(() => api.boards.createColumn(cid, bid, { title: t(`board.type.${type}`), type, lang: (document.documentElement.lang || 'pt').slice(0, 2) }));
      await load(true); setColModal(r.data.data);
    } catch (err) { fail(err); }
  };
  const reorderColumns = async (from, to) => {
    const order = columns.map((c) => c.uuid); const a = order.indexOf(from); const b = order.indexOf(to);
    order.splice(a, 1); order.splice(b, 0, from);
    try { await track(() => api.boards.reorderColumns(cid, bid, order)); await load(true); } catch (err) { fail(err); }
  };
  const onResize = (col, w, commit) => {
    if (col === '__name') { setPrefs((p) => ({ ...p, nameW: Math.max(200, Math.min(700, w)) })); return; }
    setPrefs((p) => ({ ...p, widths: { ...(p.widths || {}), [col]: w } }));
    if (commit && structure) api.boards.updateColumn(cid, bid, col, { width: w }).catch(() => {});
  };

  const onSort = (col, dir) => setSort((s) => {
    if (dir) return { col, dir };
    if (s.col !== col) return { col, dir: 'asc' };
    return s.dir === 'asc' ? { col, dir: 'desc' } : { col: null, dir: 'asc' };
  });

  /* ── abrir item (painel) ───────────────────────────────────────────────── */
  const open = (it) => { setFocusTitle(false); setOpenId(it.uuid); setSp((p) => { p.set('item', it.uuid); return p; }, { replace: true }); };
  const close = () => { setOpenId(null); setFocusTitle(false); setSp((p) => { p.delete('item'); return p; }, { replace: true }); };
  const openItem = items.find((i) => i.uuid === openId);
  useEffect(() => { if (data && openId && !openItem) setOpenId(null); }, [data, openId, openItem]);

  const ctx = useMemo(() => ({
    members, structure, canCreate, dueCol, refresh: () => load(true),
    editable: (item, col) => canEditCell(item, col),
    onSet, onEditLabels: setLabelsCol,
    overdue: (item) => isOverdue(columns, item),
  }), [members, structure, canCreate, dueCol, columns, onSet, load]);

  if (error && !data) return <EmptyState icon={SquareKanban} title={t('board.notFound')} action={<Link to={`/communities/${cid}?tab=apps&app=boards`} className="btn-primary">{t('board.backToBoards')}</Link>} />;
  if (!data) return <div className="space-y-4"><SkeletonCard className="h-16" /><SkeletonCard className="h-96" /></div>;

  const policyIcon = { members: Users, own: UserCheck, staff: Lock }[board.edit_policy];
  const PolicyIcon = policyIcon;

  return (
    <div className="space-y-4" data-testid="board-page">
      <AppCrumbs cid={cid} community={community} app="boards" trail={[{ label: board.title }]} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="w-3.5 h-3.5 rounded-md flex-shrink-0" style={{ background: board.color || 'var(--accent)' }} aria-hidden />
            <h1 className="text-2xl font-bold truncate" style={{ color: 'var(--text-primary)' }} data-testid="board-title">{board.title}</h1>
            <span className="badge badge-blue inline-flex items-center gap-1" title={t(`board.policyDesc.${board.edit_policy}`)}><PolicyIcon className="w-3 h-3" /> {t(`board.policyShort.${board.edit_policy}`)}</span>
          </div>
          {board.description && <p className="text-sm mt-1 max-w-3xl" style={{ color: 'var(--text-muted)' }}>{board.description}</p>}
        </div>
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }} data-testid="board-summary">
          <span>{t('board.itemsCount', { count: items.length })}</span>
          {statusCol && <><span className="flex items-center gap-2">{t('board.doneCount', { done, total: items.length })}<StatusBar items={items} col={statusCol} /></span></>}
          {overdue > 0 && <span className="badge badge-red">{t('board.overdueCount', { count: overdue })}</span>}
        </div>
      </header>

      <Toolbar columns={columns} members={members} me={me} filters={filters} setFilters={setFilters} view={view} setView={(v) => setPrefs((p) => ({ ...p, view: v }))}
        hiddenCols={hidden} toggleHidden={(u) => setPrefs((p) => ({ ...p, hidden: arr(p.hidden).includes(u) ? arr(p.hidden).filter((x) => x !== u) : [...arr(p.hidden), u] }))}
        activeCount={activeFilters} canCreate={canCreate} onNew={newItem} onSettings={() => setSettings(true)} structure={structure}
        laneCols={laneCols} laneCol={laneCol} setLaneCol={(u) => setPrefs((p) => ({ ...p, laneCol: u }))} />

      {view === 'table' ? (
        <BoardTable groups={data.groups} columns={visibleCols} items={shown} allItems={items} ctx={ctx} prefs={prefs} selected={selected} sort={sort}
          canDrag={!sort.col} statusCol={statusCol}
          onToggleCollapse={(u) => setPrefs((p) => ({ ...p, collapsed: { ...(p.collapsed || {}), [u]: !p.collapsed?.[u] } }))}
          onOpen={open} onAdd={(g, title) => createItem(title, g)} onMove={moveItem}
          onSelect={(u, on) => setSelected((s) => { const n = new Set(s); if (on) n.add(u); else n.delete(u); return n; })}
          onSelectMany={(us, on) => setSelected((s) => { const n = new Set(s); us.forEach((u) => (on ? n.add(u) : n.delete(u))); return n; })}
          onSort={onSort} onColumn={onColumn} onGroup={onGroup} onResize={onResize} onAddColumn={setAddCol} onAddGroup={addGroup} onReorderColumns={reorderColumns} />
      ) : (
        <BoardKanban columns={columns} items={shown} members={members} ctx={ctx} laneCol={laneCol} onOpen={open}
          onAdd={(title, lane) => createItem(title, null, lane ? { cells: { [laneCol.uuid]: lane } } : {})} />
      )}

      {selected.size > 0 && (
        <div className="board-bulk" role="region" aria-label={t('board.bulkActions')} data-testid="bulk-bar">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('board.selectedCount', { count: selected.size })}</span>
          <select className="input-field text-sm" style={{ width: 'auto', paddingTop: 4, paddingBottom: 4 }} value="" onChange={(e) => e.target.value && bulk('move', e.target.value)} aria-label={t('board.moveTo')}>
            <option value="">{t('board.moveTo')}…</option>
            {data.groups.map((g) => <option key={g.uuid} value={g.uuid}>{g.title}</option>)}
          </select>
          <button type="button" className="btn-danger text-sm flex items-center gap-1.5" onClick={() => bulk('delete')} data-testid="bulk-delete"><Trash2 className="w-3.5 h-3.5" /> {t('board.delete')}</button>
          <button type="button" className="btn-ghost p-1.5" onClick={() => setSelected(new Set())} aria-label={t('board.clearSelection')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {openItem && (
        <ItemPanel cid={cid} bid={bid} item={openItem} board={{ groups: data.groups, columns }} ctx={ctx} rev={board.rev} autoFocusTitle={focusTitle}
          onClose={close} onRename={renameItem} onMoveGroup={(it, g) => moveItem(it.uuid, g, null)} onDuplicate={duplicate} onDelete={removeItem} />
      )}

      {addCol && <AddColumnMenu anchor={addCol} onClose={() => setAddCol(null)} onPick={pickColumnType} />}
      {colModal && <ColumnModal cid={cid} bid={bid} col={colModal} onClose={() => setColModal(null)} onSaved={() => load(true)} />}
      {labelsCol && <LabelsEditor cid={cid} bid={bid} col={columns.find((c) => c.uuid === labelsCol.uuid) || labelsCol} onClose={() => setLabelsCol(null)} onSaved={() => load(true)} />}
      {settings && <BoardSettingsModal cid={cid} board={board} onClose={() => setSettings(false)} onSaved={() => load(true)} onDeleted={() => navigate(`/communities/${cid}?tab=apps&app=boards`)} />}
      {groupColor && <GroupColorModal group={groupColor} onClose={() => setGroupColor(null)} onPick={async (c) => { const g = groupColor; setGroupColor(null); try { await api.boards.updateGroup(cid, bid, g.uuid, { color: c }); await load(true); } catch (err) { fail(err); } }} />}
    </div>
  );
}
