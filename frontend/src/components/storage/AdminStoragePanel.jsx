import React, { useCallback, useEffect, useState } from 'react';
import { Save, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { formatBytes } from '../../utils/bytes';
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
  const [busy, setBusy] = useState(false);
  const dirty = Number(q) !== Math.round(plan.quota_bytes / MB) || Number(f) !== Math.round(plan.max_file_bytes / MB);
  const save = async () => {
    setBusy(true);
    try {
      await api.storage.updatePlan(plan.code, { quota_bytes: Math.round(Number(q) * MB), max_file_bytes: Math.round(Number(f) * MB) });
      toast.success(t('storage.admin.planSaved')); onSaved();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td className="px-3 py-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{plan.name} {plan.is_default ? <span className="badge" style={{ fontSize: '0.6rem' }}>{t('storage.admin.default')}</span> : null}</td>
      <td className="px-3 py-2"><input type="number" min="1" className="input-field" style={{ width: 96 }} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('storage.admin.quotaMb')} /></td>
      <td className="px-3 py-2"><input type="number" min="1" className="input-field" style={{ width: 96 }} value={f} onChange={(e) => setF(e.target.value)} aria-label={t('storage.admin.fileMb')} /></td>
      <td className="px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>{plan.users}</td>
      <td className="px-3 py-2 text-right"><button type="button" className="btn-primary" disabled={!dirty || busy} onClick={save} style={{ padding: '0.35rem 0.7rem' }}><Save size={14} className="inline mr-1" />{t('common.save')}</button></td>
    </tr>
  );
}

function UserRow({ u, plans, lang, onSaved }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState(u.plan);
  const [custom, setCustom] = useState(u.custom_quota ? String(Math.round(u.quota / MB)) : '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.storage.updateUser(u.uuid, { plan_code: plan, quota_bytes: custom === '' ? null : Math.round(Number(custom) * MB) });
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
      <td className="px-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <select className="input-field" style={{ width: 120 }} value={plan} onChange={(e) => setPlan(e.target.value)} aria-label={t('storage.admin.plan')}>
              {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
            <input type="number" min="1" className="input-field" style={{ width: 96 }} placeholder={t('storage.admin.customPh')} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label={t('storage.admin.customMb')} />
            <button type="button" className="btn-primary" disabled={busy} onClick={save} style={{ padding: '0.35rem 0.6rem' }}><Save size={14} /></button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)} aria-label={t('common.cancel')} style={{ padding: '0.35rem' }}><X size={14} /></button>
          </div>
        ) : (
          <span>{u.plan}{u.custom_quota ? <span className="badge badge-purple ml-1" style={{ fontSize: '0.6rem' }}>{t('storage.admin.custom')}</span> : null}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {!editing && <button type="button" className="btn-ghost" onClick={() => setEditing(true)} aria-label={t('storage.admin.edit')} style={{ padding: '0.35rem' }}><Pencil size={14} /></button>}
      </td>
    </tr>
  );
}

export default function AdminStoragePanel() {
  const { t, i18n } = useTranslation();
  const lang = String(i18n.language).slice(0, 2);
  const [ov, setOv] = useState(null);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api.storage.adminOverview(), api.storage.plans()]);
      setOv(unwrap(a)); setPlans(unwrap(b)); setError(false);
    } catch { setError(true); }
  }, []);
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
              <th className="px-3 py-2 font-medium">{t('storage.admin.fileMb')}</th><th className="px-3 py-2 font-medium">{t('storage.admin.users')}</th><th />
            </tr></thead>
            <tbody>{plans.map((p) => <PlanRow key={p.code + p.quota_bytes + p.max_file_bytes} plan={p} onSaved={load} />)}</tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <h2 className="px-4 pt-4 pb-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('storage.admin.perUser')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <th className="px-3 py-2 font-medium">{t('storage.admin.user')}</th><th className="px-3 py-2 font-medium">{t('storage.admin.usage')}</th>
              <th className="px-3 py-2 font-medium">{t('storage.admin.plan')}</th><th />
            </tr></thead>
            <tbody>{ov.users.map((u) => <UserRow key={u.uuid + u.plan + u.quota} u={u} plans={plans} lang={lang} onSaved={load} />)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
