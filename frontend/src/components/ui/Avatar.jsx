import React, { useState } from 'react';

/**
 * Avatar do usuário: foto (quando houver) ou iniciais sobre uma cor derivada do nome.
 * Aceita `user` ({ name, avatar_url, initials }) ou, para listas simples, `name`/`src`.
 */
export default function Avatar({ user, name, src, size = 32, style, title }) {
  const [broken, setBroken] = useState(false);
  const label = (user?.name || name || '?').trim();
  const url = user?.avatar_url || user?.owner_avatar_url || src || null;
  const initials = (user?.initials || label.split(/\s+/).map(w => w[0]).slice(0, 2).join('')).toUpperCase();
  const hue = [...label].reduce((a, c) => a + c.charCodeAt(0), 0) % 60 + 200;

  const box = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', ...style,
  };

  if (url && !broken) {
    return (
      <img
        src={url}
        alt={label}
        title={title || label}
        onError={() => setBroken(true)}
        style={{ ...box, objectFit: 'cover', background: 'var(--bg-hover)' }}
      />
    );
  }
  return (
    <div
      title={title || label}
      aria-label={label}
      style={{
        ...box, background: `hsl(${hue},65%,40%)`, fontSize: size * 0.36, fontWeight: 700,
        color: '#fff', letterSpacing: '-0.02em',
      }}
    >
      {initials}
    </div>
  );
}
