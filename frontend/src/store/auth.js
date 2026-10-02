import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api';
import toast from 'react-hot-toast';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refresh: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.auth.login({ email, password });
          const { access_token, refresh_token, user } = data.data ?? data;
          localStorage.setItem('tchelab_token', access_token);
          localStorage.setItem('tchelab_refresh', refresh_token);
          set({ user, token: access_token, refresh: refresh_token, isLoading: false });
          return user;
        } catch (err) {
          set({ isLoading: false });
          const msg = err?.response?.data?.error?.message || 'Credenciais inválidas.';
          toast.error(msg);
          return null;
        }
      },

      logout: async () => {
        try { await api.auth.logout(); } catch {}
        localStorage.removeItem('tchelab_token');
        localStorage.removeItem('tchelab_refresh');
        set({ user: null, token: null, refresh: null });
      },

      fetchMe: async () => {
        try {
          const { data } = await api.auth.me();
          const user = data?.data ?? data;
          set({ user });
          return user;
        } catch {
          return null;
        }
      },

      isPlus: () => {
        const u = get().user;
        return u?.role === 'admin' || u?.plan === 'plus' || u?.plan === 'enterprise';
      },

      isAdmin: () => get().user?.role === 'admin',

      setLoading: (v) => set({ isLoading: v }),
    }),
    {
      name: 'tchelab-auth',
      partialize: (s) => ({ user: s.user, token: s.token, refresh: s.refresh }),
    }
  )
);
