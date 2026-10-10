import React from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Hammer, BookOpen, Lightbulb,
  Cog, LogIn, LogOut as LogOutIcon, Tag,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { getFamilyConfig, getPorts } from '../config/techniqueRegistry';
import EmptyState from '../components/ui/EmptyState';

// tags vem do banco como JSON (às vezes já desserializado pelo driver, às
// vezes como string — mesma ambiguidade tratada em WorkflowEditorPage.jsx
// via safeJson), então nunca assume que já é array.
function safeJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function StatusBadge({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-500/20 text-green-300">
      <CheckCircle2 className="w-4 h-4" /> Ativo nesta versão beta
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-amber-500/20 text-amber-300">
      <Hammer className="w-4 h-4" /> Em desenvolvimento — ainda não selecionável no editor
    </span>
  );
}

function Section({ icon: Icon, title, children, iconColor = '#60a5fa' }) {
  return (
    <div className="card p-5 space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Icon className="w-4 h-4" style={{ color: iconColor }} /> {title}
      </h2>
      <div className="text-sm text-slate-300 leading-relaxed">{children}</div>
    </div>
  );
}

function PortTable({ title, ports, accent }) {
  if (!ports.length) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
        <p className="text-sm text-slate-500">Nenhuma porta documentada.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      <div className="space-y-2">
        {ports.map((p) => (
          <div key={p.name} className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: `${accent}22`, color: accent }}>
                {p.name}
              </code>
              <span className="text-xs text-slate-500">{p.type}</span>
              {p.shape && <span className="text-xs text-slate-600">shape {p.shape}</span>}
            </div>
            {p.description ? (
              <p className="text-sm text-slate-300">{p.description}</p>
            ) : (
              <p className="text-sm text-slate-500 italic">Sem descrição ainda.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CatalogDetailPage() {
  const { id } = useParams();
  const { data, loading } = useApi(() => api.techniques.get(id), [id]);
  const tech = data?.data ?? data ?? null;

  if (loading) {
    return <div className="anim-shimmer" style={{ height: 300, borderRadius: 16 }} />;
  }
  if (!tech) {
    return <EmptyState icon={BookOpen} title="Técnica não encontrada" description="Pode ter sido removida ou o link está incorreto." />;
  }

  const fam = getFamilyConfig(tech.family);
  const inputs = getPorts(tech.input_schema);
  const outputs = getPorts(tech.output_schema);

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/catalogo" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar ao catálogo
      </Link>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: fam?.bg, color: fam?.color, border: `1px solid ${fam?.border}` }}>
            {fam?.labelStr || tech.family}
          </span>
          <code className="text-xs text-slate-500">{tech.slug}</code>
        </div>
        <h1 className="text-2xl font-bold text-white">{tech.name}</h1>
        <div className="mt-3"><StatusBadge active={!!tech.active} /></div>
      </div>

      <Section icon={BookOpen} title="O que é">
        {tech.description || 'Sem descrição cadastrada ainda.'}
      </Section>

      {tech.how_it_works && (
        <Section icon={Cog} title="Como funciona" iconColor="#a78bfa">
          {tech.how_it_works}
        </Section>
      )}

      {tech.usage_tips && (
        <Section icon={Lightbulb} title="Como usar na prática" iconColor="#facc15">
          {tech.usage_tips}
        </Section>
      )}

      <div className="card p-5 space-y-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Tag className="w-4 h-4 text-blue-400" /> Input &amp; Output
        </h2>
        <PortTable title={<span className="inline-flex items-center gap-1"><LogIn className="w-3 h-3" /> Entrada esperada</span>} ports={inputs} accent="#60a5fa" />
        <PortTable title={<span className="inline-flex items-center gap-1"><LogOutIcon className="w-3 h-3" /> Saída produzida</span>} ports={outputs} accent="#4ade80" />
      </div>

      {tech.historical_note && (
        <Section icon={Lightbulb} title="Curiosidade histórica" iconColor="#f59e0b">
          {tech.historical_note}
        </Section>
      )}

      {safeJson(tech.tags, []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {safeJson(tech.tags, []).map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400">#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
