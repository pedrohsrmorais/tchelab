import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Library, Search, ArrowRight, CheckCircle2, Hammer } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { getFamiliesList, getFamilyConfig } from '../config/techniqueRegistry';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';

// Busca tudo (ativas + "em desenvolvimento") — o Catálogo é a documentação
// completa, diferente do editor de workflow (que só lista active=1).
// limit=200 cobre as ~198 técnicas (teto definido em utils/response.js).
const fetchAll = () => api.techniques.list({ include_inactive: 'true', limit: 200 });

function StatusBadge({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300">
      <CheckCircle2 className="w-3 h-3" /> Ativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300">
      <Hammer className="w-3 h-3" /> Em desenvolvimento
    </span>
  );
}

function TechniqueCard({ tech }) {
  const fam = getFamilyConfig(tech.family);
  return (
    <Link
      to={`/catalogo/${tech.uuid}`}
      className="card card-hover p-5 flex flex-col gap-3 group"
      style={{ borderLeft: `3px solid ${fam?.color || '#64748b'}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-white leading-snug">{tech.name}</h3>
        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
      </div>
      <p className="text-sm text-slate-400 line-clamp-2">{tech.description || 'Sem descrição.'}</p>
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className="text-xs" style={{ color: fam?.color || '#94a3b8' }}>{fam?.labelStr || tech.family}</span>
        <StatusBadge active={!!tech.active} />
      </div>
    </Link>
  );
}

export default function CatalogPage() {
  const { data, loading } = useApi(fetchAll, []);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | dev
  const [familyFilter, setFamilyFilter] = useState('all');

  const all = useMemo(() => data?.data ?? data ?? [], [data]);
  const families = useMemo(() => getFamiliesList(), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((t) => {
      if (t.is_custom) return false; // catálogo documenta as técnicas nativas, não as customizadas de cada usuário
      if (statusFilter === 'active' && !t.active) return false;
      if (statusFilter === 'dev' && t.active) return false;
      if (familyFilter !== 'all' && t.family !== familyFilter) return false;
      if (q && !(t.name?.toLowerCase().includes(q) || t.slug?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [all, search, statusFilter, familyFilter]);

  const grouped = useMemo(() => {
    const g = {};
    for (const t of filtered) {
      (g[t.family] ??= []).push(t);
    }
    return g;
  }, [filtered]);

  const activeCount = all.filter((t) => !t.is_custom && t.active).length;
  const devCount = all.filter((t) => !t.is_custom && !t.active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Library className="w-6 h-6 text-blue-400" /> Catálogo de Técnicas
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeCount} ativas nesta versão beta · {devCount} em desenvolvimento
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input-field pl-10"
            placeholder="Buscar por nome, slug ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field sm:w-52" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todos os status</option>
          <option value="active">Só ativas</option>
          <option value="dev">Só em desenvolvimento</option>
        </select>
        <select className="input-field sm:w-64" value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)}>
          <option value="all">Todas as famílias</option>
          {families.map((f) => (
            <option key={f.slug} value={f.slug}>{f.labelStr}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(9).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Library} title="Nenhuma técnica encontrada" description="Tente outro termo ou filtro." />
      ) : (
        <div className="space-y-8">
          {families
            .filter((f) => grouped[f.slug]?.length)
            .map((f) => (
              <div key={f.slug}>
                <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: f.color }}>
                  {f.labelStr} <span className="text-slate-500 font-normal">({grouped[f.slug].length})</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grouped[f.slug]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((t) => <TechniqueCard key={t.uuid} tech={t} />)}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
