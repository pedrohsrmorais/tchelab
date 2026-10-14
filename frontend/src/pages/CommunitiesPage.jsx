import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, Search, Globe, Lock, MessageSquare, FolderOpen, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useApi, useMutation } from '../hooks/useApi';
import { api } from '../api';
import EmptyState from '../components/ui/EmptyState';
import SkeletonCard from '../components/ui/SkeletonCard';
import Modal from '../components/ui/Modal';

function CommunityCard({ community }) {
  const { t } = useTranslation();
  return (
    <Link to={`/communities/${community.uuid}`}>
      <div className="card card-hover p-5 flex flex-col gap-4 group cursor-pointer h-full">
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-amber-400" />
          </div>
          <span className={`badge ${community.visibility === 'public' ? 'badge-green' : 'badge-blue'}`}>
            {community.visibility === 'public' ? <Globe className="w-3 h-3 inline mr-1" /> : <Lock className="w-3 h-3 inline mr-1" />}
            {community.visibility === 'public' ? t('communities.public') : t('communities.private')}
          </span>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">{community.name}</h3>
          <p className="text-sm text-slate-400 mt-1 line-clamp-2">{community.description || t('common.noDescription')}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t('communities.memberCount', { count: community.member_count ?? 0 })}</span>
          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {t('communities.messageCount', { count: community.message_count ?? 0 })}</span>
          <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-600 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
        </div>
      </div>
    </Link>
  );
}

function CreateCommunityModal({ open, onClose, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', description: '', is_public: true });
  const { mutate, loading } = useMutation(api.communities.create);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error(t('datasets.importModal.nameRequired')); return; }
    const { is_public, ...rest } = form;
    const result = await mutate({ ...rest, visibility: is_public ? 'public' : 'private' });
    if (result) {
      toast.success(t('communities.createdSuccess'));
      onCreated();
      onClose();
      setForm({ name: '', description: '', is_public: true });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('communities.newCommunity')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('communities.nameLabel')}</label>
          <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('communities.namePlaceholder')} />
        </div>
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('common.description')}</label>
          <textarea className="input-field resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('communities.descriptionPlaceholder')} />
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={form.is_public} onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))} />
            <div className={`w-10 h-5 rounded-full transition-colors ${form.is_public ? 'bg-blue-600' : 'bg-slate-600'}`} />
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_public ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-sm text-slate-300">{t('communities.publicToggleLabel')}</span>
        </label>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">{t('common.cancel')}</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? t('communities.creating') : t('communities.createCommunity')}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function CommunitiesPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('mine'); // mine | public
  const [createOpen, setCreateOpen] = useState(false);
  const { data: mine, loading: loadingMine, refetch: refetchMine } = useApi(api.communities.listMine, []);
  const { data: pub, loading: loadingPub } = useApi(api.communities.listPublic, []);

  const source = tab === 'mine' ? (mine?.data ?? mine ?? []) : (pub?.data ?? pub ?? []);
  const filtered = source.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const loading = tab === 'mine' ? loadingMine : loadingPub;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('communities.title')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('communities.pageSubtitle')}</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('communities.newCommunity')}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(30, 41, 59, 0.8)' }}>
          {[{ key: 'mine', label: t('communities.tabMine') }, { key: 'public', label: t('communities.tabPublic') }].map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{ background: tab === tb.key ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : 'transparent', color: tab === tb.key ? '#fff' : '#94a3b8' }}>
              {tb.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input-field pl-10" placeholder={t('communities.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title={tab === 'mine' ? t('communities.emptyTitleMine') : t('communities.emptyTitlePublic')}
          description={tab === 'mine' ? t('communities.emptyDescMine') : t('communities.emptyDescPublic')}
          action={tab === 'mine' && <button onClick={() => setCreateOpen(true)} className="btn-primary">{t('communities.createCommunity')}</button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => <CommunityCard key={c.uuid} community={c} />)}
        </div>
      )}

      <CreateCommunityModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refetchMine} />
    </div>
  );
}
