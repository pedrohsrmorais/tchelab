import React from 'react';
import { Toolbox } from '@phosphor-icons/react';
import { FAMILY_ICONS } from '../../config/icons';

/**
 * Ícone de família de técnica: "azulejo" na cor da família com o glifo em duotone.
 * `size` é o lado do azulejo; o glifo ocupa ~58%. No tema Classic o azulejo fica quadrado (--radius-sm).
 */
export default function FamilyIcon({ family, color = '#64748b', bg, size = 36, bare = false, weight = 'duotone', title }) {
  const Icon = FAMILY_ICONS[family] || Toolbox;
  const glyph = Math.round(size * (bare ? 0.9 : 0.58));
  if (bare) return <Icon size={glyph} weight={weight} color={color} aria-hidden={title ? undefined : true} aria-label={title} style={{ flexShrink: 0 }} />;
  return (
    <span
      className="family-icon"
      style={{
        width: size, height: size, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-sm)', background: bg || `${color}22`, color, border: `1px solid ${color}40`,
      }}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      <Icon size={glyph} weight={weight} color={color} />
    </span>
  );
}
