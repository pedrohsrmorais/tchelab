import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, CheckCircle2, MailCheck, Clock, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { parseApiError } from '../../utils/errors';
import { dateKey, todayKey, timeOf, addDays, dayLabel, fmtRange, browserTz } from '../../utils/tz';

const muted = { color: 'var(--text-muted)' };
const lbl = { color: 'var(--text-secondary)' };

/**
 * Modal de reserva — o MESMO componente serve à comunidade (mode="member", autenticado) e à página pública
 * (mode="guest", sem login).
 *   loadSlots(fromKey, toKey) → Promise<slots[]>      submit(payload) → Promise<resposta da API>
 *   eq: { name, timezone, slot_minutes, min_minutes, max_minutes, max_advance_days, guest_approval?, member_approval? }
 */
export default function BookingModal({ open, onClose, eq, mode = 'member', loadSlots, submit, initialStart = null, prefill = {}, manageLink = null, onBooked }) {
  const { t } = useTranslation();
  const tz = eq.timezone;
  const today = todayKey(tz);
  const lastDay = addDays(today, eq.max_advance_days);
  const [pageStart, setPageStart] = useState(today);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [day, setDay] = useState(today);
  const [start, setStart] = useState(null);
  const [minutes, setMinutes] = useState(eq.min_minutes);
  const [f, setF] = useState({ name: '', email: '', institution: '', phone: '', purpose: '', project_note: '', consent: false, website: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!open) return;
    setDone(null); setErrors({}); setStart(null); setMinutes(eq.min_minutes);
    setF(x => ({ ...x, name: prefill.name || x.name || '', email: prefill.email || x.email || '', purpose: '', project_note: '', consent: false, website: '' }));
    const first = initialStart ? dateKey(initialStart, tz) : today;
    setDay(first); setPageStart(first);
    if (initialStart) setStart(initialStart);
  }, [open]); // eslint-disable-line

  const reload = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try { setSlots(await loadSlots(pageStart, addDays(pageStart, 6))); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setLoading(false); }
  }, [open, pageStart]); // eslint-disable-line
  useEffect(() => { reload(); }, [reload]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(pageStart, i)), [pageStart]);
  const freeBy = useMemo(() => {
    const m = {};
    slots.forEach(s => { if (s.state === 'free') (m[dateKey(s.start, tz)] ||= []).push(s); });
    return m;
  }, [slots, tz]);
  const dayAll = useMemo(() => slots.filter(s => dateKey(s.start, tz) === day), [slots, day, tz]);

  // quantos minutos seguidos estão livres a partir do início escolhido
  const maxMinutes = useMemo(() => {
    if (!start) return 0;
    const byStart = new Map(slots.map(s => [new Date(s.start).getTime(), s]));
    let n = 0; let t0 = new Date(start).getTime();
    while (n * eq.slot_minutes < eq.max_minutes && byStart.get(t0)?.state === 'free') { n += 1; t0 += eq.slot_minutes * 60000; }
    return n * eq.slot_minutes;
  }, [start, slots, eq.slot_minutes, eq.max_minutes]);
  const durations = useMemo(() => { const out = []; for (let m = eq.min_minutes; m <= maxMinutes; m += eq.slot_minutes) out.push(m); return out; }, [eq, maxMinutes]);
  useEffect(() => { if (start && durations.length && !durations.includes(minutes)) setMinutes(durations[0]); }, [durations, start]); // eslint-disable-line

  const endIso = start ? new Date(new Date(start).getTime() + minutes * 60000).toISOString() : null;
  const guest = mode === 'guest';
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const send = async (e) => {
    e.preventDefault();
    if (!start || !durations.includes(minutes)) return;
    setSaving(true); setErrors({});
    try {
      const payload = guest
        ? { start, end: endIso, name: f.name, email: f.email, institution: f.institution, phone: f.phone, purpose: f.purpose, consent: f.consent, website: f.website }
        : { start, end: endIso, purpose: f.purpose, project_note: f.project_note };
      const res = await submit(payload);
      setDone(res); onBooked?.(res);
    } catch (err) {
      const pe = parseApiError(err, t('common.error'));
      setErrors(pe.fields);
      if (!Object.keys(pe.fields).length) toast.error(pe.message);
      if (pe.code === 'SLOT_UNAVAILABLE') { setStart(null); reload(); }
    } finally { setSaving(false); }
  };

  const showTz = browserTz() && browserTz() !== tz;
  const canPrev = pageStart > today;
  const canNext = addDays(pageStart, 7) <= lastDay;
  const fieldCls = (k) => `input-field ${errors[k] ? '!border-red-500' : ''}`;
  const err = (k) => (errors[k] ? <p className="text-xs text-red-400 mt-1">{errors[k]}</p> : null);

  return (
    <Modal open={open} onClose={onClose} title={`${t('equipment.book')} — ${eq.name}`} size="lg">
      <div className="p-5 overflow-auto" data-testid="booking-modal">
        {done ? <Done done={done} eq={eq} manageLink={manageLink} onClose={onClose} start={start} endIso={endIso} /> : (
          <form onSubmit={send} className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold" style={lbl}>{t('equipment.pickDay')}</h3>
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost p-1.5" disabled={!canPrev} onClick={() => setPageStart(addDays(pageStart, -7))} aria-label={t('equipment.prevWeek')}><ChevronLeft className="w-4 h-4" /></button>
                  <button type="button" className="btn-ghost p-1.5" disabled={!canNext} onClick={() => setPageStart(addDays(pageStart, 7))} aria-label={t('equipment.nextWeek')}><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {days.map(d => {
                  const n = (freeBy[d] || []).length; const sel = d === day;
                  return (
                    <button key={d} type="button" disabled={d < today || d > lastDay} onClick={() => { setDay(d); setStart(null); }} data-testid="booking-day"
                      className="rounded-lg px-1 py-2 text-center text-xs disabled:opacity-35"
                      style={{ background: sel ? 'var(--accent)' : 'var(--bg-hover)', color: sel ? '#fff' : 'var(--text-primary)', border: '1px solid var(--border)' }}>
                      <span className="block capitalize">{dayLabel(d, { weekday: 'short' })}</span>
                      <span className="block font-semibold">{dayLabel(d, { day: '2-digit', month: '2-digit' })}</span>
                      <span className="block text-[10px] opacity-80">{loading ? '…' : t('equipment.freeCount', { count: n })}</span>
                    </button>
                  );
                })}
              </div>
              {showTz && <p className="text-xs mt-2" style={muted}>{t('equipment.tzNote', { tz })}</p>}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2" style={lbl}>{t('equipment.pickTime')}</h3>
              {dayAll.length === 0 ? <p className="text-sm" style={muted}>{loading ? t('common.loading') : t('equipment.noSlotsDay')}</p> : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                  {dayAll.map(s => {
                    const free = s.state === 'free'; const sel = start === s.start;
                    return (
                      <button key={s.start} type="button" disabled={!free} onClick={() => setStart(s.start)} data-testid="booking-slot" data-state={s.state}
                        className="rounded-lg py-2 text-sm"
                        style={{ background: sel ? 'var(--accent)' : 'var(--bg-hover)', color: sel ? '#fff' : free ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid var(--border)', opacity: free ? 1 : 0.45, textDecoration: free ? 'none' : 'line-through' }}>
                        {timeOf(s.start, tz)}
                      </button>
                    );
                  })}
                </div>
              )}
              {start && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="text-sm" style={lbl} htmlFor="bk-dur">{t('equipment.duration')}</label>
                  <select id="bk-dur" className="input-field !w-auto" value={minutes} onChange={e => setMinutes(Number(e.target.value))} data-testid="booking-duration">
                    {durations.map(m => <option key={m} value={m}>{m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ''}` : `${m} min`}</option>)}
                  </select>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fmtRange(start, endIso, tz)}</span>
                </div>
              )}
            </div>

            {start && (
              <div className="space-y-3">
                {guest && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="bk-name">{t('equipment.guestName')}</label>
                        <input id="bk-name" className={fieldCls('name')} value={f.name} maxLength={120} autoComplete="name" onChange={e => set('name', e.target.value)} required />{err('name')}</div>
                      <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="bk-email">{t('equipment.guestEmail')}</label>
                        <input id="bk-email" type="email" className={fieldCls('email')} value={f.email} maxLength={190} autoComplete="email" onChange={e => set('email', e.target.value)} required />{err('email')}</div>
                      <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="bk-inst">{t('equipment.guestInstitution')}</label>
                        <input id="bk-inst" className={fieldCls('institution')} value={f.institution} maxLength={160} autoComplete="organization" onChange={e => set('institution', e.target.value)} required />{err('institution')}</div>
                      <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="bk-phone">{t('equipment.guestPhone')}</label>
                        <input id="bk-phone" type="tel" className={fieldCls('phone')} value={f.phone} maxLength={40} autoComplete="tel" onChange={e => set('phone', e.target.value)} />{err('phone')}</div>
                    </div>
                    {/* honeypot: invisível para pessoas; robôs costumam preencher */}
                    <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                      <label>Website <input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set('website', e.target.value)} /></label>
                    </div>
                  </>
                )}
                <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="bk-purpose">{t('equipment.purpose')}</label>
                  <textarea id="bk-purpose" className={`${fieldCls('purpose')} resize-none`} rows={3} maxLength={500} value={f.purpose} onChange={e => set('purpose', e.target.value)} placeholder={t('equipment.purposePlaceholder')} required={guest} />{err('purpose')}</div>
                {!guest && (
                  <div><label className="block text-sm font-medium mb-1" style={lbl} htmlFor="bk-note">{t('equipment.projectNote')}</label>
                    <input id="bk-note" className="input-field" maxLength={300} value={f.project_note} onChange={e => set('project_note', e.target.value)} placeholder={t('equipment.projectNotePlaceholder')} /></div>
                )}
                {guest && (
                  <div>
                    <label className="flex items-start gap-2 text-sm cursor-pointer" style={lbl}>
                      <input type="checkbox" className="mt-1" checked={f.consent} onChange={e => set('consent', e.target.checked)} data-testid="booking-consent" />
                      <span>{t('equipment.consent')}</span>
                    </label>{err('consent')}
                    <p className="text-xs mt-2" style={muted}>{eq.guest_approval === 'manual' ? t('equipment.guestManualNote') : t('equipment.guestAutoNote')}</p>
                  </div>
                )}
                {!guest && eq.member_approval === 'manual' && <p className="text-xs" style={muted}>{t('equipment.memberManualNote')}</p>}
                <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2" disabled={saving || (guest && !f.consent)} data-testid="booking-submit">
                  <Clock className="w-4 h-4" /> {saving ? t('common.saving') : t('equipment.confirmBooking')}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </Modal>
  );
}

function Done({ done, eq, manageLink, onClose, start, endIso }) {
  const { t } = useTranslation();
  const status = done.status;
  const awaiting = status === 'awaiting_email';
  const Icon = awaiting ? MailCheck : CheckCircle2;
  const title = awaiting ? t('equipment.doneAwaitingTitle') : status === 'pending' ? t('equipment.donePendingTitle') : t('equipment.doneConfirmedTitle');
  const desc = awaiting ? t('equipment.doneAwaitingDesc', { min: done.hold_minutes || 15 }) : status === 'pending' ? t('equipment.donePendingDesc') : t('equipment.doneConfirmedDesc');
  const link = done.manage_token && manageLink ? manageLink(done.manage_token) : null;
  return (
    <div className="text-center space-y-4 py-4" data-testid="booking-done" data-status={status}>
      <Icon className={`w-12 h-12 mx-auto ${status === 'confirmed' ? 'text-green-400' : 'text-blue-400'}`} />
      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      <p className="text-sm" style={lbl}>{eq.name} · {fmtRange(start, endIso, eq.timezone)}</p>
      <p className="text-sm" style={lbl}>{desc}</p>
      {link && (
        <div className="rounded-lg p-3 text-left" style={{ background: 'var(--bg-hover)' }}>
          <p className="text-xs mb-1" style={muted}>{t('equipment.manageLinkHint')}</p>
          <div className="flex items-center gap-2">
            <input readOnly className="input-field !py-1.5 text-xs" value={link} onFocus={e => e.target.select()} data-testid="manage-link" />
            <button type="button" className="btn-ghost p-2" aria-label={t('equipment.copy')} onClick={() => { navigator.clipboard?.writeText(link); toast.success(t('equipment.copied')); }}><Copy className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      <button type="button" className="btn-primary" onClick={onClose}>{t('common.close')}</button>
    </div>
  );
}
