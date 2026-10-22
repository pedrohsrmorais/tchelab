import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, ExternalLink, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import { useAuthStore } from '../../store/auth';
import { useStorageStore } from '../../store/storage';
import { formatBytes } from '../../utils/bytes';
import { parseApiError } from '../../utils/errors';
import { UsageBar } from './StorageMeter';

const unwrap = (r) => r?.data?.data ?? r?.data ?? r;

// Como excluir cada tipo (só o que tem endpoint próprio) e para onde "abrir" leva.
const remover = (it, user) => {
  if (it.ref_type === 'dataset') return () => api.datasets.delete(it.ref_id);
  if (it.ref_type === 'execution') return () => api.executions.delete(it.ref_id);
  if (it.ref_type === 'community_item') return () => api.communities.deleteItem(it.community_id, it.ref_id);
  if (it.ref_type === 'user_avatar') return () => api.user.deleteAvatar(user.uuid);
  return null;
};
const openLink = (it) => {
  if (it.ref_type === 'dataset' && it.ref_id) return `/datasets/${it.ref_id}`;
  if (it.ref_type === 'community_item' && it.community_id) return `/communities/${it.community_id}`;
  if (it.ref_type === 'article' && it.ref_id) return `/articles/${it.ref_id}`;
  if (it.ref_type === 'equipment_image' && it.community_id) return `/communities/${it.community_id}`;
  return null;
};

function Row({ it, onDeleted, onNavigate }) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const lang = String(i18n.language).slice(0, 2);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const del = remover(it, user);
  const link = openLink(it);
  const name = it.name || t(`storage.ref_${it.ref_type}`, { defaultValue: t(`storage.kind_${it.kind}`, { defaultValue: it.kind }) });

  const click = async () => {
    if (!armed) { setArmed(true); timer.current = setTimeout(() => setArmed(false), 4000); return; }
    setBusy(true);
    try { await del(); toast.success(t('storage.deleted')); onDeleted(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); setArmed(false); }
    finally { setBusy(false); }
  };

  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t(`storage.kind_${it.kind}`, { defaultValue: it.kind })}</p>
      </div>
      <span style={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatBytes(it.bytes, lang)}</span>
      {link && (
        <Link to={link} onClick={onNavigate} className="btn-ghost" title={t('storage.open')} aria-label={t('storage.open')} style={{ padding: '0.3rem' }}>
          <ExternalLink size={14} />
        </Link>
      )}
      {del && (
        <button type="button" onClick={click} disabled={busy} className="btn-ghost"
          aria-label={armed ? t('storage.confirmDelete') : t('common.delete')}
          style={{ padding: '0.3rem 0.5rem', color: armed ? '#fff' : '#ef4444', background: armed ? '#dc2626' : undefined, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {armed && <span>{t('storage.confirmDelete')}</span>}
        </button>
      )}
    </li>
  );
}

/** Uso + "o que mais ocupa espaço", com exclusão direta. Usado na aba do perfil e no diálogo de cota cheia. */
export default function StorageBreakdown({ onNavigate, maxItems = 30 }) {
  const { t, i18n } = useTranslation();
  const lang = String(i18n.language).slice(0, 2);
  const refreshStore = useStorageStore((s) => s.refresh);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try { setData(unwrap(await api.storage.usage(true))); setError(false); }
    catch { setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <p role="alert" style={{ color: '#ef4444', fontSize: '0.85rem' }}>{t('common.error')}</p>;
  if (!data) return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('common.loading')}</p>;

  const total = data.used + data.reserved;
  const items = (data.breakdown?.items || []).slice(0, maxItems);
  const kinds = data.breakdown?.by_kind || [];
  const onDeleted = () => { load(); refreshStore(); };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {formatBytes(total, lang)} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>{t('storage.ofQuota', { quota: formatBytes(data.quota, lang) })}</span>
        </p>
        <span className="badge badge-purple">{t('storage.plan', { name: data.plan?.name })}</span>
      </div>
      <UsageBar usage={data} height={10} />
      <p style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        {t('storage.remaining', { remaining: formatBytes(data.remaining, lang) })} · {t('storage.maxFile', { max: formatBytes(data.max_file_bytes, lang) })}
      </p>

      {kinds.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {kinds.map((k) => (
            <span key={k.kind} className="badge" style={{ fontSize: '0.72rem' }}>
              {t(`storage.kind_${k.kind}`, { defaultValue: k.kind })}: {formatBytes(k.bytes, lang)}
            </span>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 18, marginBottom: 4, fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{t('storage.biggest')}</h3>
      {items.length === 0
        ? <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('storage.empty')}</p>
        : <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{items.map((it) => <Row key={`${it.ref_type}:${it.ref_id}:${it.kind}:${it.bytes}`} it={it} onDeleted={onDeleted} onNavigate={onNavigate} />)}</ul>}
    </div>
  );
}
