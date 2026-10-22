import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, XCircle, MailCheck, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { parseApiError } from '../../utils/errors';
import { fmtRange } from '../../utils/tz';
import PublicShell from '../../components/equipment/PublicShell';
import SkeletonCard from '../../components/ui/SkeletonCard';

const lbl = { color: 'var(--text-secondary)' };
const muted = { color: 'var(--text-muted)' };
const ICON = { confirmed: [CheckCircle2, 'text-green-400'], pending: [Clock, 'text-amber-400'], awaiting_email: [MailCheck, 'text-blue-400'], cancelled: [XCircle, 'text-red-400'], rejected: [XCircle, 'text-red-400'], expired: [XCircle, 'text-red-400'], no_show: [XCircle, 'text-red-400'] };

/** /e/:token/b/:mt — o convidado confirma o e-mail, acompanha e cancela a própria reserva (link de gestão). */
export default function PublicBookingPage() {
  const { token, mt } = useParams();
  const { t } = useTranslation();
  const { data: b, loading, error, refetch } = useApi(() => api.publicEquipment.booking(mt), [mt]);
  const [busy, setBusy] = useState(false);
  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(mt); toast.success(okMsg); await refetch(); } catch (err) { toast.error(parseApiError(err, t('common.error')).message); await refetch().catch(() => {}); } finally { setBusy(false); }
  };
  if (loading && !b) return <PublicShell><SkeletonCard className="h-48" /></PublicShell>;
  if (error || !b) {
    return <PublicShell><div className="card p-8 text-center space-y-2" data-testid="booking-notfound"><Info className="w-8 h-8 mx-auto" style={muted} /><h1 className="text-lg font-semibold">{t('equipment.bookingNotFound')}</h1></div></PublicShell>;
  }
  const [Icon, color] = ICON[b.status] || ICON.pending;
  return (
    <PublicShell>
      <div className="card p-6 text-center space-y-4" data-testid="managed-booking" data-status={b.status}>
        <Icon className={`w-12 h-12 mx-auto ${color}`} />
        <h1 className="text-xl font-bold">{t(`equipment.managed.${b.status}.title`)}</h1>
        <p className="text-sm" style={lbl}>{t(`equipment.managed.${b.status}.desc`)}</p>
        <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--bg-hover)' }}>
          <p className="font-semibold">{b.equipment.name}</p>
          <p style={lbl}>{fmtRange(b.start, b.end, b.equipment.timezone)}</p>
          {b.equipment.location && <p className="text-xs" style={muted}>{b.equipment.location}</p>}
        </div>
        {b.decision_note && <p className="text-sm italic" style={lbl}>“{b.decision_note}”</p>}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {b.can_confirm && <button type="button" className="btn-primary flex items-center justify-center gap-2" disabled={busy} onClick={() => run(api.publicEquipment.confirm, t('equipment.emailConfirmed'))} data-testid="confirm-email"><MailCheck className="w-4 h-4" /> {t('equipment.confirmEmail')}</button>}
          {b.can_cancel && <button type="button" className="btn-ghost" disabled={busy} onClick={() => { if (window.confirm(t('equipment.cancelConfirm'))) run(api.publicEquipment.cancel, t('equipment.done.cancel')); }} data-testid="cancel-managed">{t('equipment.cancel')}</button>}
          <Link to={`/e/${token}`} className="btn-ghost text-center">{t('equipment.backToEquipment')}</Link>
        </div>
      </div>
    </PublicShell>
  );
}
