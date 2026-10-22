import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import pt from './locales/pt';
import en from './locales/en';
import es from './locales/es';
import extra from './locales/extra';

/** Mescla profunda: as chaves de `extra` (novas telas) se somam às dos arquivos base. */
function merge(base, add) {
  const out = { ...base };
  for (const [k, v] of Object.entries(add || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base?.[k] && typeof base[k] === 'object' ? base[k] : {}, v) : v;
  }
  return out;
}

export const LANGUAGES = [
  { code: 'pt', label: 'Português', htmlLang: 'pt-BR', locale: 'pt-BR' },
  { code: 'en', label: 'English',   htmlLang: 'en',    locale: 'en-US' },
  { code: 'es', label: 'Español',   htmlLang: 'es',    locale: 'es-ES' },
];
export const LANG_CODES = LANGUAGES.map(l => l.code);

/** Idioma inicial: escolha salva neste navegador → idioma do navegador → pt. */
function detectInitial() {
  try {
    const saved = localStorage.getItem('tchelab_lang');
    if (LANG_CODES.includes(saved)) return saved;
  } catch { /* storage indisponível */ }
  try {
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'pt';
    const base = String(nav).toLowerCase().slice(0, 2);
    if (LANG_CODES.includes(base)) return base;
  } catch { /* sem navigator */ }
  return 'pt';
}

const initial = detectInitial();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: merge(pt, extra.pt) },
      en: { translation: merge(en, extra.en) },
      es: { translation: merge(es, extra.es) },
    },
    lng: initial,
    // Chave ausente em es cai para en e depois pt — nunca aparece a chave crua.
    fallbackLng: { es: ['en', 'pt'], en: ['pt'], default: ['pt'] },
    supportedLngs: LANG_CODES,
    interpolation: { escapeValue: false },
    // Desabilita envio de dados para o serviço Locize (i18next v25+ inclui
    // telemetria que usa PerformanceObserver — pode lançar TypeError: Cannot
    // read properties of undefined (reading 'startTime') em alguns browsers)
    saveMissing: false,
    updateMissing: false,
    // Não reportar chaves faltantes nem métricas para serviços externos
    missingKeyHandler: false,
    parseMissingKeyHandler: (key) => key,
  });

/** Mantém <html lang>, localStorage e Intl alinhados ao idioma ativo. */
function syncDocument(code) {
  const meta = LANGUAGES.find(l => l.code === code) || LANGUAGES[0];
  try { document.documentElement.setAttribute('lang', meta.htmlLang); } catch { /* ssr */ }
  try { localStorage.setItem('tchelab_lang', meta.code); } catch { /* storage indisponível */ }
}
syncDocument(initial);
i18n.on('languageChanged', (code) => syncDocument(String(code).slice(0, 2)));

/** Locale BCP-47 para toLocaleString/Intl (pt-BR, en-US, es-ES). */
export function currentLocale() {
  const code = String(i18n.language || 'pt').slice(0, 2);
  return (LANGUAGES.find(l => l.code === code) || LANGUAGES[0]).locale;
}

export default i18n;
