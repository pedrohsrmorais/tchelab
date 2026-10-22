import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, GripVertical, Check, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Popover from './Popover';
import { PALETTE, ink, labelsOf } from './boardUtils';
import { api } from '../../api';
import { parseApiError } from '../../utils/errors';

const rid = () => `n${Math.random().toString(36).slice(2, 7)}`;

function ColorDot({ color, onPick, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <>
      <button ref={ref} type="button" aria-label={label} onClick={() => setOpen((o) => !o)} className="w-7 h-7 rounded-md flex-shrink-0 border" style={{ background: color, borderColor: 'var(--border-strong)' }} />
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} width={196}>
          <div className="p-2 grid grid-cols-5 gap-1.5">
            {PALETTE.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => { onPick(c); setOpen(false); }} className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: c, color: ink(c) }}>
                {c === color && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

/**
 * Edita os rótulos de uma coluna de status (nome, cor, "conta como concluído") ou as opções de uma lista.
 * Se algum rótulo removido ainda estiver em uso, a API responde 409 e pedimos para onde mover os itens.
 */
export default function LabelsEditor({ cid, bid, col, onClose, onSaved }) {
  const { t } = useTranslation();
  const isStatus = col?.type === 'status';
  const [rows, setRows] = useState([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(null); // { items, removed:[ids] }
  const [target, setTarget] = useState('');
  const [dragIdx, setDragIdx] = useState(null);

  useEffect(() => { if (col) { setRows(labelsOf(col).map((l) => ({ ...l }))); setTitle(col.title); setConflict(null); setTarget(''); } }, [col]);
  if (!col) return null;

  const upd = (i, patch) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const del = (i) => setRows((r) => r.filter((_, k) => k !== i));
  const add = () => setRows((r) => [...r, { id: rid(), label: '', color: PALETTE[(r.length * 3) % PALETTE.length], ...(isStatus ? { done: false } : {}) }]);
  const move = (from, to) => setRows((r) => { if (from === to || to == null) return r; const c = [...r]; const [x] = c.splice(from, 1); c.splice(to, 0, x); return c; });

  const save = async (confirm = false) => {
    if (rows.some((r) => !r.label.trim())) { toast.error(t('board.labelNameRequired')); return; }
    setBusy(true);
    try {
      const key = isStatus ? 'labels' : 'options';
      const body = { config: { ...col.config, [key]: rows.map((r) => ({ ...r, label: r.label.trim() })) } };
      if (title.trim() && title.trim() !== col.title) body.title = title.trim();
      if (confirm) { body.confirm = true; if (target) body.remap = Object.fromEntries(conflict.removed.map((id) => [id, target])); }
      await api.boards.updateColumn(cid, bid, col.uuid, body);
      toast.success(t('board.saved'));
      onSaved?.(); onClose();
    } catch (err) {
      const e = parseApiError(err, t('common.error'));
      if (e.code === 'LABEL_IN_USE') { setConflict({ items: err.response.data.error.details.items, removed: err.response.data.error.details.removed || [] }); setTarget(''); }
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  const remaining = rows.filter((r) => !conflict?.removed.includes(r.id));

  return (
    <Modal open onClose={onClose} title={isStatus ? t('board.editLabels') : t('board.editOptions')} size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{t('board.columnName')}</label>
          <input className="input-field" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{isStatus ? t('board.labelsHintStatus') : t('board.labelsHintDropdown')}</p>
          <ul className="space-y-2" data-testid="labels-list">
            {rows.map((r, i) => (
              <li key={r.id} className="flex items-center gap-2" draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { move(dragIdx, i); setDragIdx(null); }}>
                <GripVertical className="w-4 h-4 flex-shrink-0 cursor-grab" style={{ color: 'var(--text-muted)' }} aria-hidden />
                <ColorDot color={r.color} onPick={(c) => upd(i, { color: c })} label={t('board.pickColor')} />
                <input className="input-field flex-1 min-w-0" value={r.label} maxLength={40} placeholder={t('board.labelName')} aria-label={t('board.labelName')} onChange={(e) => upd(i, { label: e.target.value })} />
                {isStatus && (
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }} title={t('board.countsAsDoneHint')}>
                    <input type="checkbox" checked={!!r.done} onChange={(e) => upd(i, { done: e.target.checked })} style={{ accentColor: 'var(--accent)' }} /> {t('board.countsAsDone')}
                  </label>
                )}
                <button type="button" className="btn-ghost p-1.5" aria-label={t('board.remove')} onClick={() => del(i)} disabled={isStatus && rows.length <= 1}><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-ghost text-sm mt-2 flex items-center gap-1" onClick={add}><Plus className="w-4 h-4" /> {t('board.addLabel')}</button>
        </div>

        {conflict && (
          <div className="rounded-lg p-3 text-sm space-y-2" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', color: 'var(--text-primary)' }} data-testid="label-conflict">
            <p className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" /> {t('board.labelInUse', { count: conflict.items })}</p>
            <select className="input-field text-sm" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t('board.moveItemsTo')}>
              <option value="">{t('board.clearTheirValue')}</option>
              {remaining.map((r) => <option key={r.id} value={r.id}>{t('board.moveItemsToLabel', { label: r.label })}</option>)}
            </select>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => save(!!conflict)} data-testid="labels-save">{conflict ? t('board.confirmAndSave') : t('common.save')}</button>
        </div>
      </div>
    </Modal>
  );
}
