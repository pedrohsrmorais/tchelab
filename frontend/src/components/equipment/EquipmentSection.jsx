import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Plus, ChevronRight, ImageOff, Radio, MapPin, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { parseApiError } from '../../utils/errors';
import { fmtRange } from '../../utils/tz';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';

const muted = { color: 'var(--text-muted)' };
const lbl = { color: 'var(--text-secondary)' };
const arr = (x) => (Array.isArray(x) ? x : []);

function Thumb({ cid, eq }) {
  const [url, setUrl] = useState(null);
  React.useEffect(() => {
    let off = false; let obj = null; setUrl(null);
    if (eq.has_image) api.equipment.imageBlob(cid, eq.uuid).then(r => { if (!off) { obj = URL.createObjectURL(r.data); setUrl(obj); } }).catch(() => {});
    return () => { off = true; if (obj) URL.revokeObjectURL(obj); };
  }, [cid, eq.uuid, eq.has_image, eq.image_version]);
  return (
    <span className="w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-hover)' }}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <ImageOff className="w-5 h-5" style={muted} />}
    </span>
  );
}

/** Seção "Equipamentos" da aba Apps: lista, "em uso agora" e minhas reservas. */
export default function EquipmentSection({ id, canEdit, onAdd, refreshKey }) {
  const { t } = useTranslation();
  const { data } = useApi(() => api.equipment.list(id), [id, refreshKey]);
  const { data: mine } = useApi(() => api.equipment.mine(id), [id, refreshKey]);
  const list = arr(data);
  return (
    <section className="space-y-3" data-testid="equipment-section">
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={muted}>{t('equipment.appTitle')}</h2>
      {arr(mine).length > 0 && (
        <div className="card p-4" data-testid="my-bookings">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{t('equipment.myBookings')}</h3>
          <ul className="space-y-1.5">
            {arr(mine).slice(0, 5).map(b => (
              <li key={b.uuid} className="text-sm flex flex-wrap gap-x-3" style={lbl}>
                <Link to={`/communities/${id}/equipment/${b.equipment.uuid}`} className="font-medium underline" style={{ color: 'var(--text-primary)' }}>{b.equipment.name}</Link>
                <span>{fmtRange(b.start, b.end, Intl.DateTimeFormat().resolvedOptions().timeZone)}</span>
                {b.status === 'pending' && <span className="badge badge-amber">{t('equipment.bookingStatus.pending')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t('equipment.noneTitle')} description={canEdit ? t('equipment.noneDescEdit') : t('equipment.noneDesc')}
          action={canEdit ? <button className="btn-primary text-sm flex items-center gap-1.5" onClick={onAdd}><Plus className="w-3.5 h-3.5" /> {t('equipment.new')}</button> : undefined} />
      ) : (
        <ul className="space-y-2">
          {list.map(e => (
            <li key={e.uuid}>
              <Link to={`/communities/${id}/equipment/${e.uuid}`} className="card p-3 flex items-center gap-3 hover:opacity-90" data-testid="equipment-row">
                <Thumb cid={id} eq={e} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{e.name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" style={muted}>
                    {e.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location}</span>}
                    {e.in_use_now && <span className="flex items-center gap-1 text-green-400"><Radio className="w-3 h-3" />{t('equipment.inUseShort', { name: e.in_use_now.name })}</span>}
                  </span>
                </span>
                {e.access === 'public' && <Globe className="w-4 h-4" style={muted} aria-label={t('equipment.publicBadge')} />}
                {e.status !== 'active' && <span className="badge badge-amber">{t(`equipment.status.${e.status}`)}</span>}
                {canEdit && e.pending_count > 0 && <span className="badge badge-amber" title={t('equipment.view.pending')}>{e.pending_count}</span>}
                <ChevronRight className="w-4 h-4" style={muted} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EquipmentCreateModal({ open, onClose, id }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', location: '' });
  const [saving, setSaving] = useState(false);
  React.useEffect(() => { if (open) setF({ name: '', location: '' }); }, [open]);
  const submit = async (e) => {
    e.preventDefault(); if (!f.name.trim()) return; setSaving(true);
    try {
      const r = await api.equipment.create(id, { name: f.name.trim(), location: f.location.trim() || undefined });
      const eq = r.data?.data ?? r.data; toast.success(t('equipment.created')); onClose(); navigate(`/communities/${id}/equipment/${eq.uuid}`);
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!open} onClose={onClose} title={t('equipment.new')} size="md">
      <form onSubmit={submit} className="p-5 space-y-4">
        <div><label className="block text-sm font-medium mb-1.5" style={lbl} htmlFor="neq-name">{t('communities.itemTitle')}</label>
          <input id="neq-name" className="input-field" value={f.name} maxLength={150} autoFocus placeholder={t('equipment.namePlaceholder')} onChange={e => setF(x => ({ ...x, name: e.target.value }))} data-testid="new-equipment-name" /></div>
        <div><label className="block text-sm font-medium mb-1.5" style={lbl} htmlFor="neq-loc">{t('equipment.location')}</label>
          <input id="neq-loc" className="input-field" value={f.location} maxLength={200} placeholder={t('equipment.locationPlaceholder')} onChange={e => setF(x => ({ ...x, location: e.target.value }))} /></div>
        <p className="text-xs" style={muted}>{t('equipment.createHint')}</p>
        <div className="flex gap-3"><button type="button" className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary flex-1" disabled={saving || !f.name.trim()} data-testid="create-equipment">{saving ? t('common.saving') : t('equipment.createAndConfigure')}</button></div>
      </form>
    </Modal>
  );
}
