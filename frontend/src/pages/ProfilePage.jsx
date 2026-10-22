import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User, Lock, Save, Eye, EyeOff, Camera, Trash2, Globe, Palette, ShieldCheck, ExternalLink,
  GraduationCap, Building2, Mail, Cake, Check, Link2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { useTheme, THEMES } from '../context/ThemeContext';
import { LANGUAGES } from '../i18n';
import { setLanguage } from '../i18n/preferences';
import { api } from '../api';
import Avatar from '../components/ui/Avatar';
import { COVERS, COVER_KEYS, coverBackground } from '../config/profileCovers';
import { parseApiError } from '../utils/errors';

const TABS = ['profile', 'preferences', 'security'];

function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      {children}
      {error
        ? <p role="alert" className="text-xs mt-1" style={{ color: '#f87171' }}>{error}</p>
        : hint && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, label, description, id }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer py-2">
      <input
        id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer" style={{ accentColor: 'var(--accent)' }}
      />
      <span>
        <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {description && <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</span>}
      </span>
    </label>
  );
}

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, setUser, savePreferences, isPlus, isAdmin } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState('profile');
  const fileRef = useRef(null);

  const fromUser = (u) => ({
    name: u?.name || '',
    initials: u?.initials || '',
    bio: u?.bio || '',
    research_area: u?.research_area || '',
    institution: u?.institution || '',
    birth_date: (u?.birth_date || '').slice(0, 10),
    lattes_url: u?.lattes_url || '',
    linkedin_url: u?.linkedin_url || '',
    github_url: u?.github_url || '',
    cover_color: u?.cover_color || 'gradient-primary',
  });
  const saved = fromUser(user);

  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  // Dados da conta mudaram (outro dispositivo/recarga) e não há edição em andamento → recarrega o formulário.
  const savedKey = JSON.stringify(saved);
  const lastSaved = useRef(savedKey);
  useEffect(() => {
    if (lastSaved.current !== savedKey && JSON.stringify(form) === lastSaved.current) setForm(saved);
    lastSaved.current = savedKey;
  }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: t('common.required') }); return; }
    setSaving(true); setErrors({});
    try {
      const payload = { ...form, birth_date: form.birth_date || null };
      const { data } = await api.user.update(user.uuid, payload);
      setUser(data?.data ?? data);
      toast.success(t('profile.profileUpdated'));
    } catch (err) {
      const { fields, message } = parseApiError(err, t('common.error'));
      setErrors(fields);
      if (!Object.keys(fields).length) toast.error(message);
    } finally { setSaving(false); }
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { toast.error(t('account.photoInvalid')); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t('account.photoTooBig')); return; }
    setPhotoBusy(true);
    try {
      const fd = new FormData(); fd.append('avatar', file);
      const { data } = await api.user.uploadAvatar(user.uuid, fd);
      setUser({ ...useAuthStore.getState().user, avatar_url: (data?.data ?? data).avatar_url });
      toast.success(t('account.photoUpdated'));
    } catch (err) {
      toast.error(parseApiError(err, t('common.error')).message);
    } finally { setPhotoBusy(false); }
  };

  const handleRemovePhoto = async () => {
    setPhotoBusy(true);
    try {
      await api.user.deleteAvatar(user.uuid);
      setUser({ ...useAuthStore.getState().user, avatar_url: null });
      toast.success(t('account.photoRemoved'));
    } catch (err) {
      toast.error(parseApiError(err, t('common.error')).message);
    } finally { setPhotoBusy(false); }
  };

  // ── Segurança ──────────────────────────────────────────────────────────────
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [passErrors, setPassErrors] = useState({});
  const [showPass, setShowPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!passForm.current_password) errs.current_password = t('common.required');
    if (!passForm.new_password) errs.new_password = t('common.required');
    else if (passForm.new_password.length < 8) errs.new_password = t('profile.passwordMinLength');
    if (passForm.new_password && passForm.new_password !== passForm.confirm) errs.confirm = t('profile.passwordMismatch');
    setPassErrors(errs);
    if (Object.keys(errs).length) return;
    setChangingPass(true);
    try {
      await api.auth.changePassword({ current_password: passForm.current_password, new_password: passForm.new_password });
      toast.success(t('profile.passwordChanged'));
      setPassForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      const { fields, code, message } = parseApiError(err, t('common.error'));
      if (code === 'INVALID_PASSWORD') setPassErrors({ current_password: t('account.passwordWrong') });
      else if (Object.keys(fields).length) setPassErrors(fields);
      else toast.error(message);
    } finally { setChangingPass(false); }
  };

  const privacy = user?.preferences?.privacy || { show_email: false, show_birth_date: false, show_stats: true };
  const setPrivacy = (key) => (value) => {
    savePreferences({ privacy: { ...privacy, [key]: value } });
    toast.success(t('account.privacySaved'));
  };
  const lang = String(i18n.language).slice(0, 2);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Cabeçalho com capa */}
      <div className="card overflow-hidden">
        <div style={{ height: 96, background: coverBackground(form.cover_color) }} aria-hidden="true" />
        <div className="px-6 pb-5 flex flex-wrap items-end gap-4" style={{ marginTop: -40 }}>
          <div className="relative">
            <Avatar user={{ ...user, name: form.name || user?.name, initials: form.initials }} size={88}
              style={{ border: '4px solid var(--bg-card, var(--bg-elevated))', fontSize: 30 }} />
            {photoBusy && <span className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 text-white text-xs">…</span>}
          </div>
          <div className="flex-1 min-w-0 pt-10">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>{user?.name}</h1>
              {isPlus() && <span className="badge badge-plus">PLUS</span>}
              {isAdmin() && <span className="badge badge-purple">{t('nav.admin')}</span>}
            </div>
            <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>
              {[user?.institution, user?.research_area].filter(Boolean).join(' · ') || user?.email}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-10">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handlePhoto} aria-label={t('account.changePhoto')} />
            <button type="button" className="btn-ghost flex items-center gap-1.5" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              <Camera className="w-4 h-4" /> {t('account.changePhoto')}
            </button>
            {user?.avatar_url && (
              <button type="button" className="btn-ghost flex items-center gap-1.5" disabled={photoBusy} onClick={handleRemovePhoto}>
                <Trash2 className="w-4 h-4" /> {t('account.removePhoto')}
              </button>
            )}
            <Link to={`/users/${user?.uuid}`} className="btn-ghost flex items-center gap-1.5">
              <ExternalLink className="w-4 h-4" /> {t('account.viewPublic')}
            </Link>
          </div>
        </div>
        <p className="px-6 pb-4 text-xs" style={{ color: 'var(--text-muted)' }}>{t('account.photoHint')}</p>
      </div>

      {/* Abas */}
      <div role="tablist" className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
        {TABS.map(key => (
          <button
            key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: tab === key ? 'var(--accent)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {t(`account.tab_${key}`)}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <form onSubmit={handleSave} className="space-y-6" noValidate>
          <div className="card p-6 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <User className="w-4 h-4" style={{ color: 'var(--text-accent)' }} /> {t('profile.personalInfo')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('account.fullName')} error={errors.name} htmlFor="pf-name">
                <input id="pf-name" className="input-field" value={form.name} onChange={set('name')} placeholder={t('profile.namePlaceholder')} maxLength={255} />
              </Field>
              <Field label={t('account.initials')} hint={t('account.initialsHint')} error={errors.initials} htmlFor="pf-initials">
                <input id="pf-initials" className="input-field" value={form.initials} onChange={set('initials')} maxLength={20} />
              </Field>
              <Field label={t('auth.email')} hint={t('profile.emailNote')} htmlFor="pf-email">
                <input id="pf-email" className="input-field opacity-60 cursor-not-allowed" value={user?.email || ''} disabled />
              </Field>
              <Field label={t('account.birthDate')} hint={t('account.birthDateHint')} error={errors.birth_date} htmlFor="pf-birth">
                <input id="pf-birth" type="date" className="input-field" value={form.birth_date} onChange={set('birth_date')}
                  max={new Date().toISOString().slice(0, 10)} />
              </Field>
              <Field label={t('account.institution')} error={errors.institution} htmlFor="pf-inst">
                <input id="pf-inst" className="input-field" value={form.institution} onChange={set('institution')} placeholder={t('account.institutionPlaceholder')} maxLength={255} />
              </Field>
              <Field label={t('account.researchArea')} error={errors.research_area} htmlFor="pf-area">
                <input id="pf-area" className="input-field" value={form.research_area} onChange={set('research_area')} placeholder={t('account.researchAreaPlaceholder')} maxLength={255} />
              </Field>
            </div>
            <Field label={t('account.bio')} error={errors.bio} htmlFor="pf-bio" hint={`${form.bio.length}/2000`}>
              <textarea id="pf-bio" className="input-field" rows={4} value={form.bio} onChange={set('bio')} placeholder={t('account.bioPlaceholder')} maxLength={2000} />
            </Field>
          </div>

          <div className="card p-6 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Link2 className="w-4 h-4" style={{ color: 'var(--text-accent)' }} /> {t('account.links')}
            </h2>
            <Field label={t('account.lattes')} error={errors.lattes_url} htmlFor="pf-lattes">
              <input id="pf-lattes" className="input-field" value={form.lattes_url} onChange={set('lattes_url')} placeholder="https://lattes.cnpq.br/0000000000000000" inputMode="url" />
            </Field>
            <Field label="LinkedIn" error={errors.linkedin_url} htmlFor="pf-linkedin">
              <input id="pf-linkedin" className="input-field" value={form.linkedin_url} onChange={set('linkedin_url')} placeholder="https://www.linkedin.com/in/..." inputMode="url" />
            </Field>
            <Field label="GitHub / GitLab" error={errors.github_url} htmlFor="pf-github">
              <input id="pf-github" className="input-field" value={form.github_url} onChange={set('github_url')} placeholder="https://github.com/..." inputMode="url" />
            </Field>
          </div>

          <div className="card p-6 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Palette className="w-4 h-4" style={{ color: 'var(--text-accent)' }} /> {t('account.coverColor')}
            </h2>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('account.coverColor')}>
              {COVER_KEYS.map(key => (
                <button
                  key={key} type="button" role="radio" aria-checked={form.cover_color === key}
                  title={key.replace('gradient-', '')}
                  onClick={() => setForm(f => ({ ...f, cover_color: key }))}
                  className="relative rounded-xl"
                  style={{
                    width: 56, height: 36, background: COVERS[key],
                    outline: form.cover_color === key ? '2px solid var(--accent)' : '1px solid var(--border)', outlineOffset: 2,
                  }}
                >
                  {form.cover_color === key && <Check className="w-4 h-4 text-white absolute inset-0 m-auto" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving || !dirty} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" /> {saving ? t('profile.saving') : t('profile.saveChanges')}
            </button>
          </div>
        </form>
      )}

      {tab === 'preferences' && (
        <div className="space-y-6">
          <div className="card p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <Globe className="w-4 h-4" style={{ color: 'var(--text-accent)' }} /> {t('account.appearance')}
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t('account.prefsHint')}</p>
            </div>
            <Field label={t('account.languageLabel')}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('account.languageLabel')}>
                {LANGUAGES.map(l => (
                  <button key={l.code} type="button" role="radio" aria-checked={lang === l.code}
                    onClick={() => setLanguage(l.code)}
                    className={lang === l.code ? 'btn-primary' : 'btn-ghost'} style={{ minWidth: 110 }}>
                    {l.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('account.themeLabel')}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('account.themeLabel')}>
                {THEMES.map(name => (
                  <button key={name} type="button" role="radio" aria-checked={theme === name}
                    onClick={() => setTheme(name)}
                    className={theme === name ? 'btn-primary' : 'btn-ghost'} style={{ minWidth: 110 }}>
                    {t(`themes.${name}`)}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="card p-6 space-y-1">
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--text-accent)' }} /> {t('account.privacy')}
            </h2>
            <p className="text-xs pb-2" style={{ color: 'var(--text-muted)' }}>{t('account.privacyDesc')}</p>
            <Toggle id="pv-email" checked={!!privacy.show_email} onChange={setPrivacy('show_email')}
              label={t('account.showEmail')} description={<><Mail className="inline w-3 h-3 mr-1" />{user?.email}</>} />
            <Toggle id="pv-birth" checked={!!privacy.show_birth_date} onChange={setPrivacy('show_birth_date')}
              label={t('account.showBirthDate')} description={<><Cake className="inline w-3 h-3 mr-1" />{form.birth_date || '—'}</>} />
            <Toggle id="pv-stats" checked={privacy.show_stats !== false} onChange={setPrivacy('show_stats')}
              label={t('account.showStats')} description={t('account.showStatsDesc')} />
            <p className="text-xs pt-2" style={{ color: 'var(--text-muted)' }}>
              <GraduationCap className="inline w-3 h-3 mr-1" /><Building2 className="inline w-3 h-3 mr-1" />{t('account.alwaysPublic')}
            </p>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="card p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Lock className="w-4 h-4" style={{ color: 'var(--text-accent)' }} /> {t('profile.changePassword')}
          </h2>
          <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md" noValidate>
            <Field label={t('profile.currentPassword')} error={passErrors.current_password} htmlFor="pw-cur">
              <div className="relative">
                <input id="pw-cur" type={showPass ? 'text' : 'password'} className="input-field pr-10" autoComplete="current-password"
                  value={passForm.current_password} onChange={e => setPassForm(f => ({ ...f, current_password: e.target.value }))} placeholder={t('auth.passwordPlaceholder')} />
                <button type="button" onClick={() => setShowPass(v => !v)} aria-label={showPass ? t('account.hidePassword') : t('account.showPassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <Field label={t('profile.newPassword')} error={passErrors.new_password} htmlFor="pw-new">
              <input id="pw-new" type={showPass ? 'text' : 'password'} className="input-field" autoComplete="new-password"
                value={passForm.new_password} onChange={e => setPassForm(f => ({ ...f, new_password: e.target.value }))} placeholder={t('auth.minPasswordPlaceholder')} />
            </Field>
            <Field label={t('profile.confirmNewPassword')} error={passErrors.confirm} htmlFor="pw-conf">
              <input id="pw-conf" type="password" className="input-field" autoComplete="new-password"
                value={passForm.confirm} onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))} placeholder={t('profile.repeatNewPasswordPlaceholder')} />
            </Field>
            <button type="submit" disabled={changingPass} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" /> {changingPass ? t('profile.changingPassword') : t('profile.changePassword')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
