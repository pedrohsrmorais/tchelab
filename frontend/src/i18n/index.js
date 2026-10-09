import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import pt from './locales/pt';
import en from './locales/en';

const saved = (() => {
  try { return localStorage.getItem('tchelab_lang') || 'pt'; } catch { return 'pt'; }
})();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
    },
    lng: saved,
    fallbackLng: 'pt',
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

export default i18n;
