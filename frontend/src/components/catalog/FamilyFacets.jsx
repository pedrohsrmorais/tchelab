import React from 'react';
import { useTranslation } from 'react-i18next';
import { Books } from '@phosphor-icons/react';
import FamilyIcon from '../ui/FamilyIcon';

/**
 * Faceta "Famílias": lista vertical com contagens no desktop (≥ lg) e fileira rolável de chips
 * abaixo disso. As contagens já respeitam a busca e o status ativos, para o usuário ver o efeito
 * de cada escolha antes de clicar.
 */
export default function FamilyFacets({ families, counts, total, value, onChange }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('catalog.families')} data-testid="family-facets">
      <div className="cat-facets-title" title={t('catalog.familiesHint')}>{t('catalog.families')}</div>
      <div className="cat-facets">
        <button type="button" className="cat-facet" aria-pressed={value === 'all'} onClick={() => onChange('all')} data-testid="facet-all" style={{ '--fam-bg': 'var(--bg-hover)' }}>
          <Books size={18} weight={value === 'all' ? 'duotone' : 'regular'} aria-hidden />
          <span className="cat-label">{t('catalog.allFamilies')}</span>
          <span className="cat-n">{total}</span>
        </button>
        {families.map((f) => {
          const n = counts[f.slug] || 0;
          const on = value === f.slug;
          return (
            <button key={f.slug} type="button" className={`cat-facet ${n === 0 && !on ? 'is-empty' : ''}`} aria-pressed={on} onClick={() => onChange(on ? 'all' : f.slug)}
              style={{ '--fam-bg': f.bg, '--fam-border': f.border }} data-testid={`facet-${f.slug}`}>
              <FamilyIcon family={f.slug} color={f.color} size={18} bare weight={on ? 'duotone' : 'regular'} />
              <span className="cat-label">{f.labelStr}</span>
              <span className="cat-n">{n}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
