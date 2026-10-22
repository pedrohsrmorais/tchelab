import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { LANGUAGES } from '../../i18n';
import { setLanguage } from '../../i18n/preferences';

/** Moldura das páginas públicas (sem menu lateral, mobile-first). */
export default function PublicShell({ children, community }) {
  const { theme } = useTheme();
  const { i18n, t } = useTranslation();
  const code = String(i18n.language || 'pt').slice(0, 2);
  return (
    <div data-theme={theme} className="min-h-screen" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
      <header className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight">TcheLab</p>
          {community && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{community}</p>}
        </div>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Globe2 className="w-4 h-4" />
          <select className="input-field !py-1 !px-2 !w-auto text-xs" value={code} onChange={e => setLanguage(e.target.value)} aria-label={t('equipment.language')}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">{children}</main>
      <footer className="text-center text-xs py-6" style={{ color: 'var(--text-muted)' }}>
        <Link to="/login" className="underline">{t('equipment.publicFooter')}</Link>
      </footer>
    </div>
  );
}
