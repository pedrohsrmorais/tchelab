import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, Zap, Save, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth';
import { useMutation } from '../hooks/useApi';
import { api } from '../api';

export default function ProfilePage() {
  const { user, isPlus, isAdmin } = useAuthStore();
  const [nameForm, setNameForm] = useState({ name: user?.name || '' });
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [showPass, setShowPass] = useState(false);
  const { mutate: updateUser, loading: saving } = useMutation((d) => api.user.update(d));
  const { mutate: changePassword, loading: changingPass } = useMutation(api.user.changePassword);

  const hue = user?.name?.charCodeAt(0) * 7 % 360 || 200;

  const handleNameSave = async (e) => {
    e.preventDefault();
    if (!nameForm.name.trim()) { toast.error('Nome obrigatório'); return; }
    const ok = await updateUser({ name: nameForm.name });
    if (ok !== null) toast.success('Perfil atualizado!');
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!passForm.current_password || !passForm.new_password) { toast.error('Preencha todos os campos'); return; }
    if (passForm.new_password !== passForm.confirm) { toast.error('Senhas não coincidem'); return; }
    if (passForm.new_password.length < 8) { toast.error('Senha deve ter ao menos 8 caracteres'); return; }
    const ok = await changePassword({ current_password: passForm.current_password, new_password: passForm.new_password });
    if (ok !== null) { toast.success('Senha alterada!'); setPassForm({ current_password: '', new_password: '', confirm: '' }); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Meu Perfil</h1>
        <p className="text-slate-400 text-sm mt-0.5">Gerencie suas informações pessoais</p>
      </div>

      {/* Avatar section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-6 flex items-center gap-6">
        <motion.div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold flex-shrink-0"
          style={{ background: `linear-gradient(135deg, hsl(${hue},60%,40%), hsl(${hue + 40},60%,50%))` }}
          animate={{ boxShadow: [`0 0 20px hsla(${hue},60%,50%,0.3)`, `0 0 40px hsla(${hue},60%,50%,0.5)`, `0 0 20px hsla(${hue},60%,50%,0.3)`] }}
          transition={{ duration: 3, repeat: Infinity }}>
          {user?.name?.[0]?.toUpperCase() || 'U'}
        </motion.div>
        <div>
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold text-white">{user?.name}</div>
            {isPlus() && <span className="badge badge-plus"><Zap className="w-3 h-3 inline mr-1" />PLUS</span>}
            {isAdmin() && <span className="badge badge-purple">Admin</span>}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-400 mt-1">
            <Mail className="w-3.5 h-3.5" /> {user?.email}
          </div>
          <div className="text-xs text-slate-500 mt-1">Plano: <span className="text-blue-400 font-medium capitalize">{user?.plan ?? 'free'}</span></div>
        </div>
      </motion.div>

      {/* Edit name */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2"><User className="w-4 h-4 text-blue-400" /> Informações Pessoais</h2>
        <form onSubmit={handleNameSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">Nome</label>
            <input className="input-field" value={nameForm.name} onChange={e => setNameForm({ name: e.target.value })} placeholder="Seu nome" />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">E-mail</label>
            <input className="input-field opacity-60 cursor-not-allowed" value={user?.email || ''} disabled />
            <p className="text-xs text-slate-500 mt-1">O e-mail não pode ser alterado.</p>
          </div>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </form>
      </motion.div>

      {/* Change password */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card p-6">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-blue-400" /> Alterar Senha</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">Senha Atual</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} className="input-field pr-10" value={passForm.current_password} onChange={e => setPassForm(f => ({ ...f, current_password: e.target.value }))} placeholder="••••••••" />
              <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-300">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">Nova Senha</label>
            <input type={showPass ? 'text' : 'password'} className="input-field" value={passForm.new_password} onChange={e => setPassForm(f => ({ ...f, new_password: e.target.value }))} placeholder="Mín. 8 caracteres" />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">Confirmar Nova Senha</label>
            <input type="password" className="input-field" value={passForm.confirm} onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Repita a nova senha" />
          </div>
          <button type="submit" disabled={changingPass} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> {changingPass ? 'Alterando...' : 'Alterar Senha'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
