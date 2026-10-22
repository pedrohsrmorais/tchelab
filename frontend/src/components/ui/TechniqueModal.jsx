import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Cog, Lightbulb, Copy, Check, ArrowRight } from 'lucide-react';
import {
  Hammer, SealCheck, SignIn, SignOut, SlidersHorizontal, ClockCounterClockwise, Info, ArrowSquareOut, FlowArrow,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import FamilyIcon from './FamilyIcon';
import { getFamilyConfig, getPorts } from '../../config/techniqueRegistry';
import { portTypeKey } from '../catalog/catalogUtils';
import '../catalog/catalog.css';

function safeJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function StatusChip({ active }) {
  const { t } = useTranslation();
  return active
    ? <span className="cat-chip ok"><SealCheck size={13} weight="fill" aria-hidden /> {t('catalog.activeBeta')}</span>
    : <span className="cat-chip dev" title={t('catalog.devHint')}><Hammer size={13} weight="fill" aria-hidden /> {t('catalog.inDevelopment')}</span>;
}

function CopyId({ value }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return undefined; const id = setTimeout(() => setDone(false), 1500); return () => clearTimeout(id); }, [done]);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setDone(true); } catch { /* sem permissão de área de transferência */ } };
  return (
    <button type="button" className="btn-ghost inline-flex items-center gap-1.5" style={{ padding: '2px 6px', fontSize: '0.72rem' }} onClick={copy}
      title={t('catalog.copyId')} aria-label={`${t('catalog.copyId')}: ${value}`}>
      <code style={{ fontFamily: 'var(--font-mono)' }}>{value}</code>
      {done ? <><Check className="w-3 h-3" aria-hidden /><span role="status">{t('catalog.copied')}</span></> : <Copy className="w-3 h-3" aria-hidden />}
    </button>
  );
}

function Block({ icon: Icon, title, children, color }) {
  return (
    <section className="cat-block">
      <h3><Icon size={16} weight="duotone" style={{ color: color || 'var(--text-accent)' }} aria-hidden /> {title}</h3>
      <div className="cat-prose">{children}</div>
    </section>
  );
}

function PortList({ title, icon: Icon, ports, accent }) {
  const { t } = useTranslation();
  return (
    <div>
      <h4 className="flex items-center gap-1.5" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', margin: '0 0 8px' }}>
        <Icon size={14} weight="bold" aria-hidden /> {title}
      </h4>
      {!ports.length ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{t('catalog.noPortsDocumented')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {ports.map((p) => (
            <div key={p.name} className="cat-port">
              <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 3 }}>
                <code className="cat-code" style={{ background: `${accent}22`, color: accent }}>{p.name}</code>
                <span className="cat-chip" style={{ fontSize: '0.68rem' }}>{t(portTypeKey(p.type))}</span>
                {p.required === false && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('catalog.optional')}</span>}
                {p.shape && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>shape {p.shape}</span>}
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: p.description ? 'var(--text-secondary)' : 'var(--text-muted)', fontStyle: p.description ? 'normal' : 'italic' }}>
                {p.description || t('catalog.noDescriptionYet')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const fmtDefault = (v) => (v === null || v === undefined ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function ParamList({ schema }) {
  const { t } = useTranslation();
  const entries = Object.entries(schema || {});
  if (!entries.length) return <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>{t('catalog.noParameters')}</p>;
  return (
    <div className="flex flex-col gap-2">
      {entries.map(([name, def]) => {
        const d = def || {};
        const options = Array.isArray(d.enum) ? d.enum : Array.isArray(d.options) ? d.options : null;
        return (
          <div key={name} className="cat-port">
            <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: d.description ? 3 : 0 }}>
              <code className="cat-code" style={{ background: 'var(--bg-hover)', color: 'var(--text-accent)' }}>{name}</code>
              {d.type && <span className="cat-chip" style={{ fontSize: '0.68rem' }}>{d.type}</span>}
              {'default' in d && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('catalog.defaultValue')}: <code style={{ fontFamily: 'var(--font-mono)' }}>{fmtDefault(d.default)}</code></span>}
              {options && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>[{options.join(' | ')}]</span>}
            </div>
            {d.description && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d.description}</p>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * TechniqueDetails — documentação de uma técnica em abas (visão geral, entradas/saídas,
 * parâmetros, notas). Usado pelo modal rápido e pela página /catalogo/:uuid.
 */
export function TechniqueDetails({ technique: tech, showFullLink = true, onNavigate }) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState('overview');
  useEffect(() => { setTab('overview'); }, [tech?.uuid]);
  if (!tech) return null;

  const lang = String(i18n.language || 'pt').slice(0, 2);
  const fam = getFamilyConfig(tech.family, lang);
  const inputs = getPorts(tech.input_schema);
  const outputs = getPorts(tech.output_schema);
  const tags = safeJson(tech.tags, []) || [];
  const params = safeJson(tech.parameter_schema, {}) || {};
  const paramCount = Object.keys(params).length;
  const hasDocs = !!(tech.how_it_works || tech.usage_tips);

  const tabs = [
    ['overview', t('catalog.tab.overview'), Info, null],
    ['io', t('catalog.tab.io'), FlowArrow, inputs.length + outputs.length],
    ['params', t('catalog.tab.params'), SlidersHorizontal, paramCount],
    ['notes', t('catalog.tab.notes'), ClockCounterClockwise, null],
  ];
  const onKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex(([k]) => k === tab);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length][0];
    setTab(n); e.preventDefault();
    requestAnimationFrame(() => document.getElementById(`tech-tab-${n}`)?.focus());
  };

  return (
    <div className="flex flex-col gap-4" data-testid="technique-details">
      <header className="flex items-start gap-3" style={{ paddingRight: 32 }}>
        <FamilyIcon family={tech.family} color={fam.color} bg={fam.bg} size={48} />
        <div className="min-w-0 flex-1">
          <p style={{ margin: 0, fontSize: '0.74rem', fontWeight: 600, color: fam.color }}>{fam.labelStr || tech.family}</p>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 6px', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{tech.name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip active={!!tech.active} />
            <CopyId value={tech.slug} />
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Link to="/workflows" onClick={onNavigate} className="btn-primary inline-flex items-center gap-2" style={{ textDecoration: 'none' }} data-testid="use-in-workflow">
          <FlowArrow size={16} weight="bold" aria-hidden /> {t('catalog.useInWorkflow')}
        </Link>
        {showFullLink && tech.uuid && (
          <Link to={`/catalogo/${tech.uuid}`} onClick={onNavigate} className="btn-outline inline-flex items-center gap-2" style={{ textDecoration: 'none' }}>
            <ArrowSquareOut size={16} aria-hidden /> {t('catalog.openPage')}
          </Link>
        )}
      </div>

      <div className="cat-tabs" role="tablist" aria-label={tech.name} onKeyDown={onKey}>
        {tabs.map(([k, label, Icon, n]) => (
          <button key={k} id={`tech-tab-${k}`} type="button" role="tab" aria-selected={tab === k} aria-controls={`tech-panel-${k}`} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>
            <Icon size={15} aria-hidden /> {label}{n ? <span className="cat-n">{n}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`tech-panel-${tab}`} aria-labelledby={`tech-tab-${tab}`} className="flex flex-col gap-3">
        {tab === 'overview' && (
          <>
            <Block icon={BookOpen} title={t('catalog.whatIsIt')}>{tech.description || t('catalog.noDescriptionRegistered')}</Block>
            {tech.how_it_works && <Block icon={Cog} title={t('catalog.howItWorks')} color="#a78bfa">{tech.how_it_works}</Block>}
            {tech.usage_tips && <Block icon={Lightbulb} title={t('catalog.usageTips')} color="#f59e0b">{tech.usage_tips}</Block>}
            {!hasDocs && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('catalog.devNoDocs')}</p>}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => <span key={tag} className="cat-chip">#{tag}</span>)}
              </div>
            )}
          </>
        )}
        {tab === 'io' && (
          <div className="cat-block flex flex-col gap-4">
            <PortList title={t('catalog.expectedInput')} icon={SignIn} ports={inputs} accent="#3b82f6" />
            <PortList title={t('catalog.producedOutput')} icon={SignOut} ports={outputs} accent="#16a34a" />
          </div>
        )}
        {tab === 'params' && <ParamList schema={params} />}
        {tab === 'notes' && (tech.historical_note
          ? <Block icon={ClockCounterClockwise} title={t('catalog.historicalNote')} color="#f59e0b">{tech.historical_note}</Block>
          : <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('catalog.noNotes')}</p>)}
      </div>
    </div>
  );
}

export default function TechniqueModal({ open, onClose, technique: tech }) {
  if (!tech) return null;
  return (
    <Modal open={open} onClose={onClose} size="lg">
      <TechniqueDetails technique={tech} onNavigate={onClose} />
    </Modal>
  );
}
