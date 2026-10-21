import React, { createContext, useContext, useEffect, useState } from 'react';

export const THEMES = ['dark', 'light', 'classic'];

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {} });

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

  const setTheme = (next) => {
    if (THEMES.includes(next)) {
      // Aplica o atributo já, antes do re-render: componentes que calculam cor
      // em JS lendo data-theme (ver techniqueRegistry.matlabize) precisam dele
      // atualizado durante o render que a troca dispara.
      try { document.documentElement.setAttribute('data-theme', next); } catch {}
      setThemeState(next);
    }
  };

  // Mantido por compatibilidade com código antigo que só conhecia dark/light.
  const toggle = () => setThemeState(t => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
