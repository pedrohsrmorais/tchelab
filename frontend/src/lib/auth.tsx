import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authApi, usersApi, tokenStorage } from "@/lib/api";
import type { User } from "@/lib/api";

// ─── Storage do perfil ────────────────────────────────────────────────────────

const KEY_USER = "tchelab:user";

function salvarPerfil(user: User) {
  localStorage.setItem(KEY_USER, JSON.stringify(user));
}

function limparPerfil() {
  localStorage.removeItem(KEY_USER);
}

function lerPerfilCache(): User | null {
  try {
    const raw = localStorage.getItem(KEY_USER);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:    User | null;
  loading: boolean;
  /** Atualiza o perfil em cache (útil após PATCH /users/me) */
  setUser: (user: User | null) => void;
  logout:  () => Promise<void>;
  hasRole: (...roles: User["role"][]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Restaura sessão na inicialização ──────────────────────────────────────
  useEffect(() => {
    async function restore() {
      const token = tokenStorage.getAccess();

      // Sem token: garante que cache e estado estão limpos
      if (!token) {
        limparPerfil();
        setLoading(false);
        return;
      }

      // Com token: usa o cache imediatamente para evitar flash de loading,
      // depois revalida em background silenciosamente.
      const cached = lerPerfilCache();
      if (cached) {
        setUserState(cached);
        setLoading(false);

        // Revalida em background — não bloqueia a UI
        usersApi.me()
          .then(({ data }) => {
            salvarPerfil(data);
            setUserState(data);
          })
          .catch(() => {
            // Token expirado e refresh falhou (interceptor já tentou)
            // Desloga silenciosamente
            tokenStorage.clear();
            limparPerfil();
            setUserState(null);
          });

        return;
      }

      // Token existe mas sem cache: busca o perfil antes de liberar a UI
      try {
        const { data } = await usersApi.me();
        salvarPerfil(data);
        setUserState(data);
      } catch {
        tokenStorage.clear();
        limparPerfil();
      } finally {
        setLoading(false);
      }
    }

    restore();
  }, []);

  // ── setUser — usado pelo login e PATCH /users/me ───────────────────────────
  const setUser = useCallback((u: User | null) => {
    if (u) salvarPerfil(u);
    else   limparPerfil();
    setUserState(u);
  }, []);

  // ── logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authApi.logout();   // POST /auth/logout + limpa tokenStorage
    } catch {
      // Falha de rede — limpa localmente de qualquer forma
      tokenStorage.clear();
    } finally {
      limparPerfil();
      setUserState(null);
    }
  }, []);

  // ── hasRole ───────────────────────────────────────────────────────────────
  const hasRole = useCallback(
    (...roles: User["role"][]) => !!user && roles.includes(user.role),
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, setUser, logout, hasRole }),
    [user, loading, setUser, logout, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}