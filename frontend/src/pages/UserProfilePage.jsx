import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Building2, GraduationCap, Mail, Cake, FolderOpen, Users, Calendar, ExternalLink,
  Database, GitBranch, Star, Pencil, Globe2, Lock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { currentLocale } from '../i18n';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';
import { coverBackground } from '../config/profileCovers';

function LinkChip({ href, label }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost inline-flex items-center gap-1.5 text-sm">
      <ExternalLink className="w-3.5 h-3.5" /> {label}
    </a>
  );
}

/** Perfil público de um usuário: bio, links e projetos públicos (o dono vê também os privados). */
export default function UserProfilePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { data: profile, loading, error } = useApi(() => api.user.get(id), [id]);
  const { data: projects } = useApi(() => api.user.projects(id), [id]);
  const { data: communities } = useApi(() => api.user.communities(id), [id]);

  if (loading) return <div className="max-w-4xl"><SkeletonCard /></div>;
  if (error || !profile) {
    return (
      <EmptyState icon={Users} title={t('userPage.notFound')} description={t('userPage.notFoundDesc')}
        action={<Link to="/" className="btn-primary">{t('common.back')}</Link>} />
    );
  }

  const fmt = (d) => new Date(d).toLocaleDateString(currentLocale(), { year: 'numeric', month: 'long' });
  const fmtDay = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
  const hasLinks = profile.lattes_url || profile.linkedin_url || profile.github_url;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="card overflow-hidden">
        <div style={{ height: 120, background: coverBackground(profile.cover_color) }} aria-hidden="true" />
        <div className="px-6 pb-6">
          <div className="flex flex-wrap items-end gap-4" style={{ marginTop: -44 }}>
            <Avatar user={profile} size={96} style={{ border: '4px solid var(--bg-card, var(--bg-elevated))', fontSize: 32 }} />
            <div className="flex-1 min-w-0 pt-12">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{profile.name}</h1>
              <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Calendar className="w-3 h-3" /> {t('userPage.memberSince', { date: fmt(profile.created_at) })}
              </p>
            </div>
            {profile.is_self && (
              <Link to="/profile" className="btn-ghost inline-flex items-center gap-1.5 mt-12">
                <Pencil className="w-4 h-4" /> {t('userPage.editProfile')}
              </Link>
            )}
          </div>

          <div className="mt-5 grid gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {profile.institution && <p className="flex items-center gap-2"><Building2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />{profile.institution}</p>}
            {profile.research_area && <p className="flex items-center gap-2"><GraduationCap className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />{profile.research_area}</p>}
            {profile.email && <p className="flex items-center gap-2"><Mail className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} /><a href={`mailto:${profile.email}`} className="hover:underline">{profile.email}</a></p>}
            {profile.birth_date && <p className="flex items-center gap-2"><Cake className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />{fmtDay(profile.birth_date)}</p>}
          </div>

          <p className="mt-5 text-sm whitespace-pre-line" style={{ color: profile.bio ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {profile.bio || t('userPage.noBio')}
          </p>

          {hasLinks && (
            <div className="mt-5 flex flex-wrap gap-2">
              <LinkChip href={profile.lattes_url} label="Lattes" />
              <LinkChip href={profile.linkedin_url} label="LinkedIn" />
              <LinkChip href={profile.github_url} label="GitHub" />
            </div>
          )}
        </div>
      </div>

      <section aria-labelledby="up-projects">
        <h2 id="up-projects" className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <FolderOpen className="w-4 h-4" style={{ color: 'var(--text-accent)' }} />
          {profile.is_self ? t('userPage.projects') : t('userPage.publicProjects')}
        </h2>
        {!projects?.length ? (
          <div className="card p-6 text-sm" style={{ color: 'var(--text-muted)' }}>{t('userPage.noProjects')}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map(p => (
              <Link key={p.uuid} to={`/projects/${p.uuid}`} className="card card-hover p-5 block">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</h3>
                  <span className={`badge ${p.visibility === 'public' ? 'badge-green' : 'badge-blue'} flex items-center gap-1`}>
                    {p.visibility === 'public' ? <Globe2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {p.visibility === 'public' ? t('projects.public') : t('projects.private')}
                  </span>
                </div>
                <p className="text-sm line-clamp-2 mb-3 min-h-[2.5rem]" style={{ color: 'var(--text-muted)' }}>{p.description || t('common.noDescription')}</p>
                <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> {p.workflow_count}</span>
                  <span className="flex items-center gap-1"><Database className="w-3 h-3" /> {p.dataset_count}</span>
                  <span className="flex items-center gap-1"><Star className="w-3 h-3" /> {p.technique_count}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {communities?.length > 0 && (
        <section aria-labelledby="up-comm">
          <h2 id="up-comm" className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Users className="w-4 h-4" style={{ color: 'var(--text-accent)' }} /> {t('userPage.communities')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {communities.map(c => (
              <Link key={c.uuid} to={`/communities/${c.uuid}`} className="badge badge-blue" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
