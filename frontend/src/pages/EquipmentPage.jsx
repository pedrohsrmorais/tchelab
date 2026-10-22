import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, ListChecks, Settings2, QrCode, Pencil, Trash2, Plus, Upload, ImageOff, MapPin, User, Radio, Check, X, Copy, Printer, Download, RefreshCw, Globe, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { currentLocale } from '../i18n';
import { parseApiError } from '../utils/errors';
import { fmtRange, dayLabel, addDays, zonedToIso, timeOf } from '../utils/tz';
import SkeletonCard from '../components/ui/SkeletonCard';
import AppCrumbs from '../components/apps/AppsNav';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import BookingModal from '../components/equipment/BookingModal';
import WeekAgenda from '../components/equipment/WeekAgenda';
import { qrSvg, downloadSvg, downloadPng, printLabel } from '../components/equipment/QrLabel';

const muted = { color: 'var(--text-muted)' };
const lbl = { color: 'var(--text-secondary)' };
const arr = (x) => (Array.isArray(x) ? x : []);
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const wdName = (i, long = true) => dayLabel(addDays('2024-01-07', i), { weekday: long ? 'long' : 'short' });

export const STATUS_BADGE = { confirmed: 'badge-green', pending: 'badge-amber', rejected: 'badge-red', cancelled: 'badge-red', no_show: 'badge-red', awaiting_email: 'badge-blue' };

/** Foto do equipamento (rota autenticada → blob). */
export function useEquipmentImage(cid, eq) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let revoked = false; let obj = null;
    setUrl(null);
    if (!eq?.has_image) return undefined;
    api.equipment.imageBlob(cid, eq.uuid).then(r => { if (revoked) return; obj = URL.createObjectURL(r.data); setUrl(obj); }).catch(() => {});
    return () => { revoked = true; if (obj) URL.revokeObjectURL(obj); };
  }, [cid, eq?.uuid, eq?.has_image, eq?.image_version]);
  return url;
}

/** Reduz a imagem (máx. 1280 px) antes de enviar. Devolve um File JPEG. */
async function shrink(file, max = 1280) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.86));
    return blob ? new File([blob], 'equipamento.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

function StatusBadge({ status }) {
  const { t } = useTranslation();
  return <span className={`badge ${STATUS_BADGE[status] || 'badge-blue'}`}>{t(`equipment.bookingStatus.${status}`)}</span>;
}

export default function EquipmentPage() {
  const { id: cid, eid } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: community } = useApi(() => api.communities.get(cid), [cid]);
  const { data: eq, loading, error, refetch } = useApi(() => api.equipment.get(cid, eid), [cid, eid]);
  const staff = !!community?.permissions?.can_moderate;
  const [tab, setTab] = useState('agenda');
  const [book, setBook] = useState(null);       // { start? }
  const [edit, setEdit] = useState(false);
  const [tick, setTick] = useState(0);          // recarrega agenda/reservas
  const img = useEquipmentImage(cid, eq);
  const fileRef = useRef(null);
  const [busyImg, setBusyImg] = useState(false);

  const uploadImage = useCallback(async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast.error(t('equipment.imageInvalid')); return; }
    setBusyImg(true);
    try {
      const small = await shrink(file); const fd = new FormData(); fd.append('image', small);
      await api.equipment.uploadImage(cid, eid, fd); toast.success(t('equipment.imageSaved')); await refetch();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusyImg(false); }
  }, [cid, eid, refetch, t]);

  // Ctrl+V com uma imagem na área de transferência (só quem pode editar)
  useEffect(() => {
    if (!staff) return undefined;
    const onPaste = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const item = arr(Array.from(e.clipboardData?.items || [])).find(i => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); uploadImage(item.getAsFile()); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [staff, uploadImage]);

  if (loading && !eq) return <div className="space-y-4"><SkeletonCard className="h-40" /><SkeletonCard className="h-64" /></div>;
  if (error || !eq) return <EmptyState icon={CalendarDays} title={t('equipment.notFound')} action={<Link to={`/communities/${cid}`} className="btn-primary">{t('communities.backToCommunities')}</Link>} />;

  const reload = async () => { await refetch(); setTick(x => x + 1); };
  const remove = async () => {
    if (!window.confirm(t('equipment.deleteConfirm'))) return;
    try { await api.equipment.remove(cid, eid); toast.success(t('equipment.deleted')); navigate(`/communities/${cid}`); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
  };
  const bookable = eq.status === 'active';
  const tabs = [['agenda', CalendarDays], ['bookings', ListChecks], ...(staff ? [['rules', Settings2], ['public', QrCode]] : [])];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <AppCrumbs cid={cid} community={community} app="equipment" trail={[{ label: eq.name }]} />

      <div className="card p-5">
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="sm:w-56 flex-shrink-0">
            <div className="rounded-xl overflow-hidden flex items-center justify-center" style={{ background: 'var(--bg-hover)', aspectRatio: '4 / 3' }} data-testid="equipment-image">
              {img ? <img src={img} alt={eq.name} className="w-full h-full object-cover" /> : <ImageOff className="w-8 h-8" style={muted} />}
            </div>
            {staff && (
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn-ghost text-xs flex-1 flex items-center justify-center gap-1.5" disabled={busyImg} onClick={() => fileRef.current?.click()} data-testid="upload-image"><Upload className="w-3.5 h-3.5" /> {busyImg ? t('common.saving') : t('equipment.changeImage')}</button>
                {eq.has_image && <button type="button" className="btn-ghost p-1.5" aria-label={t('equipment.removeImage')} onClick={async () => { try { await api.equipment.deleteImage(cid, eid); await refetch(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } }}><Trash2 className="w-3.5 h-3.5" /></button>}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="image-input" onChange={e => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
            )}
            {staff && <p className="text-[11px] mt-1.5" style={muted}>{t('equipment.pasteHint')}</p>}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-primary)' }}>
                  {eq.name}
                  {eq.status !== 'active' && <span className="badge badge-amber">{t(`equipment.status.${eq.status}`)}</span>}
                  {eq.access === 'public' && <span className="badge badge-blue flex items-center gap-1"><Globe className="w-3 h-3" /> {t('equipment.publicBadge')}</span>}
                </h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-1" style={lbl}>
                  {eq.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {eq.location}</span>}
                  {eq.responsible && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {eq.responsible.name}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {bookable && <button type="button" className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setBook({})} data-testid="open-booking"><CalendarDays className="w-4 h-4" /> {t('equipment.book')}</button>}
                {staff && <button type="button" className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => setEdit(true)} data-testid="edit-equipment"><Pencil className="w-3.5 h-3.5" /> {t('common.edit')}</button>}
                {staff && <button type="button" className="btn-ghost text-sm" onClick={remove} aria-label={t('common.delete')}><Trash2 className="w-3.5 h-3.5" /></button>}
              </div>
            </div>
            {eq.in_use_now && (
              <p className="text-sm flex items-center gap-2 text-green-400" data-testid="in-use-now"><Radio className="w-4 h-4" />
                {t('equipment.inUseNow', { name: eq.in_use_now.name, time: timeOf(eq.in_use_now.until, eq.timezone) })}{eq.in_use_now.institution ? ` (${eq.in_use_now.institution})` : ''}
              </p>
            )}
            {eq.description && <p className="text-sm whitespace-pre-wrap" style={lbl}>{eq.description}</p>}
            {arr(eq.specs).length > 0 && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" data-testid="specs">
                {arr(eq.specs).map((s, i) => <div key={i} className="flex gap-2"><dt className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.key}</dt><dd style={lbl}>{s.value}</dd></div>)}
              </dl>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-xl w-fit max-w-full overflow-x-auto" style={{ background: 'var(--bg-hover)' }} role="tablist">
        {tabs.map(([k, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className="px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 whitespace-nowrap"
            style={{ background: tab === k ? 'var(--accent)' : 'transparent', color: tab === k ? '#fff' : 'var(--text-secondary)' }}>
            <Icon className="w-3.5 h-3.5" /> {t(`equipment.tab.${k}`)}
            {k === 'bookings' && staff && eq.pending_count > 0 && <span className="badge badge-amber ml-1">{eq.pending_count}</span>}
          </button>
        ))}
      </div>

      {tab === 'agenda' && <WeekAgenda cid={cid} eq={eq} refreshKey={tick} onPickFree={bookable ? (start) => setBook({ start }) : undefined} />}
      {tab === 'bookings' && <BookingsTab cid={cid} eq={eq} staff={staff} tick={tick} onChanged={reload} />}
      {tab === 'rules' && staff && <RulesTab cid={cid} eq={eq} onChanged={reload} />}
      {tab === 'public' && staff && <PublicTab cid={cid} eq={eq} community={community} onChanged={reload} />}

      {book && (
        <BookingModal open onClose={() => setBook(null)} eq={eq} mode="member" initialStart={book.start}
          loadSlots={async (from, to) => { const r = await api.equipment.availability(cid, eid, from, to); return (r.data?.data ?? r.data).slots; }}
          submit={async (payload) => { const r = await api.equipment.book(cid, eid, payload); return r.data?.data ?? r.data; }}
          onBooked={() => { reload(); }} />
      )}
      {edit && <EditModal cid={cid} eq={eq} onClose={() => setEdit(false)} onSaved={async () => { setEdit(false); await reload(); }} />}
    </div>
  );
}

/* ═══════════════════════ Reservas ═══════════════════════ */
function BookingsTab({ cid, eq, staff, tick, onChanged }) {
  const { t } = useTranslation();
  const [view, setView] = useState('upcoming');
  const [mine, setMine] = useState(false);
  const params = useMemo(() => {
    const now = new Date().toISOString();
    if (view === 'pending') return { status: 'pending', from: now };
    if (view === 'history') return { from: new Date(Date.now() - 180 * 86400000).toISOString(), to: now };
    return { status: 'pending,confirmed', from: now };
  }, [view]);
  const { data, loading, refetch } = useApi(() => api.equipment.bookings(cid, eq.uuid, params), [cid, eq.uuid, params, tick]);
  const list = arr(data).filter(b => !mine || b.mine).sort((a, b) => (view === 'history' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));

  const act = async (b, action) => {
    let note;
    if (action === 'reject' || (action === 'cancel' && !b.mine)) { note = window.prompt(t('equipment.noteToRequester')) ; if (note === null) return; }
    else if (action === 'cancel' && !window.confirm(t('equipment.cancelConfirm'))) return;
    try { await api.equipment.act(cid, eq.uuid, b.uuid, action, note || undefined); toast.success(t(`equipment.done.${action}`)); await refetch(); onChanged?.(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {['upcoming', ...(staff ? ['pending'] : []), 'history'].map(v => (
          <button key={v} type="button" onClick={() => setView(v)} className="px-3 py-1 rounded-full text-sm" data-testid={`bview-${v}`}
            style={{ background: view === v ? 'var(--accent)' : 'var(--bg-hover)', color: view === v ? '#fff' : 'var(--text-secondary)' }}>
            {t(`equipment.view.${v}`)}{v === 'pending' && eq.pending_count > 0 ? ` (${eq.pending_count})` : ''}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-sm cursor-pointer" style={lbl}><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> {t('equipment.onlyMine')}</label>
      </div>
      {loading && !data ? <SkeletonCard className="h-24" /> : list.length === 0 ? (
        <EmptyState icon={ListChecks} title={t('equipment.noBookingsTitle')} description={t(`equipment.noBookings.${view}`)} />
      ) : (
        <ul className="space-y-2">
          {list.map(b => {
            const past = new Date(b.end) < new Date(); const started = new Date(b.start) <= new Date();
            return (
              <li key={b.uuid} className="card p-4" data-testid="booking-row" data-status={b.status}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-primary)' }}>
                      {fmtRange(b.start, b.end, eq.timezone)} <StatusBadge status={b.status} />
                      {b.external && <span className="badge badge-purple">{t('equipment.external')}</span>}
                      {b.mine && <span className="badge badge-blue">{t('equipment.mineBadge')}</span>}
                    </p>
                    <p className="text-sm mt-0.5" style={lbl}>{b.who.name}{b.who.institution ? ` · ${b.who.institution}` : ''}</p>
                    {b.purpose && <p className="text-xs mt-1" style={muted}>{b.purpose}{b.project_note ? ` · ${b.project_note}` : ''}</p>}
                    {staff && b.guest && <p className="text-xs mt-1" style={muted}>{b.guest.email}{b.guest.phone ? ` · ${b.guest.phone}` : ''}</p>}
                    {b.decision_note && <p className="text-xs mt-1 italic" style={muted}>“{b.decision_note}”</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {staff && b.status === 'pending' && (<>
                      <button type="button" className="btn-primary text-xs flex items-center gap-1" onClick={() => act(b, 'approve')} data-testid="approve"><Check className="w-3.5 h-3.5" /> {t('equipment.approve')}</button>
                      <button type="button" className="btn-ghost text-xs flex items-center gap-1" onClick={() => act(b, 'reject')} data-testid="reject"><X className="w-3.5 h-3.5" /> {t('equipment.reject')}</button>
                    </>)}
                    {(staff || b.mine) && ['pending', 'confirmed'].includes(b.status) && !past && <button type="button" className="btn-ghost text-xs" onClick={() => act(b, 'cancel')} data-testid="cancel-booking">{t('equipment.cancel')}</button>}
                    {staff && b.status === 'confirmed' && started && <button type="button" className="btn-ghost text-xs" onClick={() => act(b, 'no_show')}>{t('equipment.noShow')}</button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ═══════════════════════ Regras (janelas, parâmetros, bloqueios) ═══════════════════════ */
function RulesTab({ cid, eq, onChanged }) {
  return (
    <div className="space-y-5">
      <WindowsEditor cid={cid} eq={eq} onChanged={onChanged} />
      <ParamsForm cid={cid} eq={eq} onChanged={onChanged} />
      <BlocksPanel cid={cid} eq={eq} onChanged={onChanged} />
    </div>
  );
}

function WindowsEditor({ cid, eq, onChanged }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRows(arr(eq.windows).map(w => ({ ...w }))); }, [eq.windows]);
  const upd = (i, patch) => setRows(r => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const save = async () => {
    setSaving(true);
    try { await api.equipment.saveWindows(cid, eq.uuid, rows); toast.success(t('equipment.windowsSaved')); await onChanged(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };
  const addDay = (wd) => setRows(r => [...r, { weekday: wd, start: '08:00', end: '18:00', audience: 'members' }]);
  return (
    <section className="card p-5 space-y-3" data-testid="windows-editor">
      <div>
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('equipment.windowsTitle')}</h2>
        <p className="text-xs mt-1" style={muted}>{t('equipment.windowsHint')}</p>
      </div>
      {WEEKDAYS.map(wd => {
        const mine = rows.map((w, i) => ({ w, i })).filter(x => x.w.weekday === wd);
        return (
          <div key={wd} className="flex flex-wrap items-start gap-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="w-24 pt-2 text-sm capitalize font-medium" style={lbl}>{wdName(wd)}</span>
            <div className="flex-1 space-y-2 min-w-0">
              {mine.length === 0 && <span className="text-sm block pt-2" style={muted}>{t('equipment.closed')}</span>}
              {mine.map(({ w, i }) => (
                <div key={i} className="flex flex-wrap items-center gap-2" data-testid="window-row">
                  <input type="time" className="input-field !w-28 !py-1" value={w.start} onChange={e => upd(i, { start: e.target.value })} aria-label={t('equipment.from')} />
                  <span style={muted}>–</span>
                  <input type="time" className="input-field !w-28 !py-1" value={w.end} onChange={e => upd(i, { end: e.target.value })} aria-label={t('equipment.to')} />
                  <select className="input-field !w-auto !py-1" value={w.audience} onChange={e => upd(i, { audience: e.target.value })} aria-label={t('equipment.audience')}>
                    <option value="members">{t('equipment.audienceMembers')}</option>
                    <option value="public">{t('equipment.audiencePublic')}</option>
                  </select>
                  <button type="button" className="btn-ghost p-1.5" aria-label={t('common.delete')} onClick={() => setRows(r => r.filter((_, k) => k !== i))}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-ghost text-xs flex items-center gap-1" onClick={() => addDay(wd)}><Plus className="w-3 h-3" /> {t('equipment.addWindow')}</button>
          </div>
        );
      })}
      <div className="flex justify-end"><button type="button" className="btn-primary" disabled={saving} onClick={save} data-testid="save-windows">{saving ? t('common.saving') : t('equipment.saveWindows')}</button></div>
    </section>
  );
}

function ParamsForm({ cid, eq, onChanged }) {
  const { t } = useTranslation();
  const [f, setF] = useState({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  useEffect(() => { setF({ slot_minutes: eq.slot_minutes, min_minutes: eq.min_minutes, max_minutes: eq.max_minutes, min_notice_minutes: eq.min_notice_minutes, max_advance_days: eq.max_advance_days, cancel_until_minutes: eq.cancel_until_minutes, member_approval: eq.member_approval, guest_approval: eq.guest_approval, timezone: eq.timezone, status: eq.status }); }, [eq]);
  const num = (k, label, hint, min = 0) => (
    <div key={k}><label className="block text-sm font-medium mb-1" style={lbl} htmlFor={`p-${k}`}>{label}</label>
      <input id={`p-${k}`} type="number" min={min} className={`input-field ${errors[k] ? '!border-red-500' : ''}`} value={f[k] ?? ''} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} data-testid={`param-${k}`} />
      {errors[k] ? <p className="text-xs text-red-400 mt-1">{errors[k]}</p> : hint && <p className="text-xs mt-1" style={muted}>{hint}</p>}</div>
  );
  const save = async (e) => {
    e.preventDefault(); setSaving(true); setErrors({});
    try {
      const body = { ...f }; ['slot_minutes', 'min_minutes', 'max_minutes', 'min_notice_minutes', 'max_advance_days', 'cancel_until_minutes'].forEach(k => { body[k] = Number(body[k]); });
      await api.equipment.update(cid, eq.uuid, body); toast.success(t('equipment.paramsSaved')); await onChanged();
    } catch (err) { const pe = parseApiError(err, t('common.error')); setErrors(pe.fields); toast.error(pe.message); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={save} className="card p-5 space-y-4" data-testid="params-form">
      <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('equipment.paramsTitle')}</h2>
      <div className="grid sm:grid-cols-3 gap-4">
        {num('slot_minutes', t('equipment.slotMinutes'), t('equipment.slotHint'), 5)}
        {num('min_minutes', t('equipment.minMinutes'), null, 5)}
        {num('max_minutes', t('equipment.maxMinutes'), null, 5)}
        {num('min_notice_minutes', t('equipment.minNotice'), t('equipment.minNoticeHint'))}
        {num('max_advance_days', t('equipment.maxAdvance'), null, 1)}
        {num('cancel_until_minutes', t('equipment.cancelUntil'), t('equipment.cancelUntilHint'))}
        <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="p-ma">{t('equipment.memberApproval')}</label>
          <select id="p-ma" className="input-field" value={f.member_approval || 'auto'} onChange={e => setF(x => ({ ...x, member_approval: e.target.value }))}>
            <option value="auto">{t('equipment.approval.auto')}</option><option value="manual">{t('equipment.approval.manual')}</option></select></div>
        <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="p-st">{t('equipment.statusLabel')}</label>
          <select id="p-st" className="input-field" value={f.status || 'active'} onChange={e => setF(x => ({ ...x, status: e.target.value }))} data-testid="param-status">
            {['active', 'maintenance', 'archived'].map(s => <option key={s} value={s}>{t(`equipment.status.${s}`)}</option>)}</select></div>
        <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="p-tz">{t('equipment.timezone')}</label>
          <input id="p-tz" className={`input-field ${errors.timezone ? '!border-red-500' : ''}`} value={f.timezone || ''} onChange={e => setF(x => ({ ...x, timezone: e.target.value }))} placeholder="America/Sao_Paulo" />
          {errors.timezone && <p className="text-xs text-red-400 mt-1">{errors.timezone}</p>}</div>
      </div>
      <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={saving} data-testid="save-params">{saving ? t('common.saving') : t('common.save')}</button></div>
    </form>
  );
}

function BlocksPanel({ cid, eq, onChanged }) {
  const { t } = useTranslation();
  const tz = eq.timezone;
  const { data, refetch } = useApi(() => api.equipment.blocks(cid, eq.uuid), [cid, eq.uuid]);
  const [f, setF] = useState({ start: '', end: '', reason: '', show_reason: false, repeat: false, repeat_until: '', cancel_conflicts: false });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const body = { start: zonedToIso(f.start, tz), end: zonedToIso(f.end, tz), reason: f.reason, show_reason: f.show_reason, cancel_conflicts: f.cancel_conflicts };
      if (f.repeat && f.repeat_until) body.repeat_until = f.repeat_until;
      const r = await api.equipment.createBlock(cid, eq.uuid, body); const out = r.data?.data ?? r.data;
      toast.success(out.conflicts && !out.cancelled ? t('equipment.blockCreatedConflicts', { count: out.conflicts }) : t('equipment.blockCreated'));
      setF({ start: '', end: '', reason: '', show_reason: false, repeat: false, repeat_until: '', cancel_conflicts: false }); await refetch(); onChanged?.();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };
  const list = arr(data);
  return (
    <section className="card p-5 space-y-4" data-testid="blocks-panel">
      <div><h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('equipment.blocksTitle')}</h2><p className="text-xs mt-1" style={muted}>{t('equipment.blocksHint')}</p></div>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
        <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="bl-s">{t('equipment.from')}</label><input id="bl-s" type="datetime-local" className="input-field" value={f.start} onChange={e => setF(x => ({ ...x, start: e.target.value }))} required data-testid="block-start" /></div>
        <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="bl-e">{t('equipment.to')}</label><input id="bl-e" type="datetime-local" className="input-field" value={f.end} onChange={e => setF(x => ({ ...x, end: e.target.value }))} required data-testid="block-end" /></div>
        <div className="sm:col-span-2"><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="bl-r">{t('equipment.blockReason')}</label><input id="bl-r" className="input-field" maxLength={200} value={f.reason} onChange={e => setF(x => ({ ...x, reason: e.target.value }))} placeholder={t('equipment.blockReasonPlaceholder')} data-testid="block-reason" /></div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={lbl}><input type="checkbox" checked={f.show_reason} onChange={e => setF(x => ({ ...x, show_reason: e.target.checked }))} /> {t('equipment.showReason')}</label>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={lbl}><input type="checkbox" checked={f.cancel_conflicts} onChange={e => setF(x => ({ ...x, cancel_conflicts: e.target.checked }))} /> {t('equipment.cancelConflicts')}</label>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={lbl}><input type="checkbox" checked={f.repeat} onChange={e => setF(x => ({ ...x, repeat: e.target.checked }))} /> {t('equipment.repeatWeekly')}</label>
        {f.repeat && <div><input type="date" className="input-field" value={f.repeat_until} min={f.start.slice(0, 10)} onChange={e => setF(x => ({ ...x, repeat_until: e.target.value }))} aria-label={t('equipment.repeatUntil')} required /></div>}
        <div className="sm:col-span-2 flex justify-end"><button type="submit" className="btn-primary text-sm flex items-center gap-1.5" disabled={saving || !f.start || !f.end} data-testid="add-block"><Lock className="w-3.5 h-3.5" /> {t('equipment.addBlock')}</button></div>
      </form>
      {list.length === 0 ? <p className="text-sm" style={muted}>{t('equipment.noBlocks')}</p> : (
        <ul className="space-y-2">
          {list.map(b => (
            <li key={b.uuid} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg-hover)' }} data-testid="block-row">
              <Lock className="w-4 h-4 flex-shrink-0" style={muted} />
              <span className="min-w-0 flex-1"><span style={{ color: 'var(--text-primary)' }}>{fmtRange(b.start, b.end, tz)}</span>{b.repeat_until ? <span style={muted}> · {t('equipment.weeklyUntil', { date: b.repeat_until })}</span> : null}{b.reason ? <span style={muted}> · {b.reason}</span> : null}</span>
              <button type="button" className="btn-ghost p-1.5" aria-label={t('common.delete')} onClick={async () => { try { await api.equipment.deleteBlock(cid, eq.uuid, b.uuid); await refetch(); onChanged?.(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } }}><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ═══════════════════════ Acesso público + QR ═══════════════════════ */
function PublicTab({ cid, eq, community, onChanged }) {
  const { t } = useTranslation();
  const [svg, setSvg] = useState('');
  const [busy, setBusy] = useState(false);
  const isPublic = eq.access === 'public';
  const url = eq.public_url;
  useEffect(() => { let on = true; if (url) qrSvg(url).then(s => { if (on) setSvg(s); }); else setSvg(''); return () => { on = false; }; }, [url]);
  const patch = async (body, okMsg) => {
    setBusy(true);
    try { await api.equipment.update(cid, eq.uuid, body); if (okMsg) toast.success(okMsg); await onChanged(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };
  const rotate = async () => {
    if (!window.confirm(t('equipment.rotateConfirm'))) return;
    setBusy(true);
    try { await api.equipment.rotateToken(cid, eq.uuid); toast.success(t('equipment.rotated')); await onChanged(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };
  const toDataUrl = async () => {
    if (!eq.has_image) return null;
    try { const r = await api.equipment.imageBlob(cid, eq.uuid); return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(r.data); }); } catch { return null; }
  };
  const print = async () => {
    const ok = await printLabel({ name: eq.name, location: eq.location, url, imageDataUrl: await toDataUrl(), caption: t('equipment.labelCaption'), community: community?.name, printText: t('equipment.print') });
    if (!ok) toast.error(t('equipment.popupBlocked'));
  };
  const slug = eq.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'equipamento';
  const hasPublicWindow = arr(eq.windows).some(w => w.audience === 'public');
  return (
    <div className="space-y-5" data-testid="public-tab">
      <section className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><Globe className="w-4 h-4" /> {t('equipment.publicTitle')}</h2>
            <p className="text-sm mt-1" style={lbl}>{isPublic ? t('equipment.publicOnDesc') : t('equipment.publicOffDesc')}</p>
          </div>
          <button type="button" role="switch" aria-checked={isPublic} disabled={busy} onClick={() => patch({ access: isPublic ? 'community' : 'public' }, isPublic ? t('equipment.publicOff') : t('equipment.publicOn'))} data-testid="toggle-public"
            className="relative w-12 h-7 rounded-full transition-colors flex-shrink-0" style={{ background: isPublic ? 'var(--accent)' : 'var(--bg-hover)', border: '1px solid var(--border)' }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: isPublic ? 24 : 2 }} />
          </button>
        </div>
        {isPublic && !hasPublicWindow && <p className="text-sm text-amber-400" data-testid="no-public-window">{t('equipment.noPublicWindow')}</p>}
        <div>
          <label className="block text-sm font-medium mb-1" style={lbl} htmlFor="guest-appr">{t('equipment.guestApproval')}</label>
          <select id="guest-appr" className="input-field !w-auto" value={eq.guest_approval} disabled={busy} onChange={e => patch({ guest_approval: e.target.value }, t('equipment.paramsSaved'))} data-testid="guest-approval">
            <option value="manual">{t('equipment.approval.manual')}</option><option value="auto">{t('equipment.approval.auto')}</option>
          </select>
        </div>
      </section>

      {isPublic && url && (
        <section className="card p-5" data-testid="qr-section">
          <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
            <div className="rounded-xl p-3 bg-white flex-shrink-0" style={{ width: 200, height: 200 }} dangerouslySetInnerHTML={{ __html: svg }} data-testid="qr-svg" />
            <div className="min-w-0 flex-1 space-y-3 w-full">
              <div>
                <label className="block text-sm font-medium mb-1" style={lbl}>{t('equipment.publicLink')}</label>
                <div className="flex items-center gap-2">
                  <input readOnly className="input-field text-xs" value={url} onFocus={e => e.target.select()} data-testid="public-url" />
                  <button type="button" className="btn-ghost p-2" aria-label={t('equipment.copy')} onClick={() => { navigator.clipboard?.writeText(url); toast.success(t('equipment.copied')); }}><Copy className="w-4 h-4" /></button>
                </div>
                <a href={url} target="_blank" rel="noreferrer" className="text-xs underline mt-1 inline-block" style={muted}>{t('equipment.openPublic')}</a>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary text-sm flex items-center gap-1.5" onClick={print} data-testid="print-label"><Printer className="w-4 h-4" /> {t('equipment.printLabel')}</button>
                <button type="button" className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => downloadPng(url, `qr-${slug}`)}><Download className="w-4 h-4" /> PNG</button>
                <button type="button" className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => downloadSvg(url, `qr-${slug}`)}><Download className="w-4 h-4" /> SVG</button>
                <button type="button" className="btn-ghost text-sm flex items-center gap-1.5" disabled={busy} onClick={rotate} data-testid="rotate-token"><RefreshCw className="w-4 h-4" /> {t('equipment.rotate')}</button>
              </div>
              <p className="text-xs" style={muted}>{t('equipment.qrHint')}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* ═══════════════════════ Editar dados ═══════════════════════ */
function EditModal({ cid, eq, onClose, onSaved }) {
  const { t } = useTranslation();
  const { data: members } = useApi(() => api.communities.listMembers(cid), [cid]);
  const [f, setF] = useState({ name: eq.name, description: eq.description || '', location: eq.location || '', responsible: eq.responsible?.uuid || '', specs: arr(eq.specs).map(s => ({ ...s })) });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const mem = arr(members?.members || members);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErrors({});
    try { await api.equipment.update(cid, eq.uuid, { name: f.name, description: f.description, location: f.location, responsible: f.responsible || null, specs: f.specs }); toast.success(t('quiz.saved')); await onSaved(); }
    catch (err) { const pe = parseApiError(err, t('common.error')); setErrors(pe.fields); toast.error(pe.message); } finally { setSaving(false); }
  };
  const setSpec = (i, patch) => setF(x => ({ ...x, specs: x.specs.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  return (
    <Modal open onClose={onClose} title={t('equipment.editTitle')} size="md">
      <form onSubmit={submit} className="p-5 space-y-4 overflow-auto">
        <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="eq-name">{t('communities.itemTitle')}</label>
          <input id="eq-name" className={`input-field ${errors.name ? '!border-red-500' : ''}`} value={f.name} maxLength={150} onChange={e => setF(x => ({ ...x, name: e.target.value }))} autoFocus />{errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}</div>
        <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="eq-loc">{t('equipment.location')}</label>
          <input id="eq-loc" className="input-field" value={f.location} maxLength={200} onChange={e => setF(x => ({ ...x, location: e.target.value }))} placeholder={t('equipment.locationPlaceholder')} /></div>
        <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="eq-resp">{t('equipment.responsible')}</label>
          <select id="eq-resp" className="input-field" value={f.responsible} onChange={e => setF(x => ({ ...x, responsible: e.target.value }))}>
            <option value="">—</option>{mem.map(m => <option key={m.user?.uuid || m.uuid} value={m.user?.uuid || m.uuid}>{m.user?.name || m.name}</option>)}
          </select></div>
        <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="eq-desc">{t('common.description')}</label>
          <textarea id="eq-desc" className="input-field resize-none" rows={3} value={f.description} onChange={e => setF(x => ({ ...x, description: e.target.value }))} /></div>
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-sm font-medium" style={lbl}>{t('equipment.specs')}</label>
            <button type="button" className="btn-ghost text-xs flex items-center gap-1" onClick={() => setF(x => ({ ...x, specs: [...x.specs, { key: '', value: '' }] }))} data-testid="add-spec"><Plus className="w-3 h-3" /> {t('equipment.addSpec')}</button></div>
          <div className="space-y-2">
            {f.specs.map((s, i) => (
              <div key={i} className="flex gap-2" data-testid="spec-row">
                <input className="input-field !py-1.5" value={s.key} maxLength={80} placeholder={t('equipment.specKey')} aria-label={t('equipment.specKey')} onChange={e => setSpec(i, { key: e.target.value })} />
                <input className="input-field !py-1.5" value={s.value} maxLength={300} placeholder={t('equipment.specValue')} aria-label={t('equipment.specValue')} onChange={e => setSpec(i, { value: e.target.value })} />
                <button type="button" className="btn-ghost p-1.5" aria-label={t('common.delete')} onClick={() => setF(x => ({ ...x, specs: x.specs.filter((_, k) => k !== i) }))}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3"><button type="button" className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary flex-1" disabled={saving || !f.name.trim()}>{saving ? t('common.saving') : t('common.save')}</button></div>
      </form>
    </Modal>
  );
}
