import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users, Search, Globe, Lock, FolderOpen, ArrowRight, KeyRound, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { COVER_KEYS, coverBackground } from '../config/profileCovers';
import { parseApiError } from '../utils/errors';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';
import Modal from '../components/ui/Modal';

export function RoleBadge({ role }) {
  const { t } = useTranslation();
  if (!role) return null;
  const cls = { owner: 'badge-purple', admin: 'badge-amber', moderator: 'badge-blue', member: 'badge-green' }[role] || 'badge-blue';
  return <span className={`badge ${cls}`}>{t(`communities.roles.${role}`)}</span>;
}

function CommunityCard({ community, onJoin, joining }) {
  const { t } = useTranslation();
  const isMember = !!community.my_role;
  return (
    <div className="card card-hover overflow-hidden flex flex-col h-full">
      <div style={{ height: 52, background: coverBackground(community.cover_color) }} />
      <Link to={`/communities/${community.uuid}`} className="p-5 flex flex-col gap-3 flex-1 group">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{community.name}</h3>
          <span className={`badge ${community.visibility === 'public' ? 'badge-green' : 'badge-blue'} inline-flex items-center gap-1 flex-shrink-0`}>
            {community.visibility === 'public' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            {community.visibility === 'public' ? t('communities.public') : t('communities.private')}
          </span>
        </div>
        <p className="text-sm line-clamp-2 flex-1" style={{ color: 'var(--text-muted)' }}>{community.description || t('common.noDescription')}</p>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t('communities.memberCount', { count: community.member_count ?? 0 })}</span>
          <span className="flex items-center gap-1"><FolderOpen className="w-3 h-3" /> {t('communities.projectCount', { count: community.project_count ?? 0 })}</span>
          <ArrowRight className="w-3.5 h-3.5 ml-auto group-hover:translate-x-1 transition-transform" />
        </div>
      </Link>
      <div className="px-5 pb-4 flex items-center gap-2">
        {isMember ? <RoleBadge role={community.my_role} /> : (
          <button className="btn-primary text-sm py-1 px-3 flex items-center gap-1.5" disabled={joining} onClick={() => onJoin(community)}>
            <LogIn className="w-3.5 h-3.5" /> {t('communities.join')}
          </button>
        )}
      </div>
    </div>
  );
}

function CreateCommunityModal({ open, onClose, onCreated }) {
  const { t } = useTranslation();
  const empty = { name: '', description: '', is_public: true, cover_color: COVER_KEYS[0] };
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: t('datasets.importModal.nameRequired') }); return; }
    setLoading(true);
    try {
      const { is_public, ...rest } = form;
      const res = await api.communities.create({ ...rest, visibility: is_public ? 'public' : 'private' });
      toast.success(t('communities.createdSuccess'));
      setForm(empty); setErrors({});
      onCreated(res.data?.data ?? res.data);
      onClose();
    } catch (err) {
      const p = parseApiError(err, t('common.error'));
      setErrors(p.fields); toast.error(p.message);
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('communities.newCommunity')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('communities.nameLabel')}</label>
          <input className="input-field" value={form.name} maxLength={255} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('communities.namePlaceholder')} />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('common.description')}</label>
          <textarea className="input-field resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('communities.descriptionPlaceholder')} />
        </div>
        <div>
          <span className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('communities.cover')}</span>
          <div className="flex flex-wrap gap-2">
            {COVER_KEYS.map(k => (
              <button key={k} type="button" aria-label={k} aria-pressed={form.cover_color === k} onClick={() => setForm(f => ({ ...f, cover_color: k }))}
                style={{ width: 36, height: 36, borderRadius: 10, background: coverBackground(k), outline: form.cover_color === k ? '2px solid var(--accent)' : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1 h-4 w-4" style={{ accentColor: 'var(--accent)' }} checked={form.is_public} onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))} />
          <span>
            <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('communities.publicToggleLabel')}</span>
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{form.is_public ? t('communities.publicHint') : t('communities.privateHint')}</span>
          </span>
        </label>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">{t('common.cancel')}</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? t('communities.creating') : t('communities.createCommunity')}</button>
        </div>
      </form>
    </Modal>
  );
}

function JoinCodeModal({ open, onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    // aceita o código puro ou o link completo colado
    const clean = code.trim().split('/').filter(Boolean).pop() || '';
    if (!clean) return;
    setLoading(true);
    try {
      const res = await api.communities.joinWithCode(clean);
      const d = res.data?.data ?? res.data;
      toast.success(d.joined ? t('communities.joinedSuccess') : t('communities.alreadyMember'));
      onClose(); setCode('');
      navigate(`/communities/${d.uuid}`);
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
    finally { setLoading(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('communities.joinWithCode')} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('communities.inviteCode')}</label>
          <input className="input-field font-mono tracking-wider" value={code} onChange={e => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoFocus />
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>{t('communities.inviteCodeHint')}</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">{t('common.cancel')}</button>
          <button type="submit" disabled={loading || !code.trim()} className="btn-primary flex-1">{loading ? t('communities.joining') : t('communities.join')}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function CommunitiesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('mine'); // mine | public
  const [createOpen, setCreateOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const { data: mine, loading: loadingMine, refetch: refetchMine } = useApi(() => api.communities.listMine(), []);
  const { data: pub, loading: loadingPub, refetch: refetchPub } = useApi(() => api.communities.listPublic(), []);

  const arr = (x) => (Array.isArray(x) ? x : []);
  const source = tab === 'mine' ? arr(mine) : arr(pub);
  const filtered = source.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const loading = tab === 'mine' ? loadingMine : loadingPub;

  const join = async (c) => {
    setJoiningId(c.uuid);
    try {
      await api.communities.join(c.uuid);
      toast.success(t('communities.joinedSuccess'));
      navigate(`/communities/${c.uuid}`);
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); refetchPub(); }
    finally { setJoiningId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('communities.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('communities.pageSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCodeOpen(true)} className="btn-ghost flex items-center gap-2"><KeyRound className="w-4 h-4" /> {t('communities.joinWithCode')}</button>
          <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {t('communities.newCommunity')}</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          {[{ key: 'mine', label: t('communities.tabMine') }, { key: 'public', label: t('communities.tabPublic') }].map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)} role="tab" aria-selected={tab === tb.key}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{ background: tab === tb.key ? 'var(--accent)' : 'transparent', color: tab === tb.key ? '#fff' : 'var(--text-secondary)' }}>
              {tb.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input className="input-field pl-10" placeholder={t('communities.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title={tab === 'mine' ? t('communities.emptyTitleMine') : t('communities.emptyTitlePublic')}
          description={tab === 'mine' ? t('communities.emptyDescMine') : t('communities.emptyDescPublic')}
          action={tab === 'mine' && <button onClick={() => setCreateOpen(true)} className="btn-primary">{t('communities.createCommunity')}</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => <CommunityCard key={c.uuid} community={c} onJoin={join} joining={joiningId === c.uuid} />)}
        </div>
      )}

      <CreateCommunityModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(c) => { refetchMine(); refetchPub(); if (c?.uuid) navigate(`/communities/${c.uuid}`); }} />
      <JoinCodeModal open={codeOpen} onClose={() => setCodeOpen(false)} />
    </div>
  );
}
