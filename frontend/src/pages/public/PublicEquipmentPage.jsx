import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, CalendarDays, ImageOff, Info } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { useAuthStore } from '../../store/auth';
import { addDays, dayLabel } from '../../utils/tz';
import PublicShell from '../../components/equipment/PublicShell';
import BookingModal from '../../components/equipment/BookingModal';
import SkeletonCard from '../../components/ui/SkeletonCard';

const muted = { color: 'var(--text-muted)' };
const lbl = { color: 'var(--text-secondary)' };
const wdName = (i) => dayLabel(addDays('2024-01-07', i), { weekday: 'long' });

/** /e/:token — página pública do equipamento (link/QR). Sem login; se a pessoa for membro logado, reserva pela conta. */
export default function PublicEquipmentPage() {
  const { token } = useParams();
  const { t } = useTranslation();
  const authToken = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const { data: eq, loading, error } = useApi(() => api.publicEquipment.get(token), [token]);
  // membro logado da comunidade dona? então reserva pelo perfil (modo "member"); senão, como convidado
  const { data: member } = useApi(async () => {
    if (!authToken || !eq?.community?.uuid) return null;
    try { const r = await api.communities.get(eq.community.uuid); const c = r.data?.data ?? r.data; return { data: { is: !!c?.permissions?.is_member } }; } catch { return { data: { is: false } }; }
  }, [authToken, eq?.community?.uuid]);
  const [open, setOpen] = useState(false);
  const asMember = !!member?.is;

  if (loading && !eq) return <PublicShell><SkeletonCard className="h-48" /><SkeletonCard className="h-32" /></PublicShell>;
  if (error || !eq) {
    return (
      <PublicShell>
        <div className="card p-8 text-center space-y-2" data-testid="public-notfound">
          <Info className="w-8 h-8 mx-auto" style={muted} />
          <h1 className="text-lg font-semibold">{t('equipment.publicNotFoundTitle')}</h1>
          <p className="text-sm" style={lbl}>{t('equipment.publicNotFoundDesc')}</p>
        </div>
      </PublicShell>
    );
  }
  const active = eq.status === 'active';
  const byDay = {}; (eq.windows || []).forEach(w => { (byDay[w.weekday] ||= []).push(`${w.start}–${w.end}`); });
  const imgSrc = eq.has_image ? api.publicEquipment.imageUrl(token, eq.image_version) : null;
  const loadSlots = async (from, to) => {
    if (asMember) { const r = await api.equipment.availability(eq.community.uuid, eq.uuid, from, to); return (r.data?.data ?? r.data).slots; }
    const r = await api.publicEquipment.availability(token, from, to); return (r.data?.data ?? r.data).slots;
  };
  const submit = async (payload) => {
    if (asMember) { const r = await api.equipment.book(eq.community.uuid, eq.uuid, payload); return r.data?.data ?? r.data; }
    const r = await api.publicEquipment.book(token, payload); return r.data?.data ?? r.data;
  };

  return (
    <PublicShell community={eq.community.name}>
      <div className="card overflow-hidden" data-testid="public-equipment">
        <div style={{ background: 'var(--bg-hover)', aspectRatio: '16 / 9' }} className="flex items-center justify-center">
          {imgSrc ? <img src={imgSrc} alt={eq.name} className="w-full h-full object-cover" /> : <ImageOff className="w-10 h-10" style={muted} />}
        </div>
        <div className="p-5 space-y-3">
          <h1 className="text-2xl font-bold">{eq.name}</h1>
          {eq.location && <p className="text-sm flex items-center gap-1.5" style={lbl}><MapPin className="w-4 h-4" /> {eq.location}</p>}
          {eq.description && <p className="text-sm whitespace-pre-wrap" style={lbl}>{eq.description}</p>}
          {(eq.specs || []).length > 0 && (
            <dl className="text-sm space-y-1">
              {eq.specs.map((s, i) => <div key={i} className="flex gap-2"><dt className="font-medium">{s.key}</dt><dd style={lbl}>{s.value}</dd></div>)}
            </dl>
          )}
        </div>
      </div>

      {!active && <div className="card p-4 text-sm" style={lbl} data-testid="public-unavailable">{t('equipment.publicUnavailable')}</div>}

      {active && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold">{t('equipment.publicWindowsTitle')}</h2>
          {Object.keys(byDay).length === 0 ? <p className="text-sm" style={muted}>{t('equipment.publicNoWindows')}</p> : (
            <ul className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {Object.keys(byDay).map(Number).sort().map(wd => <li key={wd} className="flex justify-between gap-3"><span className="capitalize" style={lbl}>{wdName(wd)}</span><span>{byDay[wd].join(' · ')}</span></li>)}
            </ul>
          )}
          <p className="text-xs" style={muted}>{t('equipment.publicRules', { slot: eq.slot_minutes, max: eq.max_minutes, days: eq.max_advance_days })}</p>
          {asMember && <p className="text-xs" style={muted} data-testid="as-member-note">{t('equipment.publicAsMember', { name: user?.name || '' })} <Link className="underline" to={`/communities/${eq.community.uuid}/equipment/${eq.uuid}`}>{t('equipment.openInCommunity')}</Link></p>}
          <button type="button" className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3" disabled={Object.keys(byDay).length === 0 && !asMember} onClick={() => setOpen(true)} data-testid="public-book">
            <CalendarDays className="w-5 h-5" /> {t('equipment.book')}
          </button>
        </div>
      )}

      {open && (
        <BookingModal open onClose={() => setOpen(false)} eq={eq} mode={asMember ? 'member' : 'guest'} loadSlots={loadSlots} submit={submit}
          prefill={asMember ? {} : { name: user?.name, email: user?.email }}
          manageLink={(mt) => `${window.location.origin}/e/${token}/b/${mt}`} />
      )}
    </PublicShell>
  );
}
