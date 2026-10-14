import React from 'react';
import { Link } from 'react-router-dom';
import {
  FlaskConical, FolderOpen, Database, Users, Cpu, BookOpen,
  Activity, TrendingUp, Clock, Zap, ArrowRight, CheckCircle2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import StatCard from '../components/ui/StatCard';
import SkeletonCard from '../components/ui/SkeletonCard';


export default function DashboardPage() {
  const { t } = useTranslation();
  const { user, isPlus, isAdmin } = useAuthStore();
  const { data: stats, loading } = useApi(() => isAdmin() ? api.admin.stats() : null, []);

  const firstName = user?.name?.split(' ')[0] || t('dashboard.defaultUserName');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('dashboard.greetingMorning') : hour < 18 ? t('dashboard.greetingAfternoon') : t('dashboard.greetingEvening');

  const quickLinks = [
    { to: '/projects', icon: FolderOpen, label: t('nav.projects'), color: 'brand', desc: t('dashboard.descProjects') },
    { to: '/datasets', icon: Database, label: t('nav.datasets'), color: 'green', desc: t('dashboard.descDatasets') },
    { to: '/workflows', icon: Cpu, label: t('nav.workflows'), color: 'purple', desc: t('dashboard.descWorkflows') },
    { to: '/communities', icon: Users, label: t('nav.communities'), color: 'amber', desc: t('dashboard.descCommunities') },
    { to: '/articles', icon: BookOpen, label: t('nav.articles'), color: 'red', desc: t('dashboard.descArticles') },
    ...(isPlus() ? [{ to: '/ai', icon: Zap, label: t('nav.ai'), color: 'blue', desc: t('dashboard.descAI'), plus: true }] : []),
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">
            {greeting}, <span className="text-blue-400">{firstName}</span> 👋
          </h1>
          <p className="text-slate-400">{t('dashboard.heroSubtitle')}</p>
        </div>
        {isPlus() && (
          <div className="badge badge-plus flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> PLUS
          </div>
        )}
      </div>

      {/* Admin stats */}
      {isAdmin() && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('dashboard.systemOverview')}</h2>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label={t('admin.usersSection')} value={stats.users?.total ?? '–'} color="brand" />
              <StatCard icon={FolderOpen} label={t('nav.projects')} value={stats.workflows ?? '–'} color="green" />
              <StatCard icon={Database} label={t('nav.datasets')} value={stats.datasets ?? '–'} color="purple" />
              <StatCard icon={Activity} label={t('dashboard.activeJobs')} value={stats.jobs?.running ?? '–'} sub={t('dashboard.pendingSub', { count: stats.jobs?.pending ?? 0 })} color="amber" />
            </div>
          ) : null}
        </div>
      )}

      {/* Quick access */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('dashboard.quickAccess')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {quickLinks.map(({ to, icon: Icon, label, color, desc, plus }) => (
            <Link key={to} to={to}>
              <div
                className="card card-hover p-5 flex flex-col gap-3 group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${color === 'brand' ? 'blue' : color}-500/20`}>
                    <Icon className={`w-5 h-5 text-${color === 'brand' ? 'blue' : color}-400`} />
                  </div>
                  {plus && <span className="badge badge-plus text-xs">PLUS</span>}
                </div>
                <div>
                  <div className="font-semibold text-white text-sm">{label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Activity feed placeholder */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('dashboard.recentActivity')}</h2>
        <div className="card p-6">
          <div className="space-y-4">
            {[
              { icon: CheckCircle2, text: t('dashboard.activitySystemInit'), time: t('dashboard.timeNow'), color: 'green' },
              { icon: FlaskConical, text: t('common.welcome'), time: t('dashboard.timeToday'), color: 'blue' },
              { icon: TrendingUp, text: t('dashboard.activityReady'), time: t('dashboard.timeToday'), color: 'purple' },
            ].map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-3"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${a.color}-500/20 flex-shrink-0`}>
                  <a.icon className={`w-4 h-4 text-${a.color}-400`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300">{a.text}</p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {a.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
