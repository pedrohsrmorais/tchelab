import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { api } from '../../api';
import { todayKey, weekStart, addDays, dayLabel, dateKey, timeOf } from '../../utils/tz';

const muted = { color: 'var(--text-muted)' };

/** Grade semanal (dias × horários) de um equipamento, no fuso do equipamento. */
export default function WeekAgenda({ cid, eq, refreshKey, onPickFree }) {
  const { t } = useTranslation();
  const tz = eq.timezone;
  const [start, setStart] = useState(() => weekStart(todayKey(tz)));
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.equipment.availability(cid, eq.uuid, start, addDays(start, 6)); setSlots((r.data?.data ?? r.data).slots || []); } catch { setSlots([]); } finally { setLoading(false); }
  }, [cid, eq.uuid, start]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const rows = useMemo(() => [...new Set(slots.map(s => timeOf(s.start, tz)))].sort(), [slots, tz]);
  const cell = useMemo(() => { const m = {}; slots.forEach(s => { m[`${dateKey(s.start, tz)}|${timeOf(s.start, tz)}`] = s; }); return m; }, [slots, tz]);
  const today = todayKey(tz);

  return (
    <div className="card overflow-hidden" data-testid="week-agenda">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex gap-1">
          <button type="button" className="btn-ghost p-1.5" onClick={() => setStart(addDays(start, -7))} aria-label={t('equipment.prevWeek')}><ChevronLeft className="w-4 h-4" /></button>
          <button type="button" className="btn-ghost p-1.5" onClick={() => setStart(addDays(start, 7))} aria-label={t('equipment.nextWeek')}><ChevronRight className="w-4 h-4" /></button>
          <button type="button" className="btn-ghost text-xs px-2" onClick={() => setStart(weekStart(today))}>{t('equipment.thisWeek')}</button>
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{dayLabel(days[0], { day: '2-digit', month: 'short' })} – {dayLabel(days[6], { day: '2-digit', month: 'short', year: 'numeric' })}</span>
      </div>
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-center" style={muted}>{loading ? t('common.loading') : t('equipment.agendaEmpty')}</p>
      ) : (
        <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
          <table className="text-xs border-separate" style={{ borderSpacing: 2, minWidth: 720, width: '100%' }}>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 px-2 py-1" style={{ background: 'var(--bg-elevated)' }} />
                {days.map(d => (
                  <th key={d} className="sticky top-0 z-10 px-2 py-1.5 font-medium capitalize" style={{ background: 'var(--bg-elevated)', color: d === today ? 'var(--text-accent)' : 'var(--text-secondary)' }}>
                    {dayLabel(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r}>
                  <td className="sticky left-0 z-10 px-2 py-1 text-right font-mono" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{r}</td>
                  {days.map(d => <Cell key={d} s={cell[`${d}|${r}`]} onPickFree={onPickFree} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-4 px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--border)', ...muted }}>
        <Legend color="rgba(16,185,129,.25)" label={t('equipment.legend.free')} />
        <Legend color="rgba(59,130,246,.35)" label={t('equipment.legend.busy')} />
        <Legend color="rgba(168,85,247,.35)" label={t('equipment.legend.mine')} />
        <Legend color="rgba(245,158,11,.30)" label={t('equipment.legend.pending')} />
        <Legend color="rgba(148,163,184,.25)" label={t('equipment.legend.blocked')} />
      </div>
    </div>
  );
}

const Legend = ({ color, label }) => <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: color }} />{label}</span>;

function Cell({ s, onPickFree }) {
  const { t } = useTranslation();
  if (!s) return <td style={{ background: 'transparent' }} />;
  const base = { height: 30, borderRadius: 6, padding: '0 6px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 110 };
  if (s.state === 'free') {
    return (
      <td style={{ padding: 0 }}>
        <button type="button" className="w-full" data-testid="agenda-free" data-start={s.start} style={{ ...base, background: 'rgba(16,185,129,.25)', color: '#6ee7b7' }} onClick={() => onPickFree?.(s.start)}>{t('equipment.legend.free')}</button>
      </td>
    );
  }
  if (s.state === 'past') return <td style={{ ...base, background: 'rgba(148,163,184,.08)' }} />;
  if (s.state === 'blocked') {
    return <td style={{ ...base, background: 'rgba(148,163,184,.25)', color: 'var(--text-secondary)' }} title={s.reason || t('equipment.legend.blocked')}><Lock className="w-3 h-3 inline mr-1" />{s.reason || t('equipment.legend.blocked')}</td>;
  }
  const b = s.booking || {};
  const bg = b.mine ? 'rgba(168,85,247,.35)' : b.status === 'pending' ? 'rgba(245,158,11,.30)' : 'rgba(59,130,246,.35)';
  const label = b.status === 'pending' && !b.name ? t('equipment.legend.pending') : (b.name || t('equipment.legend.busy'));
  return (
    <td title={[b.name, b.institution, b.status === 'pending' ? t('equipment.legend.pending') : ''].filter(Boolean).join(' · ')} data-testid="agenda-busy"
      style={{ ...base, background: bg, color: 'var(--text-primary)' }}>
      {b.external ? '↗ ' : ''}{label}
    </td>
  );
}
