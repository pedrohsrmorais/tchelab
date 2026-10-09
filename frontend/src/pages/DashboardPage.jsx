import React from 'react';
import { Link } from 'react-router-dom';
import {
  FlaskConical, FolderOpen, Database, Users, Cpu, BookOpen,
  Activity, TrendingUp, Clock, Zap, ArrowRight, CheckCircle2
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import StatCard from '../components/ui/StatCard';
import SkeletonCard from '../components/ui/SkeletonCard';


export default function DashboardPage() {
  const { user, isPlus, isAdmin } = useAuthStore();
  const { data: stats, loading } = useApi(() => isAdmin() ? api.admin.stats() : null, []);

  const firstName = user?.name?.split(' ')[0] || 'Usuário';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const quickLinks = [
    { to: '/projects', icon: FolderOpen, label: 'Projetos', color: 'brand', desc: 'Gerencie seus projetos' },
    { to: '/datasets', icon: Database, label: 'Datasets', color: 'green', desc: 'Seus conjuntos de dados' },
    { to: '/workflows', icon: Cpu, label: 'Workflows', color: 'purple', desc: 'Pipelines analíticos' },
    { to: '/communities', icon: Users, label: 'Comunidades', color: 'amber', desc: 'Colabore com outros' },
    { to: '/articles', icon: BookOpen, label: 'Artigos', color: 'red', desc: 'Base científica' },
    ...(isPlus() ? [{ to: '/ai', icon: Zap, label: 'IA', color: 'blue', desc: 'Análise inteligente', plus: true }] : []),
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">
            {greeting}, <span className="text-blue-400">{firstName}</span> 👋
          </h1>
          <p className="text-slate-400">Bem-vindo ao seu painel de análises quimiométricas.</p>
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
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Visão Geral do Sistema</h2>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Usuários" value={stats.users?.total ?? '–'} color="brand" />
              <StatCard icon={FolderOpen} label="Projetos" value={stats.workflows ?? '–'} color="green" />
              <StatCard icon={Database} label="Datasets" value={stats.datasets ?? '–'} color="purple" />
              <StatCard icon={Activity} label="Jobs Ativos" value={stats.jobs?.running ?? '–'} sub={`${stats.jobs?.pending ?? 0} pendentes`} color="amber" />
            </div>
          ) : null}
        </div>
      )}

      {/* Quick access */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Acesso Rápido</h2>
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
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Atividade Recente</h2>
        <div className="card p-6">
          <div className="space-y-4">
            {[
              { icon: CheckCircle2, text: 'Sistema inicializado com sucesso', time: 'agora', color: 'green' },
              { icon: FlaskConical, text: 'Bem-vindo ao TcheLab', time: 'hoje', color: 'blue' },
              { icon: TrendingUp, text: 'Plataforma pronta para análises', time: 'hoje', color: 'purple' },
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
