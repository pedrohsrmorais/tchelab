import React, { useCallback, useEffect, useState } from 'react';
import { Save, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { formatBytes, formatCpu, formatMoney } from '../../utils/bytes';
import { parseApiError } from '../../utils/errors';
import { UsageBar } from './StorageMeter';

const MB = 1024 * 1024;
const unwrap = (r) => r?.data?.data ?? r?.data ?? r;
const levelOf = (p) => (p >= 100 ? 'full' : p >= 95 ? 'critical' : p >= 80 ? 'warning' : 'ok');

function Card({ label, value, sub, tone }) {
  return (
    <div className="card p-4" style={tone ? { borderColor: tone } : undefined}>
      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: tone || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

function PlanRow({ plan, onSaved }) {
  const { t } = useTranslation();
  const [q, setQ] = useState(String(Math.round(plan.quota_bytes / MB)));
  const [f, setF] = useState(String(Math.round(plan.max_file_bytes / MB)));
  const hoursOf = (p) => (p.monthly_cpu_seconds ? String(Math.round((p.monthly_cpu_seconds / 3600) * 100) / 100) : '');
  const [h, setH] = useState(hoursOf(plan));
  const [busy, setBusy] = useState(false);
  const dirty = Number(q) !== Math.round(plan.quota_bytes / MB) || Number(f) !== Math.round(plan.max_file_bytes / MB) || h !== hoursOf(plan);
  const save = async () => {
    setBusy(true);
    try {
      await api.storage.updatePlan(plan.code, { quota_bytes: Math.round(Number(q) * MB), max_file_bytes: Math.round(Number(f) * MB), ...(h !== '' ? { monthly_cpu_seconds: Math.round(Number(h) * 3600) } : {}) });
      toast.success(t('storage.admin.planSaved')); onSaved();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td className="px-3 py-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{plan.name} {plan.is_default ? <span className="badge" style={{ fontSize: '0.6rem' }}>{t('storage.admin.default')}</span> : null}</td>
      <td className="px-3 py-2"><input type="number" min="1" className="input-field" style={{ width: 96 }} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('storage.admin.quotaMb')} /></td>
      <td className="px-3 py-2"><input type="number" min="1" className="input-field" style={{ width: 96 }} value={f} onChange={(e) => setF(e.target.value)} aria-label={t('storage.admin.fileMb')} /></td>
      <td className="px-3 py-2"><input type="number" min="0.01" step="0.5" className="input-field" style={{ width: 96 }} value={h} onChange={(e) => setH(e.target.value)} aria-label={t('storage.admin.cpuHours')} /></td>
      <td className="px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>{plan.users}</td>
      <td className="px-3 py-2 text-right"><button type="button" className="btn-primary" disabled={!dirty || busy} onClick={save} style={{ padding: '0.35rem 0.7rem' }}><Save size={14} className="inline mr-1" />{t('common.save')}</button></td>
    </tr>
  );
}

function UserRow({ u, plans, lang, onSaved, currency }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState(u.plan);
  const [custom, setCustom] = useState(u.custom_quota ? String(Math.round(u.quota / MB)) : '');
  const [cpuH, setCpuH] = useState(u.custom_cpu_budget && u.cpu_budget_seconds ? String(Math.round((u.cpu_budget_seconds / 3600) * 100) / 100) : '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.storage.updateUser(u.uuid, { plan_code: plan, quota_bytes: custom === '' ? null : Math.round(Number(custom) * MB), cpu_budget_seconds: cpuH === '' ? null : Math.round(Number(cpuH) * 3600) });
      toast.success(t('storage.admin.userSaved')); setEditing(false); onSaved();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };
  const lvl = levelOf(u.percent);
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td className="px-3 py-2" style={{ minWidth: 160 }}>
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)', maxWidth: 220 }}>{u.name}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)', maxWidth: 220 }}>{u.email}</p>
      </td>
      <td className="px-3 py-2" style={{ minWidth: 150 }}>
        <UsageBar usage={{ percent: u.percent, level: lvl, used: u.used }} height={6} />
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{formatBytes(u.used, lang)} / {formatBytes(u.quota, lang)} · {Math.round(u.percent)}%</p>
      </td>
      <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
        <p style={u.cpu_budget_seconds && u.month.cpu_seconds >= u.cpu_budget_seconds ? { color: '#ef4444', fontWeight: 600 } : undefined}>{formatCpu(u.month.cpu_seconds, lang)}{u.cpu_budget_seconds ? ` / ${formatCpu(u.cpu_budget_seconds, lang)}` : ''} · {t('storage.admin.jobsN', { count: u.month.jobs })}</p>
        <p style={{ color: 'var(--text-muted)' }}>{t('storage.admin.peakMem')}: {formatBytes(u.month.peak_rss_bytes, lang)} · {formatMoney(u.month.cost.total, currency, lang)}</p>
      </td>
      <td className="px-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <select className="input-field" style={{ width: 120 }} value={plan} onChange={(e) => setPlan(e.target.value)} aria-label={t('storage.admin.plan')}>
              {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
            <input type="number" min="1" className="input-field" style={{ width: 96 }} placeholder={t('storage.admin.customPh')} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label={t('storage.admin.customMb')} />
            <input type="number" min="0.01" step="0.5" className="input-field" style={{ width: 96 }} placeholder={t('storage.admin.cpuCustomPh')} value={cpuH} onChange={(e) => setCpuH(e.target.value)} aria-label={t('storage.admin.cpuCustomH')} />
            <button type="button" className="btn-primary" disabled={busy} onClick={save} style={{ padding: '0.35rem 0.6rem' }}><Save size={14} /></button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)} aria-label={t('common.cancel')} style={{ padding: '0.35rem' }}><X size={14} /></button>
          </div>
        ) : (
          <span>{u.plan}{u.custom_quota || u.custom_cpu_budget ? <span className="badge badge-purple ml-1" style={{ fontSize: '0.6rem' }}>{t('storage.admin.custom')}</span> : null}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {!editing && <button type="button" className="btn-ghost" onClick={() => setEditing(true)} aria-label={t('storage.admin.edit')} style={{ padding: '0.35rem' }}><Pencil size={14} /></button>}
      </td>
    </tr>
  );
}

function CostCalculator({ costs, licenses, setLicenses, reload, lang }) {
  const { t } = useTranslation();
  const [gb, setGb] = useState('');
  const [cpu, setCpu] = useState('');
  const [cur, setCur] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (costs) { setGb(String(costs.prices.price_gb_month)); setCpu(String(costs.prices.price_cpu_hour)); setCur(costs.prices.currency); } }, [costs?.prices?.price_gb_month, costs?.prices?.price_cpu_hour, costs?.prices?.currency]); // eslint-disable-line
  if (!costs) return null;
  const money = (v) => formatMoney(v, costs.prices.currency, lang);
  const dirty = Number(gb) !== costs.prices.price_gb_month || Number(cpu) !== costs.prices.price_cpu_hour || cur.toUpperCase() !== costs.prices.currency;
  const save = async () => {
    setBusy(true);
    try { await api.storage.updatePrices({ price_gb_month: Number(gb), price_cpu_hour: Number(cpu), currency: cur }); toast.success(t('storage.admin.pricesSaved')); reload(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };
  const real = costs.real;
  return (
    <div className="card p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('storage.admin.calcTitle')}</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('storage.admin.calcHint')}</p>
        {costs.prices.is_default && <p className="text-xs mt-1" style={{ color: '#d97706' }}>{t('storage.admin.pricesDefault')}</p>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('storage.admin.priceGb')}
          <input type="number" min="0" step="0.001" className="input-field block mt-1" style={{ width: 120 }} value={gb} onChange={(e) => setGb(e.target.value)} /></label>
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('storage.admin.priceCpu')}
          <input type="number" min="0" step="0.01" className="input-field block mt-1" style={{ width: 120 }} value={cpu} onChange={(e) => setCpu(e.target.value)} /></label>
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('storage.admin.currency')}
          <input maxLength={3} className="input-field block mt-1" style={{ width: 80, textTransform: 'uppercase' }} value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <button type="button" className="btn-primary" disabled={!dirty || busy} onClick={save}><Save size={14} className="inline mr-1" />{t('common.save')}</button>
      </div>
      <div>
        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('storage.admin.licenses')}
          <input type="number" min="1" className="input-field block mt-1" style={{ width: 120 }} value={licenses}
            onChange={(e) => setLicenses(e.target.value)} onBlur={() => reload()} onKeyDown={(e) => { if (e.key === 'Enter') reload(); }} /></label>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <th className="px-3 py-2 font-medium">{t('storage.admin.plan')}</th><th className="px-3 py-2 font-medium">{t('storage.admin.ceilingUser')}</th>
              <th className="px-3 py-2 font-medium">{t('storage.admin.storageCost')}</th><th className="px-3 py-2 font-medium">{t('storage.admin.computeCost')}</th>
              <th className="px-3 py-2 font-medium">{t('storage.admin.ceilingLicenses', { count: costs.licenses })}</th>
            </tr></thead>
            <tbody>{costs.plans.map((p) => (
              <tr key={p.code} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{p.name}</td>
                <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{money(p.per_user.total)}</td>
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{formatBytes(p.per_user.quota_gb * 1024 ** 3, lang)} → {money(p.per_user.storage)}</td>
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{p.per_user.cpu_hours} h → {money(p.per_user.compute)}</td>
                <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{money(p.for_licenses)}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{t('storage.admin.ceilingNote')}</p>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(11rem, 100%), 1fr))' }}>
        <Card label={t('storage.admin.realMonth')} value={money(real.total.total)} sub={`${real.active_users} ${t('storage.admin.activeUsers')} · ${real.jobs} jobs`} />
        <Card label={t('storage.admin.realPerUser')} value={money(real.per_active_user)} sub={t('storage.admin.realPerUserHint')} />
        <Card label={t('storage.admin.projection')} value={real.projected_month_total != null ? money(real.projected_month_total) : '—'} sub={t('storage.admin.projectionHint')} />
        <Card label={t('storage.admin.ramMonth')} value={`${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(real.gb_seconds_ram / 3600)} GB·h`} sub={t('storage.admin.ramHint')} />
      </div>
    </div>
  );
}

export default function AdminStoragePanel() {
  const { t, i18n } = useTranslation();
  const lang = String(i18n.language).slice(0, 2);
  const [ov, setOv] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState(false);
  const [costs, setCosts] = useState(null);
  const [licenses, setLicenses] = useState('10');
  const loadCosts = useCallback(async (n) => {
    try { setCosts(unwrap(await api.storage.costs(Math.max(1, Number(n) || 1)))); } catch { /* calculadora é complementar */ }
  }, []);
  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api.storage.adminOverview(), api.storage.plans()]);
      setOv(unwrap(a)); setPlans(unwrap(b)); setError(false);
    } catch { setError(true); }
    loadCosts(licenses);
  }, [licenses, loadCosts]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p role="alert" style={{ color: '#ef4444' }}>{t('common.error')}</p>;
  if (!ov) return <p style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</p>;

  const over = ov.overcommit_ratio;
  return (
    <div className="space-y-6">
      {ov.server_full && (
        <div role="alert" className="card p-4" style={{ borderColor: '#ef4444' }}>
          <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>{t('storage.admin.serverFull')}</p>
        </div>
      )}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(11rem, 100%), 1fr))' }}>
        <Card label={t('storage.admin.capacity')} value={ov.capacity_bytes ? formatBytes(ov.capacity_bytes, lang) : '—'} sub={`${t('storage.admin.driver')}: ${ov.driver}`} />
        <Card label={t('storage.admin.allocated')} value={formatBytes(ov.allocated_bytes, lang)} sub={t('storage.admin.allocatedHint')} />
        <Card label={t('storage.admin.used')} value={formatBytes(ov.used_bytes, lang)} sub={ov.allocated_bytes ? `${Math.round((ov.used_bytes / ov.allocated_bytes) * 100)}% ${t('storage.admin.ofAllocated')}` : null} />
        <Card label={t('storage.admin.overcommit')} value={over != null ? `${new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(over)}×` : '—'} sub={t('storage.admin.overcommitHint')} tone={over != null && over > 1 ? '#d97706' : undefined} />
      </div>

      <div className="card overflow-hidden">
        <h2 className="px-4 pt-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('storage.admin.plans')}</h2>
        <p className="px-4 pb-2 text-xs" style={{ color: 'var(--text-muted)' }}>{t('storage.admin.plansHint')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <th className="px-3 py-2 font-medium">{t('storage.admin.plan')}</th><th className="px-3 py-2 font-medium">{t('storage.admin.quotaMb')}</th>
              <th className="px-3 py-2 font-medium">{t('storage.admin.fileMb')}</th><th className="px-3 py-2 font-medium">{t('storage.admin.cpuHours')}</th><th className="px-3 py-2 font-medium">{t('storage.admin.users')}</th><th />
            </tr></thead>
            <tbody>{plans.map((p) => <PlanRow key={p.code + p.quota_bytes + p.max_file_bytes} plan={p} onSaved={load} />)}</tbody>
          </table>
        </div>
      </div>

      <CostCalculator costs={costs} licenses={licenses} setLicenses={setLicenses} reload={load} lang={lang} />

      <div className="card overflow-hidden">
        <h2 className="px-4 pt-4 pb-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('storage.admin.perUser')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <th className="px-3 py-2 font-medium">{t('storage.admin.user')}</th><th className="px-3 py-2 font-medium">{t('storage.admin.usage')}</th>
              <th className="px-3 py-2 font-medium">{t('storage.admin.monthUsage')}</th><th className="px-3 py-2 font-medium">{t('storage.admin.plan')}</th><th />
            </tr></thead>
            <tbody>{ov.users.map((u) => <UserRow key={u.uuid + u.plan + u.quota} u={u} plans={plans} lang={lang} onSaved={load} currency={costs?.prices?.currency || 'USD'} />)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
