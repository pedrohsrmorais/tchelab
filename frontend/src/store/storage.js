import { create } from 'zustand';
import { api } from '../api';

// Uso de armazenamento do usuário logado + estado do diálogo "liberar espaço".
// Atualiza: ao montar o layout, ao voltar o foco para a aba, a cada 2 min e após qualquer escrita (evento do axios).
export const useStorageStore = create((set, get) => ({
  usage: null,
  quotaError: null, // { code, message, details } enquanto o diálogo está aberto
  refresh: async () => {
    try {
      const { data } = await api.storage.usage(false);
      set({ usage: data?.data ?? data });
    } catch { /* medidor é informativo: silencioso */ }
  },
  openQuota: (e) => { set({ quotaError: e }); get().refresh(); },
  closeQuota: () => set({ quotaError: null }),
}));

let wired = false;
export function wireStorageEvents() {
  if (wired || typeof window === 'undefined') return () => {};
  wired = true;
  const { refresh, openQuota } = useStorageStore.getState();
  let t = null;
  const debounced = () => { clearTimeout(t); t = setTimeout(refresh, 400); };
  const onQuota = (e) => openQuota(e.detail);
  const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
  window.addEventListener('tchelab:storage-dirty', debounced);
  window.addEventListener('tchelab:quota', onQuota);
  document.addEventListener('visibilitychange', onFocus);
  const iv = setInterval(refresh, 120000);
  refresh();
  return () => {
    wired = false; clearTimeout(t); clearInterval(iv);
    window.removeEventListener('tchelab:storage-dirty', debounced);
    window.removeEventListener('tchelab:quota', onQuota);
    document.removeEventListener('visibilitychange', onFocus);
  };
}

export const LEVEL_COLOR = { ok: 'var(--accent)', warning: '#d97706', critical: '#ef4444', full: '#dc2626' };
