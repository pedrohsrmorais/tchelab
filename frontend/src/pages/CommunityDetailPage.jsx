import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, MessageSquare, FolderOpen, Plus, Send, BookOpen, Link2, FileText, File as FileIcon,
  Trash2, Eye, EyeOff, Pencil, Copy, KeyRound, Settings, LogOut, Globe, Lock, Download, ExternalLink,
  Crown, Ban, X, GitBranch, Database, ChevronUp, ChevronDown, Presentation, FileSpreadsheet, Image as ImageIcon, Upload, FolderPlus, ChevronRight, ClipboardList, LayoutGrid, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { useAuthStore } from '../store/auth';
import { currentLocale } from '../i18n';
import { COVER_KEYS, coverBackground } from '../config/profileCovers';
import { parseApiError } from '../utils/errors';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import Avatar from '../components/ui/Avatar';
import { RoleBadge } from './CommunitiesPage';
import { AccessPicker } from './ProjectDetailPage';
import PreviewModal from '../components/community/PreviewModal';
import { StatusBadge, SubStatusBadge } from './QuizPage';

const arr = (x) => (Array.isArray(x) ? x : []);
const lbl = { color: 'var(--text-secondary)' };
const muted = { color: 'var(--text-muted)' };

/** Lista plana de tópicos (com `parent`) -> ordem de árvore com `depth` (para selects e para a UI). */
function flattenSections(list) {
  const secs = arr(list); const out = [];
  const walk = (parent, depth) => secs.filter(x => (x.parent || null) === parent).forEach(x => { out.push({ ...x, depth }); walk(x.uuid, depth + 1); });
  walk(null, 0);
  return out;
}
const indent = (depth) => '\u2003'.repeat(depth || 0) + (depth ? '↳ ' : '');

function Tab({ active, onClick, icon: Icon, children, count }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className="px-3.5 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
      style={{ background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--text-secondary)' }}>
      <Icon className="w-4 h-4" />{children}{count != null && <span className="text-[0.7rem] opacity-75">({count})</span>}
    </button>
  );
}

function AccessChip({ access }) {
  const { t } = useTranslation();
  return <span className={`badge ${access === 'edit' ? 'badge-amber' : 'badge-blue'}`}>{access === 'edit' ? t('communities.accessEdit') : t('communities.accessRead')}</span>;
}

export default function CommunityDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore(s => s.user);
  const [tab, setTab] = useState('content');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [itemModal, setItemModal] = useState(null);       // {sectionId, type?}
  const [sectionModal, setSectionModal] = useState(null); // {section?, parent?}
  const [quizModal, setQuizModal] = useState(null);       // {sectionId}

  const { data: community, loading, error, refetch } = useApi(() => api.communities.get(id), [id]);
  const perms = community?.permissions || {};
  const isMember = !!perms.is_member;

  const { data: content, refetch: refetchContent } = useApi(() => (isMember ? api.communities.content(id) : null), [id, isMember]);
  const { data: projects, refetch: refetchProjects } = useApi(() => (community ? api.communities.listProjects(id) : null), [id, !!community]);
  const { data: members, refetch: refetchMembers } = useApi(() => (isMember ? api.communities.listMembers(id) : null), [id, isMember]);

  const run = async (fn, okMsg, after) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast.success(okMsg); await after?.(); return true; }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); return false; }
    finally { setBusy(false); }
  };

  if (loading) return <div className="space-y-4"><SkeletonCard className="h-32" /><SkeletonCard className="h-96" /></div>;
  if (error || !community) return (
    <EmptyState icon={Users} title={t('communities.notFound')} description={t('communities.notFoundDesc')}
      action={<Link to="/communities" className="btn-primary">{t('communities.backToCommunities')}</Link>} />
  );

  const c = community;
  const projectList = arr(projects);
  const refreshAll = async () => { await Promise.all([refetch(), refetchContent(), refetchProjects(), refetchMembers()].map(p => p?.catch?.(() => {}))); };

  const tabs = [
    isMember && { key: 'content', icon: BookOpen, label: t('communities.tabContent') },
    isMember && { key: 'apps', icon: LayoutGrid, label: t('communities.tabApps') },
    { key: 'projects', icon: FolderOpen, label: t('communities.tabProjects'), count: projectList.length },
    isMember && { key: 'members', icon: Users, label: t('communities.members'), count: arr(members).length },
    isMember && { key: 'chat', icon: MessageSquare, label: t('communities.tabChat') },
    perms.can_moderate && { key: 'invites', icon: KeyRound, label: t('communities.tabInvites') },
    perms.can_manage && { key: 'settings', icon: Settings, label: t('communities.tabSettings') },
  ].filter(Boolean);
  const activeTab = tabs.find(x => x.key === tab) ? tab : tabs[0].key;

  const join = () => run(() => api.communities.join(id), t('communities.joinedSuccess'), async () => { await refetch(); setTab('content'); });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/communities" className="inline-flex items-center gap-2 text-sm mb-4 hover:underline" style={muted}>
          <ArrowLeft className="w-4 h-4" /> {t('communities.backToCommunities')}
        </Link>
        <div className="card overflow-hidden">
          <div style={{ height: 80, background: coverBackground(c.cover_color) }} />
          <div className="p-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{c.name}</h1>
                <span className={`badge ${c.visibility === 'public' ? 'badge-green' : 'badge-blue'} inline-flex items-center gap-1`}>
                  {c.visibility === 'public' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {c.visibility === 'public' ? t('communities.public') : t('communities.private')}
                </span>
                <RoleBadge role={c.my_role} />
              </div>
              <p style={muted}>{c.description || t('common.noDescription')}</p>
              <div className="flex flex-wrap items-center gap-4 text-xs mt-3" style={muted}>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {t('communities.memberCount', { count: c.member_count })}</span>
                <span className="flex items-center gap-1"><FolderOpen className="w-3 h-3" /> {t('communities.projectCount', { count: c.project_count })}</span>
                <Link to={`/users/${c.owner_uuid}`} className="flex items-center gap-1.5 hover:underline">
                  <Avatar name={c.owner_name} src={c.owner_avatar_url} size={18} /> {t('communities.createdBy', { name: c.owner_name })}
                </Link>
              </div>
            </div>
            <div className="flex gap-2">
              {!isMember && <button className="btn-primary" disabled={busy} onClick={join}>{t('communities.join')}</button>}
              {isMember && c.my_role !== 'owner' && (
                <button className="btn-ghost flex items-center gap-1.5" onClick={() => setModal('leave')}><LogOut className="w-4 h-4" /> {t('communities.leave')}</button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div role="tablist" className="flex items-center gap-1 overflow-x-auto pb-1">
        {tabs.map(x => <Tab key={x.key} active={activeTab === x.key} onClick={() => setTab(x.key)} icon={x.icon} count={x.count}>{x.label}</Tab>)}
      </div>

      {activeTab === 'content' && (
        <ContentTab id={id} data={content} perms={perms} run={run} reload={refetchContent} onLink={() => setModal('link')}
          onAddItem={(sectionId, type) => setItemModal({ sectionId, type })} onAddTopic={(parent) => setSectionModal({ parent })}
          onEditTopic={(section) => setSectionModal({ section })} onAddQuiz={(sectionId) => setQuizModal({ sectionId })} />
      )}
      {activeTab === 'apps' && (
        <AppsTab id={id} data={content} perms={perms}
          onAddItem={(type) => setItemModal({ sectionId: '', type })} onAddTopic={() => setSectionModal({ parent: null })}
          onAddQuiz={() => setQuizModal({ sectionId: '' })} onLinkProject={() => setItemModal({ sectionId: '', type: 'project' })} />
      )}
      {activeTab === 'projects' && (
        <ProjectsTab id={id} list={projectList} perms={perms} isMember={isMember} me={me} run={run} reload={refetchProjects} onLink={() => setModal('link')} />
      )}
      {activeTab === 'members' && (
        <MembersTab id={id} list={arr(members)} me={me} myRole={c.my_role} perms={perms} run={run} reload={async () => { await refetchMembers(); await refetch(); }} />
      )}
      {activeTab === 'chat' && <ChatTab id={id} me={me} perms={perms} />}
      {activeTab === 'invites' && <InvitesTab id={id} run={run} />}
      {activeTab === 'settings' && (
        <SettingsTab community={c} id={id} run={run} reload={refetch} isOwner={perms.is_owner} members={arr(members)} me={me}
          onDeleted={() => navigate('/communities')} onTransferred={async () => { await refetch(); await refetchMembers(); }} />
      )}

      <SectionModal state={sectionModal} onClose={() => setSectionModal(null)} id={id} sections={flattenSections(content?.sections)} reload={refetchContent} />
      <ItemModal state={itemModal} onClose={() => setItemModal(null)} id={id} sections={flattenSections(content?.sections)} reload={async () => { await refetchContent(); await refetchProjects(); await refetch(); }} />
      <QuizModal state={quizModal} onClose={() => setQuizModal(null)} id={id} sections={flattenSections(content?.sections)} />

      <LinkProjectModal open={modal === 'link'} onClose={() => setModal(null)} id={id} linked={projectList}
        sections={flattenSections(content?.sections)} onDone={async () => { setModal(null); await refreshAll(); }} />

      <Modal open={modal === 'leave'} onClose={() => setModal(null)} title={t('communities.leave')} size="sm">
        <p className="mb-6" style={lbl}>{t('communities.leaveConfirm', { name: c.name })}</p>
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={() => setModal(null)}>{t('common.cancel')}</button>
          <button className="btn-danger flex-1" disabled={busy}
            onClick={() => run(() => api.communities.leave(id), t('communities.left'), () => navigate('/communities'))}>{t('communities.leave')}</button>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════ Conteúdo (estilo Moodle) ═══════════════════════ */

const OFFICE_RE = /\.(pptx?|ppsx?|odp|docx?|odt|rtf|xlsx?|ods)$/i;
const SLIDES_RE = /\.(pptx?|ppsx?|odp)$/i;
const SHEET_RE = /\.(xlsx?|ods|csv)$/i;
const isOffice = (it) => it?.type === 'file' && OFFICE_RE.test(it.file_name || '');

/** Ícone + cor por tipo de material (slides, planilha, PDF, imagem…). */
function ItemIcon({ it }) {
  const cls = 'w-4 h-4 flex-shrink-0';
  if (it.type === 'link') return <Link2 className={`${cls} text-blue-400`} />;
  if (it.type === 'text') return <FileText className={`${cls} text-emerald-400`} />;
  if (it.type === 'workflow') return <GitBranch className={`${cls} text-purple-400`} />;
  if (it.type === 'dataset') return <Database className={`${cls} text-cyan-400`} />;
  const name = it.file_name || '';
  if (SLIDES_RE.test(name)) return <Presentation className={`${cls} text-orange-400`} />;
  if (SHEET_RE.test(name)) return <FileSpreadsheet className={`${cls} text-green-400`} />;
  if (it.file_mime === 'application/pdf') return <FileText className={`${cls} text-red-400`} />;
  if (String(it.file_mime).startsWith('image/')) return <ImageIcon className={`${cls} text-pink-400`} />;
  return <FileIcon className={`${cls} text-amber-400`} />;
}

const moveInList = (list, i, dir) => {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const out = list.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

function ContentTab({ id, data, perms, run, reload, onAddItem, onAddTopic, onEditTopic, onAddQuiz }) {
  const { t } = useTranslation();
  const [editModal, setEditModal] = useState(null);       // item
  const [viewer, setViewer] = useState(null);             // {uuid} | {text}
  const [preview, setPreview] = useState(null);           // {kind, uuid, name}
  const [collapsed, setCollapsed] = useState(() => new Set());
  const canEdit = !!perms.can_moderate;
  const sections = arr(data?.sections);
  const flat = flattenSections(sections);
  const general = data?.general || { items: [], projects: [], quizzes: [] };
  const empty = !sections.length && !arr(general.items).length && !arr(general.projects).length && !arr(general.quizzes).length;

  const allItems = [...arr(general.items), ...sections.flatMap(s => arr(s.items))];
  const viewerItem = viewer?.uuid ? allItems.find(i => i.uuid === viewer.uuid) : null;
  const hasPending = allItems.some(i => i.type === 'file' && i.preview_status === 'pending');

  // Enquanto algum PPT/DOC está sendo convertido, atualiza a lista até a pré-visualização ficar pronta
  useEffect(() => {
    if (!hasPending) return undefined;
    const timer = setTimeout(() => { reload().catch(() => {}); }, 3500);
    return () => clearTimeout(timer);
  }, [hasPending, data]); // eslint-disable-line

  const toggle = (uuid) => setCollapsed(prev => { const n = new Set(prev); if (n.has(uuid)) n.delete(uuid); else n.add(uuid); return n; });
  const siblingsOf = (s) => sections.filter(x => (x.parent || null) === (s.parent || null));
  const moveTopic = (s, dir) => run(() => api.communities.reorderSections(id, moveInList(siblingsOf(s), siblingsOf(s).findIndex(x => x.uuid === s.uuid), dir).map(x => x.uuid)), null, reload);
  const moveItem = (topic, i, dir) => run(
    () => api.communities.reorderItems(id, topic.uuid || null, moveInList(arr(topic.items), i, dir).map(x => x.uuid)), null, reload);

  const cardProps = { canEdit, id, run, reload, onOpen: setViewer, onEditItem: setEditModal, onPreview: setPreview, onAddItem, onAddTopic, onEditTopic, onAddQuiz };
  const renderTopic = (s) => {
    const sib = siblingsOf(s); const i = sib.findIndex(x => x.uuid === s.uuid);
    const kids = sections.filter(x => x.parent === s.uuid);
    return (
      <TopicCard key={s.uuid} {...cardProps} topic={s} depth={s.depth}
        collapsed={collapsed.has(s.uuid)} onToggle={() => toggle(s.uuid)}
        onMoveTopic={(d) => moveTopic(s, d)} canUp={i > 0} canDown={i < sib.length - 1}
        onMoveItem={(j, d) => moveItem(s, j, d)}>
        {kids.map(k => renderTopic({ ...k, depth: s.depth + 1 }))}
      </TopicCard>
    );
  };

  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="flex flex-wrap gap-2 justify-end">
          <button className="btn-primary text-sm py-1.5 flex items-center gap-1.5" onClick={() => onAddTopic(null)}><Plus className="w-3.5 h-3.5" /> {t('communities.addTopic')}</button>
          <button className="btn-ghost text-sm py-1.5 flex items-center gap-1.5" onClick={() => onAddItem('', undefined)}><Plus className="w-3.5 h-3.5" /> {t('communities.addItem')}</button>
          <button className="btn-ghost text-sm py-1.5 flex items-center gap-1.5" onClick={() => onAddQuiz('')}><ClipboardList className="w-3.5 h-3.5" /> {t('quiz.newQuiz')}</button>
        </div>
      )}
      {empty && (
        <EmptyState icon={BookOpen} title={t('communities.contentEmptyTitle')} description={canEdit ? t('communities.contentEmptyDescEdit') : t('communities.contentEmptyDesc')}
          action={canEdit ? <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => onAddTopic(null)}><Plus className="w-3.5 h-3.5" /> {t('communities.addTopic')}</button> : undefined} />
      )}

      {(arr(general.items).length > 0 || arr(general.projects).length > 0 || arr(general.quizzes).length > 0) && (
        <TopicCard {...cardProps} topic={{ title: t('communities.generalTopic'), description: null, items: general.items, projects: general.projects, quizzes: general.quizzes }} depth={0}
          onMoveItem={(i, d) => moveItem({ uuid: null, items: general.items }, i, d)} />
      )}
      {flat.filter(s => s.depth === 0).map(renderTopic)}

      <EditItemModal item={editModal} onClose={() => setEditModal(null)} id={id} sections={flat} reload={reload} />
      <FileViewer state={viewer} item={viewerItem} onClose={() => setViewer(null)} id={id} />
      <PreviewModal target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function ItemRow({ it, idx, total, canEdit, id, run, reload, onOpen, onEditItem, onMoveItem, onPreview }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const titleBtn = 'text-sm font-medium hover:underline text-left break-words';
  const tstyle = { color: 'var(--text-primary)' };

  const copyWorkflow = async () => {
    setBusy(true);
    try {
      const res = await api.workflows.fork(it.ref.uuid);
      const wf = res.data?.data ?? res.data;
      toast.success(t('communities.workflowCopied'));
      if (wf?.uuid) navigate(`/workflows/${wf.uuid}`);
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };
  const copyDataset = async () => {
    setBusy(true);
    try {
      await api.datasets.copy(it.ref.uuid);
      toast.success(t('communities.datasetCopied'));
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setBusy(false); }
  };

  const gone = (it.type === 'workflow' || it.type === 'dataset') && !it.ref;
  const dims = Array.isArray(it.ref?.dimensions) ? it.ref.dimensions.join('×') : null;

  return (
    <li className="flex items-start gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-hover)' }} data-testid="community-item">
      <span className="mt-0.5"><ItemIcon it={it} /></span>
      <div className="min-w-0 flex-1">
        {it.type === 'link' && (
          <a href={it.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-medium hover:underline inline-flex items-center gap-1 break-all" style={tstyle}>
            {it.title} <ExternalLink className="w-3 h-3 opacity-60 flex-shrink-0" />
          </a>
        )}
        {it.type === 'file' && <button className={titleBtn} style={tstyle} onClick={() => onOpen({ uuid: it.uuid })}>{it.title}</button>}
        {it.type === 'text' && <button className={titleBtn} style={tstyle} onClick={() => onOpen({ text: it })}>{it.title}</button>}
        {it.type === 'workflow' && (gone
          ? <span className="text-sm font-medium" style={tstyle}>{it.title}</span>
          : <Link to={`/workflows/${it.ref.uuid}`} className={titleBtn} style={tstyle}>{it.title}</Link>)}
        {it.type === 'dataset' && (gone
          ? <span className="text-sm font-medium" style={tstyle}>{it.title}</span>
          : <Link to={`/datasets/${it.ref.uuid}`} className={titleBtn} style={tstyle}>{it.title}</Link>)}
        <div className="text-xs break-words" style={muted}>
          {it.type === 'link' && it.url}
          {it.type === 'file' && `${it.file_name || ''} · ${fmtSize(it.file_size || 0)}`}
          {it.type === 'text' && t('communities.textItem')}
          {it.type === 'workflow' && (gone ? t('communities.refUnavailable') : t('communities.itemWorkflow'))}
          {it.type === 'dataset' && (gone ? t('communities.refUnavailable') : `${t('communities.itemDataset')}${dims ? ` · ${dims}` : ''}`)}
          {it.description && it.type !== 'text' && ` — ${it.description}`}
        </div>
        {!gone && (it.type === 'workflow' || it.type === 'dataset') && (
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1.5" onClick={() => onPreview({ kind: it.type, uuid: it.ref.uuid, name: it.title })}><Eye className="w-3 h-3" /> {t('quiz.preview')}</button>
            <Link to={it.type === 'workflow' ? `/workflows/${it.ref.uuid}` : `/datasets/${it.ref.uuid}`} className="btn-ghost text-xs py-1 px-2.5">{t('communities.open')}</Link>
            <button className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1.5" disabled={busy} onClick={it.type === 'workflow' ? copyWorkflow : copyDataset}>
              <Copy className="w-3 h-3" /> {it.type === 'workflow' ? t('communities.copyWorkflow') : t('communities.copyDataset')}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5 flex-shrink-0">
        {it.type === 'workflow' && !gone && <AccessChip access={it.access} />}
        {it.type === 'file' && it.preview_status === 'pending' && <span className="badge badge-blue" title={t('communities.previewPending')}>{t('communities.previewBadge')}</span>}
        {it.is_visible === false && <span className="badge badge-amber">{t('communities.hidden')}</span>}
        {canEdit && (
          <div className="flex">
            <button className="btn-ghost p-1.5" aria-label={t('communities.moveUp')} title={t('communities.moveUp')} disabled={idx === 0} onClick={() => onMoveItem(idx, -1)}><ChevronUp className="w-4 h-4" /></button>
            <button className="btn-ghost p-1.5" aria-label={t('communities.moveDown')} title={t('communities.moveDown')} disabled={idx === total - 1} onClick={() => onMoveItem(idx, 1)}><ChevronDown className="w-4 h-4" /></button>
            <button className="btn-ghost p-1.5" aria-label={t('communities.editItem')} title={t('communities.editItem')} onClick={() => onEditItem(it)}><Pencil className="w-4 h-4" /></button>
            <button className="btn-ghost p-1.5" aria-label={it.is_visible ? t('communities.hide') : t('communities.show')} title={it.is_visible ? t('communities.hide') : t('communities.show')}
              onClick={() => run(() => api.communities.updateItem(id, it.uuid, { is_visible: !it.is_visible }), null, reload)}>
              {it.is_visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button className="btn-ghost p-1.5" aria-label={t('common.delete')} title={t('common.delete')}
              onClick={() => { if (window.confirm(t('communities.deleteItemConfirm'))) run(() => api.communities.deleteItem(id, it.uuid), t('communities.itemDeleted'), reload); }}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function TopicCard({ topic, canEdit, id, run, reload, onOpen, onEditTopic, onAddItem, onAddTopic, onAddQuiz, onEditItem, onPreview, onMoveItem, onMoveTopic, canUp, canDown, depth = 0, collapsed, onToggle, children }) {
  const { t } = useTranslation();
  const items = arr(topic.items);
  const projs = arr(topic.projects);
  const quizzes = arr(topic.quizzes);
  const kids = React.Children.toArray(children);
  const isTopic = !!topic.uuid;
  const total = items.length + projs.length + quizzes.length;
  const body = (
    <>
      {total === 0 && kids.length === 0 && <p className="text-sm" style={muted}>{t('communities.topicEmpty')}</p>}
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <ItemRow key={it.uuid} it={it} idx={i} total={items.length} canEdit={canEdit} id={id} run={run} reload={reload}
            onOpen={onOpen} onEditItem={onEditItem} onMoveItem={onMoveItem} onPreview={onPreview} />
        ))}
        {quizzes.map(q => (
          <li key={q.uuid}>
            <Link to={`/communities/${id}/quizzes/${q.uuid}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:opacity-90" style={{ background: 'var(--bg-hover)' }} data-testid="quiz-row">
              <ClipboardList className="w-4 h-4 flex-shrink-0 text-pink-400" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{q.title}</span>
                <span className="block text-xs" style={muted}>
                  {t('quiz.questionsCount', { count: q.question_count })}
                  {q.due_at ? ` · ${t('quiz.dueOn', { date: new Date(q.due_at).toLocaleString(currentLocale(), { dateStyle: 'short', timeStyle: 'short' }) })}` : ''}
                  {canEdit ? ` · ${t('quiz.submissionsShort', { count: q.submission_count })}` : ''}
                </span>
              </span>
              {canEdit ? <StatusBadge status={q.status} /> : (q.my_status ? <SubStatusBadge status={q.my_status} /> : <StatusBadge status={q.status} />)}
              <ChevronRight className="w-4 h-4" style={muted} />
            </Link>
          </li>
        ))}
        {projs.map(p => (
          <li key={p.uuid} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--bg-hover)' }}>
            <FolderOpen className="w-4 h-4 flex-shrink-0 text-purple-400" />
            <Link to={`/projects/${p.uuid}`} className="min-w-0 flex-1 text-sm font-medium hover:underline truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</Link>
            <span className="text-xs hidden sm:inline" style={muted}>{p.owner_name}</span>
            <AccessChip access={p.access} />
          </li>
        ))}
      </ul>
      {kids.length > 0 && <div className="mt-4 space-y-3 pl-3 sm:pl-5" style={{ borderLeft: '2px solid var(--border)' }}>{kids}</div>}
    </>
  );
  return (
    <div className={depth === 0 ? 'card p-5' : 'rounded-xl p-4'} style={{ ...(depth > 0 ? { background: 'var(--bg-card, rgba(255,255,255,0.03))', border: '1px solid var(--border)' } : {}), ...(topic.is_visible === false ? { opacity: 0.7 } : {}) }} data-testid="community-topic" data-depth={depth}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-3">
        <div className="min-w-0 flex-1 flex items-start gap-2">
          {isTopic && (
            <button type="button" className="btn-ghost p-1 mt-0.5" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? t('communities.expand') : t('communities.collapse')}>
              <ChevronDown className="w-4 h-4" style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }} />
            </button>
          )}
          <div className="min-w-0">
            <h3 className={`font-semibold flex items-center gap-2 ${depth > 0 ? 'text-sm' : ''}`} style={{ color: 'var(--text-primary)' }}>
              {topic.title}
              {topic.is_visible === false && <span className="badge badge-amber">{t('communities.hidden')}</span>}
              {collapsed && total + kids.length > 0 && <span className="text-xs font-normal" style={muted}>({total + kids.length})</span>}
            </h3>
            {topic.description && <p className="text-sm mt-1" style={muted}>{topic.description}</p>}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap sm:justify-end gap-1 sm:flex-shrink-0">
            <button className="btn-ghost p-1.5" aria-label={t('communities.addItem')} title={t('communities.addItem')} onClick={() => onAddItem(topic.uuid || '', undefined)}><Plus className="w-4 h-4" /></button>
            {isTopic && <>
              {depth < 2 && <button className="btn-ghost p-1.5" aria-label={t('communities.addSubtopic')} title={t('communities.addSubtopic')} onClick={() => onAddTopic(topic.uuid)}><FolderPlus className="w-4 h-4" /></button>}
              <button className="btn-ghost p-1.5" aria-label={t('quiz.newQuiz')} title={t('quiz.newQuiz')} onClick={() => onAddQuiz(topic.uuid)}><ClipboardList className="w-4 h-4" /></button>
              <button className="btn-ghost p-1.5" aria-label={t('communities.moveTopicUp')} title={t('communities.moveTopicUp')} disabled={!canUp} onClick={() => onMoveTopic(-1)}><ChevronUp className="w-4 h-4" /></button>
              <button className="btn-ghost p-1.5" aria-label={t('communities.moveTopicDown')} title={t('communities.moveTopicDown')} disabled={!canDown} onClick={() => onMoveTopic(1)}><ChevronDown className="w-4 h-4" /></button>
              <button className="btn-ghost p-1.5" aria-label={t('common.edit')} title={t('common.edit')} onClick={() => onEditTopic(topic)}><Pencil className="w-4 h-4" /></button>
              <button className="btn-ghost p-1.5" aria-label={topic.is_visible ? t('communities.hide') : t('communities.show')} title={topic.is_visible ? t('communities.hide') : t('communities.show')}
                onClick={() => run(() => api.communities.updateSection(id, topic.uuid, { is_visible: !topic.is_visible }), null, reload)}>
                {topic.is_visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button className="btn-ghost p-1.5" aria-label={t('common.delete')} title={t('common.delete')}
                onClick={() => { if (window.confirm(t('communities.deleteTopicConfirm'))) run(() => api.communities.deleteSection(id, topic.uuid), t('communities.topicDeleted'), reload); }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </>}
          </div>
        )}
      </div>
      {!collapsed && body}
    </div>
  );
}

function SectionModal({ state, onClose, id, sections, reload }) {
  const { t } = useTranslation();
  const s = state?.section;
  const [form, setForm] = useState({ title: '', description: '', parent: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (state) setForm({ title: s?.title || '', description: s?.description || '', parent: (s ? s.parent : state.parent) || '' }); }, [state]); // eslint-disable-line

  // Destinos válidos: nunca o próprio tópico nem seus descendentes; e respeitando 3 níveis no máximo.
  const options = useMemo(() => {
    const banned = new Set();
    if (s) {
      banned.add(s.uuid);
      let grew = true;
      while (grew) { grew = false; sections.forEach(x => { if (x.parent && banned.has(x.parent) && !banned.has(x.uuid)) { banned.add(x.uuid); grew = true; } }); }
    }
    const height = (uuid) => 1 + Math.max(0, ...sections.filter(x => x.parent === uuid).map(x => height(x.uuid)));
    const h = s ? height(s.uuid) : 1;
    return sections.filter(x => !banned.has(x.uuid) && x.depth + 1 + h <= 3);
  }, [sections, s]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const body = { title: form.title, description: form.description, parent: form.parent || null };
      if (s) await api.communities.updateSection(id, s.uuid, body); else await api.communities.createSection(id, body);
      toast.success(t('communities.topicSaved')); await reload(); onClose();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!state} onClose={onClose} title={s ? t('communities.editTopic') : (state?.parent ? t('communities.addSubtopic') : t('communities.addTopic'))} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.topicTitle')}</label>
          <input className="input-field" value={form.title} maxLength={255} autoFocus onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t('communities.topicTitlePlaceholder')} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('common.description')}</label>
          <textarea className="input-field resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.insideTopic')}</label>
          <select className="input-field" value={form.parent} onChange={e => setForm(f => ({ ...f, parent: e.target.value }))} aria-label={t('communities.insideTopic')}>
            <option value="">{t('communities.topLevel')}</option>
            {options.map(o => <option key={o.uuid} value={o.uuid}>{indent(o.depth)}{o.title}</option>)}
          </select>
          <p className="text-xs mt-1" style={muted}>{t('communities.nestingHint')}</p>
        </div>
        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary flex-1" disabled={saving || !form.title.trim()}>{saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}

const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip';

function ItemModal({ state, onClose, id, sections, reload }) {
  const { t } = useTranslation();
  const [type, setType] = useState('file');
  const [form, setForm] = useState({ title: '', url: '', description: '', section_id: '', ref: '', access: 'read' });
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(null); // {current,total}
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => {
    if (state) {
      setType(state.type || 'file'); setFiles([]); setProgress(null); setDragOver(false);
      setForm({ title: '', url: '', description: '', section_id: state.sectionId || '', ref: '', access: 'read' });
    }
  }, [state]);

  const open = !!state;
  const { data: wfData } = useApi(() => (open && type === 'workflow' ? api.workflows.list({ limit: 200 }) : null), [open, type]);
  const { data: dsData } = useApi(() => (open && type === 'dataset' ? api.datasets.list({ limit: 200 }) : null), [open, type]);
  const { data: prData } = useApi(() => (open && type === 'project' ? api.projects.list({ scope: 'mine' }) : null), [open, type]);
  const myWorkflows = arr(wfData);
  const myDatasets = arr(dsData);
  const myProjects = arr(prData).filter(p => p.my_access === 'owner' || p.my_access === 'admin');

  const addFiles = (list) => {
    const incoming = Array.from(list || []);
    setFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}:${f.size}`));
      return [...prev, ...incoming.filter(f => !seen.has(`${f.name}:${f.size}`))];
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (type === 'file') {
        if (!files.length) { toast.error(t('communities.chooseFile')); return; }
        let done = 0;
        for (const f of files) {
          setProgress({ current: done + 1, total: files.length });
          const fd = new FormData();
          fd.append('file', f);
          if (files.length === 1 && form.title.trim()) fd.append('title', form.title.trim());
          if (form.description.trim()) fd.append('description', form.description.trim());
          if (form.section_id) fd.append('section_id', form.section_id);
          await api.communities.createItem(id, fd, true);
          done += 1;
        }
        toast.success(files.length > 1 ? t('communities.itemsSaved', { count: files.length }) : t('communities.itemSaved'));
      } else if (type === 'project') {
        if (!form.ref) { toast.error(t('communities.selectProjectError')); return; }
        await api.communities.linkProject(id, form.ref, form.access, form.section_id || null);
        toast.success(t('communities.projectLinked'));
      } else if (type === 'workflow' || type === 'dataset') {
        if (!form.ref) { toast.error(type === 'workflow' ? t('communities.chooseWorkflow') : t('communities.chooseDataset')); return; }
        await api.communities.createItem(id, {
          type, ref: form.ref, title: form.title.trim() || undefined, description: form.description.trim() || undefined,
          access: type === 'workflow' ? form.access : undefined, section_id: form.section_id || undefined,
        });
        toast.success(t('communities.itemSaved'));
      } else {
        await api.communities.createItem(id, { type, ...form, ref: undefined, access: undefined, section_id: form.section_id || undefined });
        toast.success(t('communities.itemSaved'));
      }
      await reload(); onClose();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); setProgress(null); }
  };

  const types = [
    { v: 'file', icon: Presentation, label: t('communities.itemFile') },
    { v: 'workflow', icon: GitBranch, label: t('communities.itemWorkflow') },
    { v: 'dataset', icon: Database, label: t('communities.itemDataset') },
    { v: 'project', icon: FolderOpen, label: t('communities.itemProject') },
    { v: 'link', icon: Link2, label: t('communities.itemLink') },
    { v: 'text', icon: Pencil, label: t('communities.itemText') },
  ];
  const refList = type === 'workflow' ? myWorkflows : type === 'dataset' ? myDatasets : myProjects;
  return (
    <Modal open={open} onClose={onClose} title={t('communities.addItem')} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-hover)' }} role="tablist">
          {types.map(x => (
            <button key={x.v} type="button" role="tab" aria-selected={type === x.v} onClick={() => { setType(x.v); setForm(f => ({ ...f, ref: '' })); }}
              className="px-2 py-2 rounded-lg text-xs font-medium flex flex-col items-center justify-center gap-1"
              style={{ background: type === x.v ? 'var(--accent)' : 'transparent', color: type === x.v ? '#fff' : 'var(--text-secondary)' }}>
              <x.icon className="w-4 h-4" /><span className="leading-tight text-center">{x.label}</span>
            </button>
          ))}
        </div>

        {type === 'file' && (
          <div>
            <div role="button" tabIndex={0} data-testid="drop-zone"
              onClick={() => inputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              className="rounded-xl p-6 text-center cursor-pointer transition-colors"
              style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, background: dragOver ? 'var(--bg-hover)' : 'transparent' }}>
              <Upload className="w-6 h-6 mx-auto mb-2" style={muted} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('communities.dropFiles')}</p>
              <p className="text-xs mt-1" style={muted}>{t('communities.fileHint')}</p>
              <input ref={inputRef} type="file" multiple className="hidden" accept={FILE_ACCEPT} data-testid="file-input"
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {files.length > 0 && (
              <ul className="mt-3 space-y-1">
                {files.map((f, i) => (
                  <li key={`${f.name}:${f.size}`} className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                    <FileIcon className="w-4 h-4 flex-shrink-0" style={muted} />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs" style={muted}>{fmtSize(f.size)}</span>
                    <button type="button" className="btn-ghost p-1" aria-label={t('common.delete')} disabled={saving} onClick={() => setFiles(list => list.filter((_, j) => j !== i))}><X className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            {OFFICE_RE.test(files.map(f => f.name).join(' ')) || files.some(f => OFFICE_RE.test(f.name)) ? (
              <p className="text-xs mt-2" style={muted}>{t('communities.officeHint')}</p>
            ) : null}
          </div>
        )}

        {(type === 'workflow' || type === 'dataset' || type === 'project') && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={lbl}>
              {type === 'workflow' ? t('communities.chooseWorkflow') : type === 'dataset' ? t('communities.chooseDataset') : t('communities.selectProjectLabel')}
            </label>
            <select className="input-field" value={form.ref} onChange={e => setForm(f => ({ ...f, ref: e.target.value }))} data-testid="ref-select">
              <option value="">{t('communities.chooseOption')}</option>
              {refList.map(x => <option key={x.uuid} value={x.uuid}>{x.name}</option>)}
            </select>
            {refList.length === 0 && (
              <p className="text-xs mt-1.5" style={muted}>
                {type === 'workflow' ? t('communities.noWorkflows') : type === 'dataset' ? t('communities.noDatasets') : t('communities.noLinkableProjects')}
              </p>
            )}
            <p className="text-xs mt-1.5" style={muted}>
              {type === 'workflow' ? t('communities.workflowHint') : type === 'dataset' ? t('communities.datasetHint') : t('communities.projectHint')}
            </p>
          </div>
        )}
        {(type === 'workflow' || type === 'project') && <AccessPicker value={form.access} onChange={v => setForm(f => ({ ...f, access: v }))} />}

        {type !== 'project' && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.itemTitle')}{type === 'file' && files.length > 1 ? ` (${t('communities.titleFromFiles')})` : ''}</label>
            <input className="input-field" value={form.title} maxLength={255} disabled={type === 'file' && files.length > 1}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={type === 'file' || type === 'workflow' || type === 'dataset' ? t('communities.titleOptional') : ''} />
          </div>
        )}
        {type === 'link' && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={lbl}>URL</label>
            <input className="input-field" type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://" />
          </div>
        )}
        {type !== 'project' && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={lbl}>{type === 'text' ? t('communities.textContent') : t('common.description')}</label>
            <textarea className="input-field resize-none" rows={type === 'text' ? 6 : 2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.topic')}</label>
          <select className="input-field" value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))}>
            <option value="">{t('communities.generalTopic')}</option>
            {sections.map(s => <option key={s.uuid} value={s.uuid}>{indent(s.depth)}{s.title}</option>)}
          </select>
        </div>
        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? (progress ? t('communities.uploadingProgress', progress) : t('common.saving')) : t('common.add')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditItemModal({ item, onClose, id, sections, general, reload }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ title: '', description: '', url: '', section_id: '', access: 'read' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!item) return;
    const sec = sections.find(s => arr(s.items).some(i => i.uuid === item.uuid));
    setForm({ title: item.title || '', description: item.description || '', url: item.url || '', section_id: sec?.uuid || '', access: item.access || 'read' });
  }, [item]); // eslint-disable-line
  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const body = { title: form.title.trim(), description: form.description, section_id: form.section_id || null };
      if (item.type === 'link') body.url = form.url;
      if (item.type === 'workflow') body.access = form.access;
      await api.communities.updateItem(id, item.uuid, body);
      toast.success(t('communities.itemUpdated')); await reload(); onClose();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!item} onClose={onClose} title={t('communities.editItem')} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.itemTitle')}</label>
          <input className="input-field" value={form.title} maxLength={255} autoFocus onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        </div>
        {item?.type === 'link' && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={lbl}>URL</label>
            <input className="input-field" type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{item?.type === 'text' ? t('communities.textContent') : t('common.description')}</label>
          <textarea className="input-field resize-none" rows={item?.type === 'text' ? 6 : 2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        {item?.type === 'workflow' && <AccessPicker value={form.access} onChange={v => setForm(f => ({ ...f, access: v }))} />}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.topic')}</label>
          <select className="input-field" value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))}>
            <option value="">{t('communities.generalTopic')}</option>
            {sections.map(s => <option key={s.uuid} value={s.uuid}>{indent(s.depth)}{s.title}</option>)}
          </select>
        </div>
        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary flex-1" disabled={saving || !form.title.trim()}>{saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}

/** PDF/imagem e PPT/DOC/XLS (via PDF convertido) inline; "texto" abre como leitura. Original sempre baixável. */
function FileViewer({ state, item, onClose, id }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(null);
  const [mime, setMime] = useState('');
  const [err, setErr] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const it = item;
  const office = isOffice(it);
  const previewStatus = it?.preview_status;
  const fetchPreview = office && previewStatus === 'ready';
  const fetchOriginal = !!it && !office;

  useEffect(() => {
    let revoked = null; let alive = true;
    setUrl(null); setErr(false);
    if (it && (fetchPreview || fetchOriginal)) {
      api.communities.fileBlob(id, it.uuid, { preview: fetchPreview }).then(res => {
        if (!alive) return;
        const type = fetchPreview ? 'application/pdf' : (res.headers?.['content-type'] || it.file_mime || '');
        revoked = URL.createObjectURL(new Blob([res.data], { type }));
        setMime(type); setUrl(revoked);
      }).catch(() => alive && setErr(true));
    }
    return () => { alive = false; if (revoked) URL.revokeObjectURL(revoked); };
  }, [it?.uuid, id, fetchPreview, fetchOriginal]); // eslint-disable-line

  const download = async () => {
    setDownloading(true);
    try {
      const res = await api.communities.fileBlob(id, it.uuid, { download: true });
      const href = URL.createObjectURL(new Blob([res.data], { type: it.file_mime || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = href; a.download = it.file_name || 'file'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } catch { toast.error(t('communities.fileError')); } finally { setDownloading(false); }
  };

  if (!state) return null;
  if (state.text) {
    return (
      <Modal open onClose={onClose} title={state.text.title} size="lg">
        <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{state.text.description}</div>
      </Modal>
    );
  }
  if (!it) return null;
  const isPdf = mime === 'application/pdf';
  const isImg = mime.startsWith('image/');
  return (
    <Modal open onClose={onClose} title={it.title} size="xl">
      {err && <p className="text-sm text-red-400">{t('communities.fileError')}</p>}
      {office && previewStatus === 'pending' && <p className="text-sm" style={muted} role="status">{t('communities.previewPending')}</p>}
      {office && previewStatus === 'failed' && <p className="text-sm mb-3" style={lbl}>{t('communities.previewFailed')}</p>}
      {!err && (fetchPreview || fetchOriginal) && !url && <p className="text-sm" style={muted}>{t('common.loading')}</p>}
      {url && isPdf && <iframe title={it.title} src={url} style={{ width: '100%', height: '70vh', border: 0, borderRadius: 8, background: '#fff' }} />}
      {url && isImg && <img src={url} alt={it.title} style={{ maxWidth: '100%', maxHeight: '70vh', margin: '0 auto', display: 'block' }} />}
      {url && !isPdf && !isImg && <p className="text-sm mb-3" style={lbl}>{t('communities.noPreview')}</p>}
      {!office && !err && !url && null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {url && isPdf && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-ghost flex items-center gap-2"><ExternalLink className="w-4 h-4" /> {t('communities.openNewTab')}</a>
        )}
        <button className="btn-primary flex items-center gap-2" disabled={downloading} onClick={download}><Download className="w-4 h-4" /> {t('communities.download')}</button>
      </div>
    </Modal>
  );
}

/* ═══════════════════════ Apps da comunidade ═══════════════════════ */

function AppCard({ icon: Icon, color, title, desc, onClick, disabled, testid }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testid}
      className="card p-4 text-left flex items-start gap-3 transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
      style={{ cursor: disabled ? 'default' : 'pointer' }}>
      <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-hover)' }}><Icon className={`w-5 h-5 ${color}`} /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
        <span className="block text-xs mt-0.5" style={muted}>{desc}</span>
      </span>
    </button>
  );
}

function AppsTab({ id, data, perms, onAddItem, onAddTopic, onAddQuiz }) {
  const { t } = useTranslation();
  const canEdit = !!perms.can_moderate;
  const { data: quizzes } = useApi(() => api.quizzes.list(id), [id, data]);
  const list = arr(quizzes);
  return (
    <div className="space-y-6">
      {canEdit && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={muted}>{t('communities.appsCreate')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AppCard testid="app-quiz" icon={ClipboardList} color="text-pink-400" title={t('quiz.appTitle')} desc={t('quiz.appDesc')} onClick={onAddQuiz} />
            <AppCard testid="app-file" icon={Presentation} color="text-orange-400" title={t('communities.appFileTitle')} desc={t('communities.appFileDesc')} onClick={() => onAddItem('file')} />
            <AppCard testid="app-workflow" icon={GitBranch} color="text-purple-400" title={t('communities.appWorkflowTitle')} desc={t('communities.appWorkflowDesc')} onClick={() => onAddItem('workflow')} />
            <AppCard testid="app-dataset" icon={Database} color="text-cyan-400" title={t('communities.appDatasetTitle')} desc={t('communities.appDatasetDesc')} onClick={() => onAddItem('dataset')} />
            <AppCard testid="app-project" icon={FolderOpen} color="text-indigo-400" title={t('communities.appProjectTitle')} desc={t('communities.appProjectDesc')} onClick={() => onAddItem('project')} />
            <AppCard testid="app-link" icon={Link2} color="text-blue-400" title={t('communities.appLinkTitle')} desc={t('communities.appLinkDesc')} onClick={() => onAddItem('link')} />
            <AppCard testid="app-text" icon={FileText} color="text-emerald-400" title={t('communities.appTextTitle')} desc={t('communities.appTextDesc')} onClick={() => onAddItem('text')} />
            <AppCard testid="app-topic" icon={FolderPlus} color="text-amber-400" title={t('communities.appTopicTitle')} desc={t('communities.appTopicDesc')} onClick={onAddTopic} />
            <AppCard icon={Sparkles} color="text-slate-400" title={t('communities.appStudyTitle')} desc={t('communities.appStudyDesc')} disabled />
          </div>
        </section>
      )}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={muted}>{t('quiz.appTitle')}</h2>
        {list.length === 0 ? (
          <EmptyState icon={ClipboardList} title={t('quiz.noneTitle')} description={canEdit ? t('quiz.noneDescEdit') : t('quiz.noneDesc')}
            action={canEdit ? <button className="btn-primary text-sm flex items-center gap-1.5" onClick={onAddQuiz}><Plus className="w-3.5 h-3.5" /> {t('quiz.newQuiz')}</button> : undefined} />
        ) : (
          <ul className="space-y-2">
            {list.map(q => (
              <li key={q.uuid}>
                <Link to={`/communities/${id}/quizzes/${q.uuid}`} className="card p-4 flex items-center gap-3 hover:opacity-90" data-testid="quiz-list-row">
                  <ClipboardList className="w-5 h-5 text-pink-400 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{q.title}</span>
                    <span className="block text-xs" style={muted}>
                      {t('quiz.questionsCount', { count: q.question_count })}
                      {q.due_at ? ` · ${t('quiz.dueOn', { date: new Date(q.due_at).toLocaleString(currentLocale(), { dateStyle: 'short', timeStyle: 'short' }) })}` : ''}
                      {canEdit ? ` · ${t('quiz.submissionsShort', { count: q.submission_count })}` : (q.my_score != null && q.my_status === 'graded' ? ` · ${t('quiz.yourScore')}: ${q.my_score}/${q.total_points}` : '')}
                    </span>
                  </span>
                  {canEdit ? <StatusBadge status={q.status} /> : (q.my_status ? <SubStatusBadge status={q.my_status} /> : <StatusBadge status={q.status} />)}
                  <ChevronRight className="w-4 h-4" style={muted} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function QuizModal({ state, onClose, id, sections }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', section: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (state) setForm({ title: '', description: '', section: state.sectionId || '' }); }, [state]);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const res = await api.quizzes.create(id, { title: form.title.trim(), description: form.description, section: form.section || null });
      const q = res.data?.data ?? res.data;
      toast.success(t('quiz.created')); onClose(); navigate(`/communities/${id}/quizzes/${q.uuid}`);
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!state} onClose={onClose} title={t('quiz.newQuiz')} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.itemTitle')}</label>
          <input className="input-field" value={form.title} maxLength={255} autoFocus placeholder={t('quiz.titlePlaceholder')} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('common.description')}</label>
          <textarea className="input-field resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.topic')}</label>
          <select className="input-field" value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}>
            <option value="">{t('communities.generalTopic')}</option>
            {sections.map(s => <option key={s.uuid} value={s.uuid}>{indent(s.depth)}{s.title}</option>)}
          </select>
        </div>
        <p className="text-xs" style={muted}>{t('quiz.createHint')}</p>
        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary flex-1" disabled={saving || !form.title.trim()}>{saving ? t('common.saving') : t('quiz.createAndEdit')}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ═══════════════════════ Projetos vinculados ═══════════════════════ */

function ProjectsTab({ id, list, perms, isMember, me, run, reload, onLink }) {
  const { t } = useTranslation();
  const canOrganize = !!perms.can_moderate;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" style={muted}>{isMember ? t('communities.projectsMemberDesc') : t('communities.projectsPublicDesc')}</p>
        {perms.can_link && <button className="btn-primary text-sm py-1.5 flex items-center gap-1.5 flex-shrink-0" onClick={onLink}><Plus className="w-3.5 h-3.5" /> {t('communities.linkProject')}</button>}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={FolderOpen} title={t('communities.noProjectsTitle')} description={perms.can_link ? t('communities.noProjectsDesc') : ''} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map(p => (
            <div key={p.uuid} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/projects/${p.uuid}`} className="min-w-0 hover:underline">
                  <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                  <div className="text-xs line-clamp-2" style={muted}>{p.description || t('common.noDescription')}</div>
                </Link>
                <AccessChip access={p.access} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs" style={muted}>
                <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> {p.workflow_count}</span>
                <span className="flex items-center gap-1"><Database className="w-3 h-3" /> {p.dataset_count}</span>
                <Link to={`/users/${p.owner_uuid}`} className="flex items-center gap-1 hover:underline ml-auto"><Avatar name={p.owner_name} src={p.owner_avatar_url} size={16} /> {p.owner_name}</Link>
              </div>
              {(canOrganize || p.shared_by_uuid === me?.uuid || p.owner_uuid === me?.uuid) && (
                <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                  {p.owner_uuid === me?.uuid && (
                    <select aria-label={t('communities.accessLevel')} className="input-field !w-auto !py-1 text-xs" value={p.access}
                      onChange={e => run(() => api.communities.updateProjectLink(id, p.uuid, { access: e.target.value }), t('communities.accessUpdated'), reload)}>
                      <option value="read">{t('communities.accessRead')}</option>
                      <option value="edit">{t('communities.accessEdit')}</option>
                    </select>
                  )}
                  <button className="btn-ghost text-xs ml-auto flex items-center gap-1" onClick={() => run(() => api.communities.unlinkProject(id, p.uuid), t('projects.unlinked'), reload)}>
                    <X className="w-3.5 h-3.5" /> {t('projects.unlink')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkProjectModal({ open, onClose, id, linked, sections, onDone }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState('');
  const [access, setAccess] = useState('read');
  const [sectionId, setSectionId] = useState('');
  const [saving, setSaving] = useState(false);
  const { data } = useApi(() => (open ? api.projects.list({ scope: 'mine' }) : null), [open]);
  const mine = arr(data).filter(p => (p.my_access === 'owner' || p.my_access === 'admin') && !linked.find(l => l.uuid === p.uuid));
  const submit = async () => {
    setSaving(true);
    try { await api.communities.linkProject(id, sel, access, sectionId || null); toast.success(t('communities.projectLinked')); setSel(''); onDone(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('communities.linkProject')} size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.selectProjectLabel')}</label>
          <select className="input-field" value={sel} onChange={e => setSel(e.target.value)}>
            <option value="">{t('communities.chooseOption')}</option>
            {mine.map(p => <option key={p.uuid} value={p.uuid}>{p.name}</option>)}
          </select>
          {mine.length === 0 && <p className="text-xs mt-1.5" style={muted}>{t('communities.noLinkableProjects')}</p>}
        </div>
        <AccessPicker value={access} onChange={setAccess} />
        {sections.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.topic')}</label>
            <select className="input-field" value={sectionId} onChange={e => setSectionId(e.target.value)}>
              <option value="">{t('communities.generalTopic')}</option>
              {sections.map(s => <option key={s.uuid} value={s.uuid}>{indent(s.depth)}{s.title}</option>)}
            </select>
          </div>
        )}
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary flex-1" disabled={saving || !sel} onClick={submit}>{saving ? t('communities.linking') : t('communities.link')}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════ Membros ═══════════════════════ */

const RANK = { member: 1, moderator: 2, admin: 3, owner: 4 };

function MembersTab({ id, list, me, myRole, perms, run, reload }) {
  const { t } = useTranslation();
  const { data: bans, refetch: refetchBans } = useApi(() => (perms.can_manage ? api.communities.listBans(id) : null), [id, perms.can_manage]);
  const myRank = RANK[myRole] || 0;
  const [confirm, setConfirm] = useState(null);
  return (
    <div className="space-y-6">
      <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
        {list.map(m => {
          const self = m.uuid === me?.uuid;
          const targetRank = RANK[m.role] || 1;
          const canTouch = !self && m.role !== 'owner' && (myRole === 'owner' || targetRank < myRank);
          return (
            <div key={m.uuid} className="p-3 flex flex-wrap items-center gap-3" style={{ borderColor: 'var(--border)' }}>
              <Avatar user={m} size={36} />
              <Link to={`/users/${m.uuid}`} className="min-w-0 flex-1 hover:underline">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.name}{self ? ` (${t('projects.you')})` : ''}</div>
                <div className="text-xs truncate" style={muted}>{m.institution || m.research_area || ''}</div>
              </Link>
              {m.role === 'owner' && <Crown className="w-4 h-4 text-amber-400" />}
              {perms.can_manage && canTouch ? (
                <select aria-label={t('projects.role')} className="input-field !w-auto !py-1 text-xs" value={m.role}
                  onChange={e => run(() => api.communities.updateMember(id, m.uuid, { role: e.target.value }), t('communities.memberUpdated'), reload)}>
                  <option value="member">{t('communities.roles.member')}</option>
                  <option value="moderator">{t('communities.roles.moderator')}</option>
                  {myRole === 'owner' && <option value="admin">{t('communities.roles.admin')}</option>}
                </select>
              ) : <RoleBadge role={m.role} />}
              {perms.can_manage && canTouch && m.role !== 'admin' && (
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={muted} title={t('communities.canLinkHint')}>
                  <input type="checkbox" checked={!!m.can_link} style={{ accentColor: 'var(--accent)' }}
                    onChange={e => run(() => api.communities.updateMember(id, m.uuid, { can_link: e.target.checked }), t('communities.memberUpdated'), reload)} />
                  {t('communities.canLink')}
                </label>
              )}
              {perms.can_moderate && canTouch && (
                <button className="btn-ghost p-1.5" aria-label={t('communities.remove')} title={t('communities.remove')} onClick={() => setConfirm(m)}><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
          );
        })}
      </div>

      {perms.can_manage && arr(bans).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider mb-2" style={muted}>{t('communities.banned')}</h3>
          <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
            {arr(bans).map(b => (
              <div key={b.uuid} className="p-3 flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
                <Ban className="w-4 h-4 text-red-400" />
                <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{b.name}</span>
                <button className="btn-ghost text-xs" onClick={() => run(() => api.communities.removeBan(id, b.uuid), t('communities.unbanned'), refetchBans)}>{t('communities.unban')}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={t('communities.remove')} size="sm">
        <p className="mb-5" style={lbl}>{t('communities.removeConfirm', { name: confirm?.name })}</p>
        <div className="flex flex-col gap-2">
          <button className="btn-danger" onClick={() => run(() => api.communities.removeMember(id, confirm.uuid), t('communities.memberRemoved'), async () => { setConfirm(null); await reload(); })}>{t('communities.remove')}</button>
          {perms.can_manage && (
            <button className="btn-danger" onClick={() => run(() => api.communities.removeMember(id, confirm.uuid, true), t('communities.memberRemoved'), async () => { setConfirm(null); await reload(); await refetchBans(); })}>{t('communities.removeAndBan')}</button>
          )}
          <button className="btn-ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</button>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════ Chat ═══════════════════════ */

function ChatTab({ id, me, perms }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const { data: msgs, refetch } = useApi(() => api.communities.listMessages(id, { limit: 100 }), [id]);
  const list = arr(msgs);
  const lastId = list[list.length - 1]?.uuid;

  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden) refetch().catch(() => {}); }, 6000);
    return () => clearInterval(iv);
  }, [refetch]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [lastId]);

  const send = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setSending(true);
    try { await api.communities.sendMessage(id, { content }); setText(''); await refetch(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSending(false); }
  };
  const remove = async (m) => {
    try { await api.communities.deleteMessage(id, m.uuid); await refetch(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
  };

  return (
    <div className="card flex flex-col" style={{ height: '60vh', minHeight: 320 }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {list.length === 0 && <EmptyState icon={MessageSquare} title={t('communities.noMessagesTitle')} description={t('communities.noMessagesDesc')} />}
        {list.map(m => {
          const mine = m.user_uuid === me?.uuid;
          return (
            <div key={m.uuid} className={`flex gap-2.5 group ${mine ? 'flex-row-reverse' : ''}`}>
              <Avatar name={m.user_name} src={m.user_avatar_url} size={30} />
              <div className={`max-w-[75%] ${mine ? 'text-right' : ''}`}>
                <div className="text-xs mb-0.5" style={muted}>
                  {m.user_name} · {new Date(m.created_at).toLocaleString(currentLocale(), { dateStyle: 'short', timeStyle: 'short' })}
                </div>
                <div className="inline-block rounded-xl px-3 py-2 text-sm text-left whitespace-pre-wrap break-words"
                  style={{ background: mine ? 'var(--accent)' : 'var(--bg-hover)', color: mine ? '#fff' : 'var(--text-primary)' }}>{m.content}</div>
                {(mine || perms.can_moderate) && (
                  <button className="ml-2 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100" style={muted} onClick={() => remove(m)} aria-label={t('common.delete')}><Trash2 className="w-3 h-3 inline" /></button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="p-3 flex gap-2" style={{ borderTop: '1px solid var(--border)' }}>
        <input className="input-field" value={text} maxLength={4000} onChange={e => setText(e.target.value)} placeholder={t('communities.writeMessagePlaceholder')} />
        <button type="submit" disabled={sending || !text.trim()} className="btn-primary px-4" aria-label={t('communities.sendMessage')}><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}

/* ═══════════════════════ Convites ═══════════════════════ */

function InvitesTab({ id, run }) {
  const { t } = useTranslation();
  const { data, refetch } = useApi(() => api.communities.listInvites(id), [id]);
  const [form, setForm] = useState({ label: '', expires_in_hours: '', max_uses: '' });
  const [creating, setCreating] = useState(false);
  const link = (code) => `${window.location.origin}/join/${code}`;
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success(t('communities.copied')); }
    catch { toast.error(t('communities.copyFailed')); }
  };
  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const body = { label: form.label.trim() || undefined };
      if (form.expires_in_hours !== '') body.expires_in_hours = Number(form.expires_in_hours);
      if (form.max_uses !== '') body.max_uses = Number(form.max_uses);
      await api.communities.createInvite(id, body);
      toast.success(t('communities.inviteCreated')); setForm({ label: '', expires_in_hours: '', max_uses: '' }); await refetch();
    } catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setCreating(false); }
  };
  const fmt = (d) => new Date(d).toLocaleString(currentLocale(), { dateStyle: 'short', timeStyle: 'short' });
  const statusCls = { active: 'badge-green', expired: 'badge-amber', exhausted: 'badge-amber', revoked: 'badge-red' };

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card p-5 space-y-4">
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('communities.newInvite')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={lbl}>{t('communities.inviteLabel')}</label>
            <input className="input-field" value={form.label} maxLength={120} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder={t('communities.inviteLabelPlaceholder')} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={lbl}>{t('communities.expiresInHours')}</label>
            <input className="input-field" type="number" min="1" max="8760" value={form.expires_in_hours} onChange={e => setForm(f => ({ ...f, expires_in_hours: e.target.value }))} placeholder={t('communities.noLimit')} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={lbl}>{t('communities.maxUses')}</label>
            <input className="input-field" type="number" min="1" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))} placeholder={t('communities.noLimit')} />
          </div>
        </div>
        <button className="btn-primary" disabled={creating}>{creating ? t('communities.creating') : t('communities.generateInvite')}</button>
      </form>

      {arr(data).length === 0 ? (
        <EmptyState icon={KeyRound} title={t('communities.noInvitesTitle')} description={t('communities.noInvitesDesc')} />
      ) : (
        <div className="space-y-3">
          {arr(data).map(i => (
            <div key={i.uuid} className="card p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="font-mono text-sm tracking-wider" style={{ color: 'var(--text-primary)' }}>{i.code}</code>
                  <span className={`badge ${statusCls[i.status] || 'badge-blue'}`}>{t(`communities.inviteStatus.${i.status}`)}</span>
                  {i.label && <span className="text-xs" style={muted}>{i.label}</span>}
                </div>
                <div className="text-xs mt-1" style={muted}>
                  {t('communities.usesOf', { uses: i.uses, max: i.max_uses ?? '∞' })}
                  {' · '}{i.expires_at ? t('communities.expiresAt', { date: fmt(i.expires_at) }) : t('communities.neverExpires')}
                  {' · '}{t('communities.createdBy', { name: i.created_by_name })}
                </div>
              </div>
              <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => copy(link(i.code))}><Copy className="w-3.5 h-3.5" /> {t('communities.copyLink')}</button>
              <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => copy(i.code)}><Copy className="w-3.5 h-3.5" /> {t('communities.copyCode')}</button>
              {i.status === 'active' && (
                <button className="btn-ghost p-1.5" aria-label={t('communities.revoke')} title={t('communities.revoke')}
                  onClick={() => run(() => api.communities.revokeInvite(id, i.uuid), t('communities.inviteRevoked'), refetch)}><X className="w-4 h-4" /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ Configurações ═══════════════════════ */

function SettingsTab({ community: c, id, run, reload, isOwner, members, me, onDeleted, onTransferred }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: c.name, description: c.description || '', visibility: c.visibility, cover_color: c.cover_color || COVER_KEYS[0] });
  const [saving, setSaving] = useState(false);
  const [newOwner, setNewOwner] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.communities.update(id, form); toast.success(t('communities.saved')); await reload(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); } finally { setSaving(false); }
  };
  const candidates = members.filter(m => m.uuid !== me?.uuid);
  return (
    <div className="space-y-6 max-w-2xl">
      <form onSubmit={save} className="card p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.nameLabel')}</label>
          <input className="input-field" value={form.name} maxLength={255} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('common.description')}</label>
          <textarea className="input-field resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div>
          <span className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.cover')}</span>
          <div className="flex flex-wrap gap-2">
            {COVER_KEYS.map(k => (
              <button key={k} type="button" aria-label={k} aria-pressed={form.cover_color === k} onClick={() => setForm(f => ({ ...f, cover_color: k }))}
                style={{ width: 36, height: 36, borderRadius: 10, background: coverBackground(k), outline: form.cover_color === k ? '2px solid var(--accent)' : 'none', outlineOffset: 2 }} />
            ))}
          </div>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1 h-4 w-4" style={{ accentColor: 'var(--accent)' }} checked={form.visibility === 'public'}
            onChange={e => setForm(f => ({ ...f, visibility: e.target.checked ? 'public' : 'private' }))} />
          <span>
            <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('communities.publicToggleLabel')}</span>
            <span className="block text-xs" style={muted}>{form.visibility === 'public' ? t('communities.publicHint') : t('communities.privateHint')}</span>
          </span>
        </label>
        <button className="btn-primary" disabled={saving || !form.name.trim()}>{saving ? t('common.saving') : t('common.save')}</button>
      </form>

      {isOwner && (
        <div className="card p-5 space-y-5" style={{ borderColor: 'rgba(239,68,68,0.35)' }}>
          <h3 className="font-semibold text-red-400">{t('communities.dangerZone')}</h3>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={lbl}>{t('communities.transferOwnership')}</label>
            <div className="flex gap-2">
              <select className="input-field" value={newOwner} onChange={e => setNewOwner(e.target.value)}>
                <option value="">{t('communities.chooseOption')}</option>
                {candidates.map(m => <option key={m.uuid} value={m.uuid}>{m.name}</option>)}
              </select>
              <button className="btn-danger" disabled={!newOwner}
                onClick={() => { if (window.confirm(t('communities.transferConfirm'))) run(() => api.communities.transfer(id, newOwner), t('communities.transferred'), onTransferred); }}>
                {t('communities.transfer')}
              </button>
            </div>
          </div>
          <div>
            <button className="btn-danger flex items-center gap-2" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" /> {t('communities.deleteCommunity')}</button>
          </div>
        </div>
      )}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('communities.deleteCommunity')} size="sm">
        <p className="mb-5" style={lbl}>{t('communities.deleteConfirm', { name: c.name })}</p>
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
          <button className="btn-danger flex-1" onClick={() => run(() => api.communities.delete(id), t('communities.deleted'), onDeleted)}>{t('common.delete')}</button>
        </div>
      </Modal>
    </div>
  );
}
