import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import '../board/board.css';
import { ChevronRight, LayoutGrid, SquareKanban, ListTodo, CalendarClock, ClipboardList } from 'lucide-react';

/**
 * Registro dos apps da comunidade. Novos apps entram só aqui: ícone, cor, título e rota da lista.
 * A mesma barra aparece em todas as telas de app, para o usuário saltar entre eles sem se perder.
 */
export const APPS = [
  { key: 'boards', icon: SquareKanban, color: 'text-sky-400', title: 'board.appTitle' },
  { key: 'tasks', icon: ListTodo, color: 'text-emerald-400', title: 'board.myTasks' },
  { key: 'equipment', icon: CalendarClock, color: 'text-teal-400', title: 'equipment.appTitle' },
  { key: 'quizzes', icon: ClipboardList, color: 'text-pink-400', title: 'quiz.appTitle' },
];
export const appHref = (cid, app) => `/communities/${cid}?tab=apps${app ? `&app=${app}` : ''}`;

/**
 * Migalhas + seletor de app.
 *   app   = chave do app atual (destaca no seletor) · trail = [{ label, to? }] níveis abaixo do app.
 */
export default function AppCrumbs({ cid, community, app, trail = [] }) {
  const { t } = useTranslation();
  const current = APPS.find((a) => a.key === app);
  const parts = [
    { label: community?.name || t('communities.backToCommunities'), to: `/communities/${cid}` },
    { label: t('communities.tabApps'), to: appHref(cid) },
    current && { label: t(current.title), to: appHref(cid, current.key) },
    ...trail,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-testid="app-crumbs">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-sm min-w-0">
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden />}
            {p.to && i < parts.length - 1
              ? <Link to={p.to} className="hover:underline truncate max-w-[14rem]" style={{ color: 'var(--text-muted)' }}>{p.label}</Link>
              : <span className="truncate max-w-[18rem] font-medium" style={{ color: 'var(--text-primary)' }} aria-current="page">{p.label}</span>}
          </React.Fragment>
        ))}
      </nav>
      <div className="flex items-center gap-1" role="navigation" aria-label={t('communities.tabApps')}>
        <Link to={appHref(cid)} className="board-tool" title={t('communities.tabApps')} data-testid="apps-home"><LayoutGrid className="w-4 h-4" /></Link>
        {APPS.map((a) => {
          const Icon = a.icon; const on = a.key === app;
          return (
            <Link key={a.key} to={appHref(cid, a.key)} className={`board-tool ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} title={t(a.title)} data-testid={`appnav-${a.key}`}>
              <Icon className={`w-4 h-4 ${on ? '' : a.color}`} /><span className="hidden md:inline">{t(a.title)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
