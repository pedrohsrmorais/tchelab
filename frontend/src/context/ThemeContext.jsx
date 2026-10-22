import React, { createContext, useContext, useEffect, useState } from 'react';

import { useAuthStore } from '../store/auth';

export const THEMES = ['dark', 'light', 'classic'];

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {}, applyTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem('tchelab_theme');
      return THEMES.includes(saved) ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('tchelab_theme', theme); } catch {}
  }, [theme]);

  /** Aplica o tema na interface (sem gravar na conta). */
  const applyTheme = (next) => {
    if (THEMES.includes(next)) {
      // Aplica o atributo já, antes do re-render: componentes que calculam cor
      // em JS lendo data-theme (ver techniqueRegistry.matlabize) precisam dele
      // atualizado durante o render que a troca dispara.
      try { document.documentElement.setAttribute('data-theme', next); } catch {}
      setThemeState(next);
    }
  };

  /** Troca o tema e, se logado, grava na conta para valer em qualquer dispositivo. */
  const setTheme = (next) => {
    if (!THEMES.includes(next)) return;
    applyTheme(next);
    const { token, savePreferences } = useAuthStore.getState();
    if (token) savePreferences({ theme: next });
  };

  // Mantido por compatibilidade com código antigo que só conhecia dark/light.
  const toggle = () => setThemeState(t => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, applyTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
