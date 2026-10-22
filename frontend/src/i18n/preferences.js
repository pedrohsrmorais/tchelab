import i18n, { LANG_CODES } from './index';
import { useAuthStore } from '../store/auth';

/** Aplica o idioma na interface (sem gravar na conta). */
export function applyLanguage(code) {
  if (LANG_CODES.includes(code) && i18n.language?.slice(0, 2) !== code) i18n.changeLanguage(code);
}

/**
 * Troca o idioma e, se houver usuário logado, grava na conta — assim ele
 * volta a ver a plataforma no mesmo idioma em qualquer navegador/dispositivo.
 */
export function setLanguage(code) {
  if (!LANG_CODES.includes(code)) return;
  applyLanguage(code);
  const { token, savePreferences } = useAuthStore.getState();
  if (token) savePreferences({ language: code });
}
