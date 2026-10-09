import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, FlaskConical, Mail, Lock, User, ArrowRight, Sparkles, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/auth';

// Utility style for inputs with left icon — ensures text never overlaps the icon
const iconInput = { paddingLeft: '2.5rem' };
const iconInputRight = { paddingLeft: '2.5rem', paddingRight: '2.75rem' };

const INVITE_CODE = 'intellsn';

// Floating particle
function Particle({ x, y, size, delay, duration }) {
  return (
    <div
      className="absolute rounded-full bg-blue-400 opacity-20"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
    />
  );
}

// Orbit ring
function OrbitRing({ radius, duration, delay, dotCount = 3, color = 'blue' }) {
  return (
    <div
      className="absolute rounded-full border border-blue-500/20"
      style={{
        width: radius * 2,
        height: radius * 2,
        left: '50%',
        top: '50%',
        marginLeft: -radius,
        marginTop: -radius,
      }}
    >
      {Array.from({ length: dotCount }).map((_, i) => {
        const angle = (360 / dotCount) * i;
        const rad = (angle * Math.PI) / 180;
        const dx = Math.cos(rad) * radius - 4;
        const dy = Math.sin(rad) * radius - 4;
        return (
          <div
            key={i}
            className={`absolute w-2 h-2 rounded-full bg-blue-${color === 'blue' ? '400' : '300'} opacity-70`}
            style={{ left: '50%', top: '50%', marginLeft: dx, marginTop: dy }}
          />
        );
      })}
    </div>
  );
}

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 3 + Math.random() * 6,
  delay: Math.random() * 4,
  duration: 5 + Math.random() * 6,
}));

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // Login form
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  // Register form
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '', confirm: '', inviteCode: '' });

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      toast.error('Preencha todos os campos.');
      return;
    }
    setLoading(true);
    const ok = await login(loginForm.email, loginForm.password);
    setLoading(false);
    if (ok) {
      navigate('/', { replace: true });
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regForm.name || !regForm.email || !regForm.password || !regForm.inviteCode) {
      toast.error('Preencha todos os campos.');
      return;
    }
    if (regForm.inviteCode.trim() !== INVITE_CODE) {
      toast.error('Código de convite inválido.');
      return;
    }
    if (regForm.password !== regForm.confirm) {
      toast.error('As senhas não coincidem.');
      return;
    }
    if (regForm.password.length < 8) {
      toast.error('Senha deve ter ao menos 8 caracteres.');
      return;
    }
    setLoading(true);
    try {
      const { api } = await import('../../api');
      await api.auth.register({ name: regForm.name, email: regForm.email, password: regForm.password });
      toast.success('Conta criada! Faça login.');
      setTab('login');
      setLoginForm({ email: regForm.email, password: '' });
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #172554 100%)' }}>

      {/* Ambient blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #60a5fa 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      {/* Floating particles */}
      {PARTICLES.map(p => <Particle key={p.id} {...p} />)}

      {/* Orbit rings (desktop accent) */}
      <div className="absolute left-1/2 top-1/2 pointer-events-none hidden lg:block">
        <OrbitRing radius={320} duration={30} delay={0} dotCount={4} />
        <OrbitRing radius={420} duration={45} delay={5} dotCount={3} />
        <OrbitRing radius={520} duration={60} delay={10} dotCount={5} />
      </div>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md mx-4"
      >
        {/* Logo area */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)', boxShadow: '0 0 40px rgba(59,130,246,0.5)' }}
          >
            <FlaskConical className="w-10 h-10 text-white" />
          </div>
          <h1
            className="text-3xl font-bold text-white"
          >
            TcheLab
          </h1>
          <p
            className="text-blue-300 mt-1 text-sm"
          >
            Plataforma de Análises Quimiométricas
          </p>
        </div>

        {/* Card body */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'rgba(30, 41, 59, 0.8)' }}>
            {['login', 'register'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  background: tab === t ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : 'transparent',
                  color: tab === t ? '#fff' : '#94a3b8',
                  boxShadow: tab === t ? '0 4px 12px rgba(37, 99, 235, 0.4)' : 'none',
                }}
              >
                {t === 'login' ? 'Entrar' : 'Criar Conta'}
              </button>
            ))}
          </div>

          {tab === 'login' ? (
            <form
              key="login"
              onSubmit={handleLogin}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                    className="input-field"
                    style={iconInput}
                    placeholder="seu@email.com"
                    autoComplete="email"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                    className="input-field"
                    style={iconInputRight}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-300 transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="anim-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    Entrando...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Entrar <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>
            </form>
          ) : (
            <form
              key="register"
              onSubmit={handleRegister}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">Nome</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                  <input
                    type="text"
                    value={regForm.name}
                    onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))}
                    className="input-field"
                    style={iconInput}
                    placeholder="Seu nome completo"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                  <input
                    type="email"
                    value={regForm.email}
                    onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))}
                    className="input-field"
                    style={iconInput}
                    placeholder="seu@email.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={regForm.password}
                    onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))}
                    className="input-field"
                    style={iconInputRight}
                    placeholder="Mín. 8 caracteres"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-300 transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">Confirmar Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                  <input
                    type="password"
                    value={regForm.confirm}
                    onChange={e => setRegForm(f => ({ ...f, confirm: e.target.value }))}
                    className="input-field"
                    style={iconInput}
                    placeholder="Repita a senha"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1.5">Código de Convite</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                  <input
                    type="text"
                    value={regForm.inviteCode}
                    onChange={e => setRegForm(f => ({ ...f, inviteCode: e.target.value }))}
                    className="input-field"
                    style={iconInput}
                    placeholder="Código de acesso"
                    autoComplete="off"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="anim-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    Criando conta...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Criar Conta
                  </span>
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-blue-400/50 mt-6">
          TcheLab © {new Date().getFullYear()} — Análises Quimiométricas
        </p>
      </div>
    </div>
  );
}
