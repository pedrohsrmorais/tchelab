import React, { useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown, ChevronRight, GripVertical, MessageSquare, Maximize2, MoreHorizontal, ArrowUp, ArrowDown, Plus, Type, Hash, CalendarDays, CalendarRange, CheckSquare, Link2, ListFilter, Users, CircleDot,
} from 'lucide-react';
import { Cell } from './Cells';
import Popover from './Popover';
import { labelsOf, isDoneItem } from './boardUtils';

export const TYPE_ICON = { text: Type, status: CircleDot, people: Users, date: CalendarDays, timeline: CalendarRange, number: Hash, checkbox: CheckSquare, link: Link2, dropdown: ListFilter };

/** Barra de distribuição do status principal (segmentos coloridos). */
export function StatusBar({ items, col }) {
  if (!col || !items.length) return null;
  const counts = new Map();
  items.forEach((i) => { const v = i.cells[col.uuid] || null; counts.set(v, (counts.get(v) || 0) + 1); });
  return (
    <span className="board-progress" style={{ width: 90 }} aria-hidden>
      {[...labelsOf(col).map((l) => [l.id, l.color]), [null, 'transparent']].map(([id, color]) => (counts.get(id) ? <span key={String(id)} style={{ width: `${(counts.get(id) / items.length) * 100}%`, background: color }} /> : null))}
    </span>
  );
}

function MenuItem({ children, onClick, danger, disabled, onClose }) {
  return (
    <button type="button" disabled={disabled} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-40" style={{ color: danger ? 'var(--danger)' : 'var(--text-primary)' }}
      onClick={() => { onClose(); onClick(); }}>{children}</button>
  );
}

function GroupMenu({ anchor, onClose, group, idx, total, onGroup }) {
  const { t } = useTranslation();
  const Item = (props) => <MenuItem {...props} onClose={onClose} />;
  return (
    <Popover anchor={anchor} onClose={onClose} width={210}>
      <div className="py-1">
        <Item onClick={() => onGroup('rename', group)}>{t('board.renameGroup')}</Item>
        <Item onClick={() => onGroup('color', group)}>{t('board.changeColor')}</Item>
        <Item disabled={idx === 0} onClick={() => onGroup('up', group)}>{t('board.moveUp')}</Item>
        <Item disabled={idx === total - 1} onClick={() => onGroup('down', group)}>{t('board.moveDown')}</Item>
        <Item danger disabled={total <= 1} onClick={() => onGroup('delete', group)}>{t('board.deleteGroup')}</Item>
      </div>
    </Popover>
  );
}

export default function BoardTable({
  groups, columns, items, allItems, ctx, prefs, selected, sort, canDrag, statusCol,
  onToggleCollapse, onOpen, onAdd, onMove, onSelect, onSelectMany, onSort, onColumn, onGroup, onResize, onAddColumn, onAddGroup, onReorderColumns,
}) {
  const { t } = useTranslation();
  const nameW = prefs.nameW || 340;
  const widths = columns.map((c) => prefs.widths?.[c.uuid] || c.width || 150);
  const template = `${nameW}px ${widths.map((w) => `${w}px`).join(' ')} 52px`;
  const totalW = nameW + widths.reduce((a, b) => a + b, 0) + 52;
  const [drag, setDrag] = useState(null);       // uuid do item arrastado
  const [over, setOver] = useState(null);       // { uuid, pos } | { group }
  const [colDrag, setColDrag] = useState(null); const [colOver, setColOver] = useState(null);
  const [menu, setMenu] = useState(null);       // { el, kind:'col'|'group', ... }
  const [newTitle, setNewTitle] = useState({});
  const [renaming, setRenaming] = useState(null); // group uuid
  const resize = useRef(null);
  const staff = ctx.structure;
  const byGroup = useMemo(() => {
    const m = new Map(groups.map((g) => [g.uuid, []]));
    items.forEach((i) => m.get(i.group)?.push(i));
    return m;
  }, [groups, items]);

  const rowOver = (e, item) => {
    if (!drag) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setOver({ uuid: item.uuid, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' });
  };
  const drop = (groupUuid, list) => {
    if (!drag || !over) { setDrag(null); setOver(null); return; }
    let before = null;
    if (over.uuid) {
      const idx = list.findIndex((i) => i.uuid === over.uuid);
      before = over.pos === 'before' ? over.uuid : (list[idx + 1]?.uuid || null);
    }
    if (before !== drag) onMove(drag, groupUuid, before);
    setDrag(null); setOver(null);
  };

  const startResize = (e, col, w) => {
    e.preventDefault(); e.stopPropagation();
    resize.current = { col, x: e.clientX, w };
    const mv = (ev) => { const nw = Math.max(70, Math.min(700, resize.current.w + ev.clientX - resize.current.x)); onResize(col, nw, false); };
    const up = (ev) => { const nw = Math.max(70, Math.min(700, resize.current.w + ev.clientX - resize.current.x)); onResize(col, nw, true); resize.current = null; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };

  const allVisibleSelected = items.length > 0 && items.every((i) => selected.has(i.uuid));

  return (
    <div className="board-scroll" data-testid="board-table" role="table" aria-label={t('board.table')}>
      <div style={{ width: totalW, minWidth: '100%' }}>
        {/* cabeçalho */}
        <div className="board-row board-head" style={{ gridTemplateColumns: template }} role="row">
          <div className="board-cell board-sticky" style={{ borderLeft: 0 }} role="columnheader">
            <input type="checkbox" checked={allVisibleSelected} onChange={(e) => onSelectMany(items.map((i) => i.uuid), e.target.checked)} aria-label={t('board.selectAll')} style={{ accentColor: 'var(--accent)' }} className="mr-2" />
            <button type="button" className="flex items-center gap-1 flex-1 text-left font-semibold" onClick={() => onSort('title')}>
              {t('board.item')} {sort.col === 'title' && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
            </button>
            <span className="board-resize" onMouseDown={(e) => startResize(e, '__name', nameW)} role="separator" aria-orientation="vertical" />
          </div>
          {columns.map((c, i) => {
            const Icon = TYPE_ICON[c.type] || Type;
            return (
              <div key={c.uuid} className={`board-cell ${colOver === c.uuid && colDrag !== c.uuid ? 'col-over' : ''}`} role="columnheader" data-col={c.title}
                draggable={staff} onDragStart={() => setColDrag(c.uuid)} onDragEnd={() => { setColDrag(null); setColOver(null); }}
                onDragOver={(e) => { if (colDrag) { e.preventDefault(); setColOver(c.uuid); } }}
                onDrop={() => { if (colDrag && colDrag !== c.uuid) onReorderColumns(colDrag, c.uuid); setColDrag(null); setColOver(null); }}>
                <button type="button" className="flex items-center gap-1.5 min-w-0 flex-1 text-left" onClick={() => onSort(c.uuid)} title={c.title}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <span className="truncate">{c.title}</span>
                  {sort.col === c.uuid && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3 flex-shrink-0" /> : <ArrowDown className="w-3 h-3 flex-shrink-0" />)}
                </button>
                <button type="button" className="p-1 rounded hover:bg-[var(--bg-hover)]" aria-label={t('board.columnMenu', { name: c.title })} data-testid="col-menu"
                  onClick={(e) => setMenu({ el: e.currentTarget, kind: 'col', col: c, idx: i })}><MoreHorizontal className="w-3.5 h-3.5" /></button>
                {staff && <span className="board-resize" onMouseDown={(e) => startResize(e, c.uuid, widths[i])} role="separator" aria-orientation="vertical" />}
              </div>
            );
          })}
          <div className="board-cell no-pad justify-center" role="columnheader">
            {staff && <button type="button" className="p-1.5 rounded hover:bg-[var(--bg-hover)]" aria-label={t('board.addColumn')} data-testid="add-column" onClick={(e) => onAddColumn(e.currentTarget)}><Plus className="w-4 h-4" /></button>}
          </div>
        </div>

        {/* grupos */}
        {groups.map((g, gi) => {
          const list = byGroup.get(g.uuid) || [];
          const total = (allItems.filter((i) => i.group === g.uuid)).length;
          const collapsed = !!prefs.collapsed?.[g.uuid];
          return (
            <section key={g.uuid} data-group={g.title} aria-label={g.title}
              onDragOver={(e) => { if (drag && !e.target.closest?.('.board-row')) { e.preventDefault(); setOver({ group: g.uuid }); } }}
              onDrop={(e) => { if (drag && !e.target.closest?.('.board-row')) { e.preventDefault(); drop(g.uuid, list); } }}>
              <div className="board-group-head" style={{ width: '100%' }}>
                <span className="board-group-bar" style={{ background: g.color }} />
                <span className="flex items-center gap-2 min-w-0" style={{ position: 'sticky', left: 8 }}>
                  <button type="button" className="p-0.5 rounded" onClick={() => onToggleCollapse(g.uuid)} aria-label={collapsed ? t('board.expand') : t('board.collapse')} aria-expanded={!collapsed}>
                    {collapsed ? <ChevronRight className="w-4 h-4 board-gc" style={{ '--gc': g.color }} /> : <ChevronDown className="w-4 h-4 board-gc" style={{ '--gc': g.color }} />}
                  </button>
                  {renaming === g.uuid ? (
                    <input autoFocus className="board-input" style={{ width: 220 }} defaultValue={g.title} maxLength={150} aria-label={t('board.groupName')}
                      onBlur={(e) => { setRenaming(null); if (e.target.value.trim() && e.target.value.trim() !== g.title) onGroup('save', g, e.target.value.trim()); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
                  ) : (
                    <button type="button" className="truncate text-left board-gc" style={{ '--gc': g.color, fontSize: '0.95rem' }} onDoubleClick={() => staff && setRenaming(g.uuid)} title={staff ? t('board.doubleClickRename') : g.title}>{g.title}</button>
                  )}
                  <span className="text-xs font-normal whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{t('board.itemsCount', { count: list.length === total ? total : `${list.length}/${total}` })}</span>
                  <StatusBar items={allItems.filter((i) => i.group === g.uuid)} col={statusCol} />
                  {staff && <button type="button" className="p-1 rounded hover:bg-[var(--bg-hover)]" aria-label={t('board.groupMenu', { name: g.title })} data-testid="group-menu" onClick={(e) => setMenu({ el: e.currentTarget, kind: 'group', group: g, idx: gi })}><MoreHorizontal className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /></button>}
                </span>
              </div>

              {!collapsed && (
                <>
                  {list.map((it) => {
                    const sel = selected.has(it.uuid);
                    const dragOk = canDrag && it.access === 'all';
                    return (
                      <div key={it.uuid} role="row" data-item={it.title} data-seq={it.seq}
                        className={`board-row ${sel ? 'is-selected' : ''} ${drag === it.uuid ? 'is-dragging' : ''} ${over?.uuid === it.uuid ? (over.pos === 'before' ? 'drop-before' : 'drop-after') : ''}`}
                        style={{ gridTemplateColumns: template }} onDragOver={(e) => rowOver(e, it)} onDrop={(e) => { e.preventDefault(); drop(g.uuid, list); }}>
                        <div className="board-cell board-sticky" style={{ borderLeft: 0, gap: 2 }}>
                          <span draggable={dragOk} onDragStart={(e) => { setDrag(it.uuid); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.uuid); const row = e.currentTarget.closest('.board-row'); if (row) e.dataTransfer.setDragImage(row, 10, 10); }}
                            onDragEnd={() => { setDrag(null); setOver(null); }}
                            className="board-hover-show flex-shrink-0 cursor-grab p-0.5" style={{ opacity: dragOk ? undefined : 0, pointerEvents: dragOk ? 'auto' : 'none' }} aria-hidden title={t('board.dragToMove')}>
                            <GripVertical className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                          </span>
                          <input type="checkbox" checked={sel} onChange={(e) => onSelect(it.uuid, e.target.checked)} aria-label={t('board.select', { name: it.title })} style={{ accentColor: 'var(--accent)' }} className="mr-1.5 flex-shrink-0" />
                          <button type="button" className="board-cell-btn truncate flex-1 text-left py-1.5" onClick={() => onOpen(it)} title={it.title}
                            style={{ color: 'var(--text-primary)', textDecoration: isDoneItem(columns, it) ? 'line-through' : 'none', opacity: isDoneItem(columns, it) ? 0.65 : 1 }} data-testid="item-title-btn">
                            {it.title}
                          </button>
                          <button type="button" className="flex items-center gap-1 text-xs flex-shrink-0 p-1 rounded hover:bg-[var(--bg-hover)]" onClick={() => onOpen(it, 'updates')} aria-label={t('board.openItem')} style={{ color: it.comments ? 'var(--text-accent)' : 'var(--text-muted)' }}>
                            {it.comments > 0 ? <><MessageSquare className="w-3.5 h-3.5" />{it.comments}</> : <Maximize2 className="w-3.5 h-3.5 board-hover-show" />}
                          </button>
                        </div>
                        {columns.map((c) => (
                          <div key={c.uuid} className={`board-cell ${['status', 'checkbox'].includes(c.type) ? 'no-pad' : ''}`} role="cell" style={c.type === 'status' ? { padding: '0 4px' } : undefined}>
                            <Cell col={c} item={it} ctx={ctx} />
                          </div>
                        ))}
                        <div className="board-cell" aria-hidden />
                      </div>
                    );
                  })}
                  {ctx.canCreate && (
                    <div className={`board-row board-add-row ${over?.group === g.uuid ? 'drop-before' : ''}`} style={{ gridTemplateColumns: template, opacity: 0.95 }}>
                      <div className="board-cell board-sticky" style={{ borderLeft: 0 }}>
                        <Plus className="w-3.5 h-3.5 flex-shrink-0 mr-1.5" style={{ color: 'var(--text-muted)' }} />
                        <input value={newTitle[g.uuid] || ''} placeholder={t('board.addItem')} aria-label={t('board.addItemTo', { group: g.title })} maxLength={300} data-testid="add-item-input"
                          onChange={(e) => setNewTitle((s) => ({ ...s, [g.uuid]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (newTitle[g.uuid] || '').trim()) { onAdd(g.uuid, newTitle[g.uuid].trim()); setNewTitle((s) => ({ ...s, [g.uuid]: '' })); } }} />
                      </div>
                      <div style={{ gridColumn: '2 / -1' }} className="board-cell" />
                    </div>
                  )}
                  {list.length === 0 && !ctx.canCreate && <div className="px-6 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{t('board.groupEmpty')}</div>}
                </>
              )}
            </section>
          );
        })}

        {staff && (
          <div className="board-row board-add-row" style={{ gridTemplateColumns: '1fr', borderBottom: 0 }}>
            <div className="board-cell board-sticky" style={{ borderLeft: 0 }}>
              <button type="button" className="board-tool" onClick={onAddGroup} data-testid="add-group"><Plus className="w-3.5 h-3.5" /> {t('board.addGroup')}</button>
            </div>
          </div>
        )}
      </div>

      {menu?.kind === 'col' && (
        <Popover anchor={menu.el} onClose={() => setMenu(null)} width={220}>
          <div className="py-1">
            {[
              [t('board.sortAsc'), () => onSort(menu.col.uuid, 'asc')],
              [t('board.sortDesc'), () => onSort(menu.col.uuid, 'desc')],
              staff && [t('board.renameColumn'), () => onColumn('edit', menu.col)],
              staff && ['status', 'dropdown'].includes(menu.col.type) && [menu.col.type === 'status' ? t('board.editLabels') : t('board.editOptions'), () => onColumn('labels', menu.col)],
              [t('board.hideForMe'), () => onColumn('hide', menu.col)],
              staff && menu.idx > 0 && [t('board.moveLeft'), () => onColumn('left', menu.col)],
              staff && menu.idx < columns.length - 1 && [t('board.moveRight'), () => onColumn('right', menu.col)],
              staff && [t('board.deleteColumn'), () => onColumn('delete', menu.col), true],
            ].filter(Boolean).map(([label, fn, danger]) => (
              <button key={label} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-hover)]" style={{ color: danger ? 'var(--danger)' : 'var(--text-primary)' }} onClick={() => { setMenu(null); fn(); }}>{label}</button>
            ))}
          </div>
        </Popover>
      )}
      {menu?.kind === 'group' && (
        <GroupMenu anchor={menu.el} group={menu.group} idx={menu.idx} total={groups.length} onClose={() => setMenu(null)}
          onGroup={(a, g) => { if (a === 'rename') setRenaming(g.uuid); else onGroup(a, g); }} />
      )}
    </div>
  );
}
