import React, { useState } from 'react';
import { User, Mail, Lock, Zap, Save, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { useMutation } from '../hooks/useApi';
import { api } from '../api';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, isPlus, isAdmin } = useAuthStore();
  const [nameForm, setNameForm] = useState({ name: user?.name || '' });
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [showPass, setShowPass] = useState(false);
  const { mutate: updateUser, loading: saving } = useMutation((d) => api.user.update(d));
  const { mutate: changePassword, loading: changingPass } = useMutation(api.user.changePassword);

  const hue = user?.name?.charCodeAt(0) * 7 % 360 || 200;

  const handleNameSave = async (e) => {
    e.preventDefault();
    if (!nameForm.name.trim()) { toast.error(t('datasets.importModal.nameRequired')); return; }
    const ok = await updateUser({ name: nameForm.name });
    if (ok !== null) toast.success(t('profile.profileUpdated'));
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!passForm.current_password || !passForm.new_password) { toast.error(t('profile.fillAllFields')); return; }
    if (passForm.new_password !== passForm.confirm) { toast.error(t('profile.passwordMismatch')); return; }
    if (passForm.new_password.length < 8) { toast.error(t('profile.passwordMinLength')); return; }
    const ok = await changePassword({ current_password: passForm.current_password, new_password: passForm.new_password });
    if (ok !== null) { toast.success(t('profile.passwordChanged')); setPassForm({ current_password: '', new_password: '', confirm: '' }); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('profile.title')}</h1>
        <p className="text-slate-400 text-sm mt-0.5">{t('profile.subtitle')}</p>
      </div>

      {/* Avatar section */}
      <div className="card p-6 flex items-center gap-6">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold flex-shrink-0"
          style={{ background: `linear-gradient(135deg, hsl(${hue},60%,40%), hsl(${hue + 40},60%,50%))` }}>
          {user?.name?.[0]?.toUpperCase() || 'U'}
        </div>
        <div>
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold text-white">{user?.name}</div>
            {isPlus() && <span className="badge badge-plus"><Zap className="w-3 h-3 inline mr-1" />PLUS</span>}
            {isAdmin() && <span className="badge badge-purple">{t('nav.admin')}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-400 mt-1">
            <Mail className="w-3.5 h-3.5" /> {user?.email}
          </div>
          <div className="text-xs text-slate-500 mt-1">{t('profile.plan')} <span className="text-blue-400 font-medium capitalize">{user?.plan ?? 'free'}</span></div>
        </div>
      </div>

      {/* Edit name */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2"><User className="w-4 h-4 text-blue-400" /> {t('profile.personalInfo')}</h2>
        <form onSubmit={handleNameSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('common.name')}</label>
            <input className="input-field" value={nameForm.name} onChange={e => setNameForm({ name: e.target.value })} placeholder={t('profile.namePlaceholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('auth.email')}</label>
            <input className="input-field opacity-60 cursor-not-allowed" value={user?.email || ''} disabled />
            <p className="text-xs text-slate-500 mt-1">{t('profile.emailNote')}</p>
          </div>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> {saving ? t('profile.saving') : t('profile.saveChanges')}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-blue-400" /> {t('profile.changePassword')}</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('profile.currentPassword')}</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} className="input-field pr-10" value={passForm.current_password} onChange={e => setPassForm(f => ({ ...f, current_password: e.target.value }))} placeholder={t('auth.passwordPlaceholder')} />
              <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-300">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('profile.newPassword')}</label>
            <input type={showPass ? 'text' : 'password'} className="input-field" value={passForm.new_password} onChange={e => setPassForm(f => ({ ...f, new_password: e.target.value }))} placeholder={t('auth.minPasswordPlaceholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1.5">{t('profile.confirmNewPassword')}</label>
            <input type="password" className="input-field" value={passForm.confirm} onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))} placeholder={t('profile.repeatNewPasswordPlaceholder')} />
          </div>
          <button type="submit" disabled={changingPass} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> {changingPass ? t('profile.changingPassword') : t('profile.changePassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
