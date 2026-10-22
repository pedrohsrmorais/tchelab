import { useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuthStore } from '../../store/auth';
import i18n from '../../i18n';
import { applyLanguage } from '../../i18n/preferences';

/**
 * Sincroniza tema e idioma guardados na conta com a interface:
 *  - a preferência da conta vence (login em outro navegador mantém o gosto do usuário);
 *  - contas novas/antigas sem preferência herdam o que já está escolhido neste navegador.
 * Não renderiza nada.
 */
export default function PreferencesSync() {
  const { theme, applyTheme } = useTheme();
  const uuid = useAuthStore(s => s.user?.uuid);
  const prefTheme = useAuthStore(s => s.user?.preferences?.theme);
  const prefLang = useAuthStore(s => s.user?.preferences?.language);
  const savePreferences = useAuthStore(s => s.savePreferences);

  useEffect(() => {
    if (!uuid) return;
    if (prefTheme && prefTheme !== theme) applyTheme(prefTheme);
    if (prefLang && prefLang !== String(i18n.language).slice(0, 2)) applyLanguage(prefLang);

    const seed = {};
    if (!prefTheme) seed.theme = theme;
    if (!prefLang) seed.language = String(i18n.language).slice(0, 2);
    if (Object.keys(seed).length) savePreferences(seed);
    // theme/applyTheme ficam de fora de propósito: só reage a mudanças vindas da conta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, prefTheme, prefLang]);

  return null;
}
