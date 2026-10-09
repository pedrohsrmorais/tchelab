import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Users, MessageSquare, FolderOpen, Plus, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi, useMutation } from '../hooks/useApi';
import { api } from '../api';
import { useAuthStore } from '../store/auth';
import SkeletonCard from '../components/ui/SkeletonCard';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';

function Tab({ active, onClick, children }) {
  return <button onClick={onClick} className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>{children}</button>;
}

function Avatar({ name, size = 8 }) {
  const hue = name?.charCodeAt(0) * 7 % 360 || 200;
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}
      style={{ background: `hsl(${hue}, 60%, 40%)` }}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

export default function CommunityDetailPage() {
  const { id } = useParams();
  const [tab, setTab] = useState('chat');
  const [message, setMessage] = useState('');
  const [linkProjectOpen, setLinkProjectOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const messagesEndRef = useRef(null);
  const { user } = useAuthStore();

  const { data: raw, loading } = useApi(() => api.communities.get(id), [id]);
  const { data: msgs, refetch: refetchMsgs } = useApi(() => api.communities.listMessages(id), [id]);
  const { data: members, refetch: refetchMembers } = useApi(() => api.communities.listMembers(id), [id]);
  const { data: allProjects } = useApi(api.projects.list, []);
  const { mutate: sendMsg, loading: sending } = useMutation((text) => api.communities.sendMessage(id, { content: text }));
  const { mutate: linkProject, loading: linking } = useMutation((pUuid) => api.communities.linkProject(id, pUuid));

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  if (loading) return <div className="space-y-4"><SkeletonCard className="h-32" /><SkeletonCard className="h-96" /></div>;

  const community = raw?.data ?? raw;
  if (!community) return <EmptyState icon={Users} title="Comunidade não encontrada" description="Esta comunidade não existe ou foi removida." />;

  const messagesList = msgs?.data ?? msgs ?? [];
  const membersList = members?.data ?? members ?? [];
  const projectsList = allProjects?.data ?? allProjects ?? [];

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    const ok = await sendMsg(message.trim());
    if (ok !== null) { setMessage(''); refetchMsgs(); }
  };

  const handleLinkProject = async () => {
    if (!selectedProject) { toast.error('Selecione um projeto'); return; }
    const ok = await linkProject(selectedProject);
    if (ok !== null) { toast.success('Projeto vinculado!'); setLinkProjectOpen(false); setSelectedProject(''); }
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div>
        <Link to="/communities" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4">
          <ArrowLeft className="w-4 h-4" /> Voltar às Comunidades
        </Link>
        <div className="card p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{community.name}</h1>
              <p className="text-slate-400 mt-1">{community.description || 'Sem descrição'}</p>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
                <span><Users className="w-3 h-3 inline mr-1" />{membersList.length} membros</span>
              </div>
            </div>
            <button onClick={() => setLinkProjectOpen(true)} className="btn-primary text-sm flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Vincular Projeto
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tab active={tab === 'chat'} onClick={() => setTab('chat')}><MessageSquare className="w-4 h-4 inline mr-1.5" />Chat</Tab>
        <Tab active={tab === 'projects'} onClick={() => setTab('projects')}><FolderOpen className="w-4 h-4 inline mr-1.5" />Projetos</Tab>
        <Tab active={tab === 'members'} onClick={() => setTab('members')}><Users className="w-4 h-4 inline mr-1.5" />Membros</Tab>
      </div>

      {tab === 'chat' && (
        <div className="card flex flex-col" style={{ height: '500px' }}>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messagesList.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <EmptyState icon={MessageSquare} title="Sem mensagens" description="Seja o primeiro a enviar uma mensagem!" />
              </div>
            ) : messagesList.map((msg, i) => {
              const isMe = msg.user_uuid === user?.uuid;
              return (
                <div key={msg.id}
                  className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <Avatar name={msg.user_name || msg.user_email} />
                  <div className={`max-w-xs lg:max-w-md ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    <span className="text-xs text-slate-500">{msg.user_name || msg.user_email?.split('@')[0]}</span>
                    <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm'}`}>
                      {msg.content}
                    </div>
                    <span className="text-xs text-slate-600">{new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-white/10 p-3">
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <input className="input-field flex-1" placeholder="Escreva uma mensagem..." value={message} onChange={e => setMessage(e.target.value)} />
              <button type="submit" disabled={sending || !message.trim()}
                className="btn-primary p-2.5 flex-shrink-0">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {tab === 'projects' && (
        <div>
          {community.projects?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {community.projects.map(p => (
                <Link key={p.uuid} to={`/projects/${p.uuid}`}>
                  <div className="card card-hover p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center"><FolderOpen className="w-5 h-5 text-blue-400" /></div>
                    <div><div className="font-medium text-white">{p.name}</div><div className="text-xs text-slate-400">{p.description}</div></div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={FolderOpen} title="Nenhum projeto vinculado" description="Vincule um projeto para compartilhar com a comunidade."
              action={<button onClick={() => setLinkProjectOpen(true)} className="btn-primary">Vincular Projeto</button>} />
          )}
        </div>
      )}

      {tab === 'members' && (
        <div className="card p-4 space-y-3">
          {membersList.map(m => (
            <div key={m.uuid} className="flex items-center gap-3">
              <Avatar name={m.name || m.email} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{m.name || m.email?.split('@')[0]}</div>
                <div className="text-xs text-slate-400">{m.email}</div>
              </div>
              <span className={`badge ${m.role === 'admin' ? 'badge-purple' : 'badge-blue'}`}>{m.role}</span>
            </div>
          ))}
        </div>
      )}

      <Modal open={linkProjectOpen} onClose={() => setLinkProjectOpen(false)} title="Vincular Projeto" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">Selecione um Projeto</label>
            <select className="input-field" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
              <option value="">-- Escolha --</option>
              {projectsList.map(p => <option key={p.uuid} value={p.uuid}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setLinkProjectOpen(false)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={handleLinkProject} disabled={linking || !selectedProject} className="btn-primary flex-1">
              {linking ? 'Vinculando...' : 'Vincular'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
