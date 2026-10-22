import React, { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { formatBytes, formatCpu } from '../../utils/bytes';
import { UsageBar } from './StorageMeter';

const unwrap = (r) => r?.data?.data ?? r?.data ?? r;

/** "Processamento deste mês": jobs, tempo de CPU (com o orçamento do plano) e pico de memória. */
export default function ComputeUsage() {
  const { t, i18n } = useTranslation();
  const lang = String(i18n.language).slice(0, 2);
  const [d, setD] = useState(null);
  useEffect(() => { api.storage.compute().then((r) => setD(unwrap(r))).catch(() => {}); }, []);
  if (!d) return null;
  const c = d.current;
  const budget = d.cpu_budget_seconds;
  const pct = budget ? Math.min(100, (c.cpu_seconds / budget) * 100) : 0;
  const level = pct >= 100 ? 'full' : pct >= 95 ? 'critical' : pct >= 80 ? 'warning' : 'ok';
  return (
    <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
      <h3 style={{ marginBottom: 4, fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Cpu size={14} aria-hidden="true" /> {t('storage.compute.title')}
      </h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>{t('storage.compute.hint')}</p>
      <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        {formatCpu(c.cpu_seconds, lang)}
        {budget ? <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}> {t('storage.compute.ofBudget', { budget: formatCpu(budget, lang) })}</span> : null}
      </p>
      {level === 'full' && <p role="alert" style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 600, color: '#ef4444' }}>{t('storage.compute.blocked')}</p>}
      {budget ? <div style={{ marginTop: 6 }}><UsageBar usage={{ percent: pct, level, used: c.cpu_seconds }} height={8} /></div> : null}
      <p style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        {t('storage.compute.summary', { jobs: c.jobs, failed: c.jobs_failed, mem: formatBytes(c.peak_rss_max_bytes, lang) })}
      </p>
    </div>
  );
}
