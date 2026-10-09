import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store/auth';
import {
  LayoutDashboard, FolderKanban, Database, GitBranch, Beaker,
  BookOpen, Users, Cpu, Zap, Sparkles, ShieldCheck,
  LogOut, ChevronRight, Sun, Moon, Globe, ChevronDown,
} from 'lucide-react';

// ── Sections ──────────────────────────────────────────────────────────────────
const NAV_MAIN = [
  { to: '/',           icon: LayoutDashboard, key: 'dashboard'  },
  { to: '/projects',   icon: FolderKanban,   key: 'projects'   },
  { to: '/datasets',   icon: Database,        key: 'datasets'   },
  { to: '/workflows',  icon: GitBranch,       key: 'workflows'  },
  { to: '/articles',   icon: BookOpen,        key: 'articles'   },
  { to: '/communities',icon: Users,           key: 'communities'},
  { to: '/models',     icon: Cpu,             key: 'models'     },
  { to: '/jobs',       icon: Zap,             key: 'jobs'       },
];

const LANGS = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'English'   },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function Sidebar({ collapsed, onToggle }) {
  const { t }               = useTranslation();
  const { theme, toggle }   = useTheme();
  const { user, logout, isPlus, isAdmin } = useAuthStore();
  const navigate            = useNavigate();
  const [langOpen, setLangOpen] = useState(false);

  const isDark = theme === 'dark';

  const handleLogout = async () => { await logout(); navigate('/login'); };
  const handleLang   = (code)   => { i18n.changeLanguage(code); try { localStorage.setItem('tchelab_lang', code); } catch {} setLangOpen(false); };

  const currentLang = LANGS.find(l => l.code === i18n.language) || LANGS[0];

  return (
    <aside
      style={{
        width: collapsed ? 68 : 240,
        minHeight: '100vh',
        background: isDark ? 'rgba(10,15,30,0.97)' : 'rgba(248,250,252,0.98)',
        borderRight: `1px solid var(--border)`,
        display: 'flex', flexDirection: 'column',
        flexShrink: 0, position: 'sticky', top: 0,
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        transition: 'width 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* ── Logo / Collapse toggle ──────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        style={{
          padding: '1.125rem 0.875rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          borderBottom: `1px solid var(--border)`,
          cursor: 'pointer', background: 'none', border: 'none',
          width: '100%', textAlign: 'left',
        }}
      >
        <div style={{
          width: 34, height: 34, flexShrink: 0,
          borderRadius: 9,
          background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 3px 10px rgba(37,99,235,0.45)',
        }}>
          <TcheLabLogo size={18} />
        </div>

        {!collapsed && (
          <div
            style={{ overflow: 'hidden', flex: 1 }}
          >
            <p style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              TcheLab
            </p>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 1 }}>
              QUIMIOMETRIA
            </p>
          </div>
        )}

        <ChevronRight
          size={13}
          style={{
            color: 'var(--text-muted)',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 0.28s',
            flexShrink: 0,
            marginLeft: collapsed ? 'auto' : undefined,
          }}
        />
      </button>

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: '0.375rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {NAV_MAIN.map(item => (
          <NavItem key={item.to} {...item} label={t(`nav.${item.key}`)} collapsed={collapsed} />
        ))}

        {/* AI section */}
        {(isPlus() || true) && (
          <>
            {!collapsed && (
              <p style={{ margin: '0.875rem 0.5rem 0.25rem', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
                {t('nav.ia')}
              </p>
            )}
            {collapsed && <div style={{ height: 8 }} />}
            <NavItem to="/ai" icon={Sparkles} label={t('nav.ai')} collapsed={collapsed} accent />
          </>
        )}

        {/* Admin section */}
        {isAdmin() && (
          <>
            {!collapsed && (
              <p style={{ margin: '0.875rem 0.5rem 0.25rem', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
                ADMIN
              </p>
            )}
            <NavItem to="/admin" icon={ShieldCheck} label={t('nav.admin')} collapsed={collapsed} />
          </>
        )}
      </nav>

      {/* ── Theme + Lang ────────────────────────────────────────────────────── */}
      <div style={{ padding: '0.5rem', borderTop: `1px solid var(--border)` }}>

        {/* Dark/light toggle */}
        <button
          onClick={toggle}
          title={isDark ? t('common.lightMode') : t('common.darkMode')}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            padding: '0.5rem 0.625rem',
            borderRadius: 'var(--radius)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: '0.8rem',
            fontWeight: 500,
            justifyContent: collapsed ? 'center' : 'flex-start',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          {isDark
            ? <Sun size={15} style={{ flexShrink: 0 }} />
            : <Moon size={15} style={{ flexShrink: 0 }} />
          }
          {!collapsed && <span>{isDark ? t('common.lightMode') : t('common.darkMode')}</span>}
        </button>

        {/* Language picker */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setLangOpen(v => !v)}
            title={t('common.language')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              padding: '0.5rem 0.625rem',
              borderRadius: 'var(--radius)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 500,
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <Globe size={15} style={{ flexShrink: 0 }} />
            {!collapsed && (
              <>
                <span style={{ flex: 1 }}>{currentLang.label}</span>
                <ChevronDown size={11} style={{ opacity: 0.5 }} />
              </>
            )}
          </button>

          {langOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow)',
                overflow: 'hidden',
                zIndex: 50,
                marginBottom: 4,
              }}
            >
              {LANGS.map(l => (
                <button
                  key={l.code}
                  onClick={() => handleLang(l.code)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    background: i18n.language === l.code ? 'var(--bg-hover)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: i18n.language === l.code ? 'var(--text-accent)' : 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    fontWeight: i18n.language === l.code ? 600 : 400,
                    textAlign: 'left',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (i18n.language !== l.code) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (i18n.language !== l.code) e.currentTarget.style.background = 'none'; }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── User ────────────────────────────────────────────────────────────── */}
      <div style={{ padding: '0.625rem 0.5rem', borderTop: `1px solid var(--border)` }}>
        {!collapsed && (
          <div
            style={{
              padding: '0.625rem',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-hover)',
              marginBottom: '0.375rem',
              display: 'flex', alignItems: 'center', gap: '0.625rem',
            }}
          >
            <Avatar name={user?.name || user?.email} size={30} />
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || 'Usuário'}
              </p>
              <p style={{ fontSize: '0.64rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.email}
              </p>
            </div>
            {isPlus() && <span className="badge badge-plus" style={{ fontSize: '0.55rem' }}>PLUS</span>}
          </div>
        )}

        <button
          onClick={handleLogout}
          title={t('nav.logout')}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            padding: '0.5rem 0.625rem',
            borderRadius: 'var(--radius)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            fontWeight: 500,
            justifyContent: collapsed ? 'center' : 'flex-start',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#fca5a5'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <LogOut size={15} style={{ flexShrink: 0 }} />
          {!collapsed && <span>{t('nav.logout')}</span>}
        </button>
      </div>
    </aside>
  );
}

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ to, icon: Icon, label, collapsed, accent }) {
  return (
    <NavLink to={to} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            padding: '0.5rem 0.625rem',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
            position: 'relative',
            transition: 'background 0.15s, color 0.15s',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: isActive
              ? (accent ? 'rgba(139,92,246,0.12)' : 'rgba(37,99,235,0.12)')
              : 'transparent',
            color: isActive
              ? (accent ? '#c4b5fd' : 'var(--text-accent)')
              : 'var(--text-secondary)',
          }}
          onMouseEnter={e => {
            if (!isActive) {
              e.currentTarget.style.background = 'var(--bg-hover)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }
          }}
          onMouseLeave={e => {
            if (!isActive) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }
          }}
        >
          {/* Active indicator */}
          {isActive && (
            <div style={{
              position: 'absolute',
              left: 0, top: '18%', bottom: '18%',
              width: 3,
              background: accent ? '#a855f7' : 'var(--accent)',
              borderRadius: '0 2px 2px 0',
            }} />
          )}

          <Icon size={16} style={{ flexShrink: 0 }} />

          {!collapsed && (
            <span
              style={{ fontSize: '0.8125rem', fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap', flex: 1 }}
            >
              {label}
            </span>
          )}
        </div>
      )}
    </NavLink>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 32 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hue = [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 60 + 200;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `hsl(${hue},65%,40%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: size * 0.36, fontWeight: 700,
      color: '#fff', letterSpacing: '-0.02em',
    }}>
      {initials}
    </div>
  );
}

// ── Logo ──────────────────────────────────────────────────────────────────────
function TcheLabLogo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M10 14h20M20 14v14M14 20h12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="20" cy="14" r="3" fill="#93c5fd" />
      <circle cx="20" cy="28" r="3" fill="#93c5fd" />
    </svg>
  );
}

export default Sidebar;
