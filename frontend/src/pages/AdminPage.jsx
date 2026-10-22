import React, { useState } from 'react';
import { Shield, Users, Activity, Database, Cpu, HardDrive, FileText, Search, RefreshCw, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import StatCard from '../components/ui/StatCard';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';
import AdminStoragePanel from '../components/storage/AdminStoragePanel';


function Tab({ active, onClick, children }) {
  return <button onClick={onClick} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>{children}</button>;
}

export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState('stats');
  const [auditSearch, setAuditSearch] = useState('');
  const { data: stats, loading: loadingStats, refetch: refetchStats } = useApi(api.admin.stats, []);
  const { data: logs, loading: loadingLogs } = useApi(api.audit.list, []);

  const s = stats?.data ?? stats;
  const logsList = (logs?.data ?? logs ?? []).filter(l =>
    l.action?.toLowerCase().includes(auditSearch.toLowerCase()) ||
    l.user_email?.toLowerCase().includes(auditSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{t('admin.title')}</h1>
            <p className="text-slate-400 text-sm">{t('admin.subtitle')}</p>
          </div>
        </div>
        <button onClick={refetchStats} className="btn-ghost flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> {t('admin.refresh')}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Tab active={tab === 'stats'} onClick={() => setTab('stats')}><Activity className="w-4 h-4 inline mr-1.5" />{t('admin.statsTab')}</Tab>
        <Tab active={tab === 'audit'} onClick={() => setTab('audit')}><FileText className="w-4 h-4 inline mr-1.5" />{t('admin.auditTab')}</Tab>
        <Tab active={tab === 'storage'} onClick={() => setTab('storage')}><HardDrive className="w-4 h-4 inline mr-1.5" />{t('storage.title')}</Tab>
      </div>

      {tab === 'stats' && (
        <div className="space-y-6">
          {loadingStats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array(8).fill(0).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : s ? (
            <>
              <div>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('admin.usersSection')}</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <StatCard icon={Users} label={t('admin.total')} value={s.users?.total ?? '–'} color="brand" />
                  <StatCard icon={Users} label={t('admin.deleted')} value={s.users?.deleted ?? '–'} color="red" />
                </div>
              </div>
              <div>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('admin.contentSection')}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard icon={Cpu} label={t('nav.workflows')} value={s.workflows ?? '–'} color="purple" />
                  <StatCard icon={Database} label={t('nav.datasets')} value={s.datasets ?? '–'} color="blue" />
                  <StatCard icon={FileText} label={t('nav.articles')} value={s.articles ?? '–'} color="red" />
                </div>
              </div>
              <div>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('admin.jobsSection')}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard icon={Activity} label={t('jobs.pending')} value={s.jobs?.pending ?? '–'} color="amber" />
                  <StatCard icon={Activity} label={t('admin.running')} value={s.jobs?.running ?? '–'} color="blue" animationDelay={100} />
                  <StatCard icon={Activity} label={t('admin.completed')} value={s.jobs?.completed ?? '–'} color="green" animationDelay={200} />
                  <StatCard icon={Activity} label={t('admin.failed')} value={s.jobs?.failed ?? '–'} color="red" animationDelay={300} />
                </div>
              </div>
            </>
          ) : (
            <EmptyState icon={Activity} title={t('admin.statsUnavailableTitle')} description={t('admin.statsUnavailableDesc')} />
          )}
        </div>
      )}

      {tab === 'storage' && <AdminStoragePanel />}

      {tab === 'audit' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input className="input-field pl-10" placeholder={t('admin.searchLogsPlaceholder')} value={auditSearch} onChange={e => setAuditSearch(e.target.value)} />
          </div>
          {loadingLogs ? (
            <div className="space-y-2">{Array(8).fill(0).map((_, i) => <SkeletonCard key={i} className="h-14" />)}</div>
          ) : logsList.length === 0 ? (
            <EmptyState icon={FileText} title={t('admin.noAuditLogsTitle')} description={auditSearch ? t('admin.noAuditLogsWithSearch') : t('admin.noAuditLogsEmpty')} />
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'rgba(30, 58, 138, 0.2)' }}>
                      <th className="px-4 py-3 text-left text-blue-300 font-medium">{t('admin.colAction')}</th>
                      <th className="px-4 py-3 text-left text-blue-300 font-medium">{t('admin.colResource')}</th>
                      <th className="px-4 py-3 text-left text-blue-300 font-medium">{t('admin.colUser')}</th>
                      <th className="px-4 py-3 text-left text-blue-300 font-medium">{t('admin.colDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsList.map((l, i) => (
                      <tr key={l.id}
                        className="border-t border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-blue-300">{l.action}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{l.resource_type}</td>
                        <td className="px-4 py-3 text-slate-300 text-xs">{l.user_email}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{new Date(l.created_at).toLocaleString(i18n.language)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
