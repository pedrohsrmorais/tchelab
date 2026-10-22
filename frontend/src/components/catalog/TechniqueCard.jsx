import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import { Hammer } from '@phosphor-icons/react';
import FamilyIcon from '../ui/FamilyIcon';
import { getFamilyConfig } from '../../config/techniqueRegistry';
import { subcategoryKey } from '../../config/techniqueSections';
import { typesOf, portTypeKey, highlight } from './catalogUtils';

/** Resumo "entra → sai" com os tipos de dado da técnica (ex.: Matriz → Modelo). */
export function Flow({ tech }) {
  const { t } = useTranslation();
  const ins = typesOf(tech.input_schema); const outs = typesOf(tech.output_schema);
  if (!ins.length && !outs.length) return null;
  const label = (list) => list.slice(0, 2).map((x) => t(portTypeKey(x))).join(' + ') + (list.length > 2 ? '…' : '');
  return (
    <span className="cat-flow" title={`${t('catalog.flowIn')}: ${ins.map((x) => t(portTypeKey(x))).join(', ') || '—'} → ${t('catalog.flowOut')}: ${outs.map((x) => t(portTypeKey(x))).join(', ') || '—'}`}>
      <span>{ins.length ? label(ins) : '—'}</span><ArrowRight className="w-3 h-3" aria-hidden /><span>{outs.length ? label(outs) : '—'}</span>
    </span>
  );
}

function DevChip() {
  const { t } = useTranslation();
  return <span className="cat-chip dev" title={t('catalog.devHint')}><Hammer size={12} weight="fill" aria-hidden /> {t('catalog.inDevelopment')}</span>;
}

function famVars(fam) {
  return { '--fam': fam.color, '--fam-ring': `${fam.color}40`, '--fam-bg': fam.bg, '--fam-border': fam.border };
}

/** Cartão de técnica: o título é o botão principal (abre a visão rápida) e cobre o cartão todo. */
export function TechniqueCard({ tech, query, onOpen }) {
  const { t } = useTranslation();
  const fam = getFamilyConfig(tech.family);
  const subKey = subcategoryKey(tech);
  return (
    <article className={`cat-card ${tech.active ? '' : 'is-dev'}`} style={famVars(fam)} data-testid="technique-card" data-slug={tech.slug}>
      <div className="cat-head">
        <FamilyIcon family={tech.family} color={fam.color} bg={fam.bg} size={40} />
        <div className="min-w-0 flex-1">
          <button type="button" className="cat-title" onClick={() => onOpen(tech)} aria-label={`${tech.name} — ${t('catalog.viewDetails')}`}>{highlight(tech.name, query)}</button>
          <div className="cat-kind">{subKey ? t(subKey) : fam.labelStr}</div>
        </div>
        <Link to={`/catalogo/${tech.uuid}`} className="cat-open" title={t('catalog.openPage')} aria-label={t('catalog.openPage')}><ArrowUpRight className="w-4 h-4" /></Link>
      </div>
      <p className="cat-desc">{highlight(tech.description, query) || t('catalog.noDescription')}</p>
      <div className="cat-foot">
        <Flow tech={tech} />
        {!tech.active && <span className="ml-auto"><DevChip /></span>}
      </div>
    </article>
  );
}

/** Linha compacta para a visão em lista. */
export function TechniqueRow({ tech, query, onOpen }) {
  const { t } = useTranslation();
  const fam = getFamilyConfig(tech.family);
  const subKey = subcategoryKey(tech);
  return (
    <div className="cat-row" style={famVars(fam)} data-testid="technique-row" data-slug={tech.slug}>
      <FamilyIcon family={tech.family} color={fam.color} bg={fam.bg} size={32} />
      <div className="min-w-0">
        <button type="button" className="cat-title" onClick={() => onOpen(tech)}>{highlight(tech.name, query)}</button>
        <p className="cat-desc">{highlight(tech.description, query) || t('catalog.noDescription')}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="cat-meta">
          {subKey && <span className="cat-chip">{t(subKey)}</span>}
          <Flow tech={tech} />
          {!tech.active && <DevChip />}
        </div>
        <Link to={`/catalogo/${tech.uuid}`} className="cat-open" style={{ marginLeft: 0 }} title={t('catalog.openPage')} aria-label={t('catalog.openPage')}><ArrowUpRight className="w-4 h-4" /></Link>
      </div>
    </div>
  );
}
