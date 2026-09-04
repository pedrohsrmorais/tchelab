import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import pt from "./locales/pt.json";
import en from "./locales/en.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
    },
    fallbackLng: "pt",
    supportedLngs: ["pt", "en"],
    // Normaliza "pt-BR"/"en-US" detectados pelo navegador para "pt"/"en"
    load: "languageOnly",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "tchelab:lang",
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;