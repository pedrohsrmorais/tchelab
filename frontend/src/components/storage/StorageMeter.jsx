import React from 'react';
import { Link } from 'react-router-dom';
import { HardDrive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStorageStore, LEVEL_COLOR } from '../../store/storage';
import { formatBytes } from '../../utils/bytes';

/** Barra de uso. `compact` = só a barra (sidebar recolhida). */
export function UsageBar({ usage, height = 6 }) {
  const color = LEVEL_COLOR[usage?.level] || LEVEL_COLOR.ok;
  const pct = Math.max(usage?.used || usage?.reserved ? 1 : 0, Math.min(100, usage?.percent || 0));
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usage?.percent || 0)}
      style={{ height, borderRadius: 999, background: 'var(--bg-hover)', overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .4s ease' }} />
    </div>
  );
}

/** Medidor da Sidebar: "12,3 MB de 100 MB" + barra; muda de cor perto do limite. */
export default function StorageMeter({ collapsed }) {
  const { t, i18n } = useTranslation();
  const usage = useStorageStore((s) => s.usage);
  if (!usage) return null;
  const lang = String(i18n.language).slice(0, 2);
  const total = usage.used + usage.reserved;
  const label = t('storage.meterLabel', { used: formatBytes(total, lang), quota: formatBytes(usage.quota, lang) });
  const warn = usage.level !== 'ok';

  if (collapsed) {
    return (
      <Link to="/profile?tab=storage" title={label} aria-label={label} style={{ display: 'flex', justifyContent: 'center', padding: '0 0.75rem 0.5rem' }}>
        <div style={{ width: '100%' }}><UsageBar usage={usage} height={5} /></div>
      </Link>
    );
  }
  return (
    <Link to="/profile?tab=storage" title={t('storage.meterOpen')} style={{ display: 'block', textDecoration: 'none', padding: '0.5rem 0.75rem', margin: '0 0.5rem 0.375rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        <HardDrive size={12} aria-hidden="true" />
        <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('storage.title')}</span>
        {warn && <span style={{ marginLeft: 'auto', color: LEVEL_COLOR[usage.level], fontWeight: 700 }}>{Math.round(usage.percent)}%</span>}
      </div>
      <UsageBar usage={usage} />
      <p style={{ marginTop: 5, fontSize: '0.68rem', color: warn ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</p>
    </Link>
  );
}
