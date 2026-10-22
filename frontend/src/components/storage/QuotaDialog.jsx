import React from 'react';
import { HardDrive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { useStorageStore } from '../../store/storage';
import StorageBreakdown from './StorageBreakdown';
import { formatBytes, formatCpu } from '../../utils/bytes';
import ComputeUsage from './ComputeUsage';

/** Aberto globalmente quando a API recusa uma escrita por falta de espaço (ou arquivo grande demais). */
export default function QuotaDialog() {
  const { t, i18n } = useTranslation();
  const lang = String(i18n.language).slice(0, 2);
  const err = useStorageStore((s) => s.quotaError);
  const close = useStorageStore((s) => s.closeQuota);
  if (!err) return null;
  const d = err.details || {};
  // Mensagem montada aqui (no idioma da interface); a do servidor fica como reserva.
  let message = err.message;
  if (err.code === 'STORAGE_QUOTA_EXCEEDED' && d.quota != null) {
    message = t('storage.msgExceeded', { missing: formatBytes(Math.max(0, d.needed - d.remaining), lang), used: formatBytes(d.used, lang), quota: formatBytes(d.quota, lang) });
  } else if (err.code === 'FILE_TOO_LARGE' && d.max_file_bytes != null) {
    message = t('storage.msgTooLarge', { size: formatBytes(d.size, lang), max: formatBytes(d.max_file_bytes, lang) });
  } else if (err.code === 'CPU_BUDGET_EXCEEDED' && d.budget_seconds != null) {
    message = t('storage.cpuMsg', { used: formatCpu(d.used_seconds, lang), budget: formatCpu(d.budget_seconds, lang) });
  } else if (err.code === 'STORAGE_SERVER_FULL') {
    message = t('storage.serverFullTitle');
  }
  const cpu = err.code === 'CPU_BUDGET_EXCEEDED';
  const title = cpu ? t('storage.cpuTitle') : err.code === 'FILE_TOO_LARGE' ? t('storage.fileTooLargeTitle')
    : err.code === 'STORAGE_SERVER_FULL' ? t('storage.serverFullTitle') : t('storage.fullTitle');
  const hint = cpu ? t('storage.cpuHint') : err.code === 'FILE_TOO_LARGE' ? t('storage.fileTooLargeHint')
    : err.code === 'STORAGE_SERVER_FULL' ? t('storage.serverFullHint') : t('storage.fullHint');

  return (
    <Modal open onClose={close} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><HardDrive size={18} aria-hidden="true" />{title}</span>} size="md">
      <div role="alert" style={{ padding: '0.75rem', borderRadius: 'var(--radius)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', marginBottom: 16 }}>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{message}</p>
        <p style={{ fontSize: '0.8rem', marginTop: 4, color: 'var(--text-muted)' }}>{hint}</p>
      </div>
      {cpu && <ComputeUsage />}
      {!cpu && err.code !== 'STORAGE_SERVER_FULL' && err.code !== 'FILE_TOO_LARGE' && <StorageBreakdown onNavigate={close} maxItems={12} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn-primary" onClick={close}>{t('common.close')}</button>
      </div>
    </Modal>
  );
}
