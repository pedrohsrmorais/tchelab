import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi, usersApi } from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Entrar — TcheLab" }],
  }),
  component: LoginPage,
});

// ─── Imagens de fundo (arquivos em frontend/public/login/) ──────────────────

const CAROUSEL_IMAGES = [
  "/login/lab-1.webp",
  "/login/lab-2.webp",
  "/login/lab-3.webp",
  "/login/lab-4.webp",
  "/login/lab-5.webp",
  "/login/lab-6.webp",
  "/login/lab-7.webp",
];

const CAROUSEL_TOTAL_DURATION = CAROUSEL_IMAGES.length * 5; // 5s por imagem = 35s de ciclo

// ─── Carrossel com crossfade ──────────────────────────────────────────────────

function BackgroundCarousel() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-900">
      {CAROUSEL_IMAGES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          fetchPriority={i === 0 ? "high" : "low"}
          decoding="async"
          className="login-carousel-image absolute inset-0 h-full w-full object-cover"
          style={{
            animationDuration: `${CAROUSEL_TOTAL_DURATION}s`,
            animationDelay: `${i * (CAROUSEL_TOTAL_DURATION / CAROUSEL_IMAGES.length)}s`,
          }}
        />
      ))}
      {/* Overlay escuro fixo — as fotos de laboratório são claras, então o painel
          precisa escurecer independentemente do tema (claro/escuro) para o texto
          branco continuar legível. */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-900/55" />
      <div className="absolute inset-0 bg-slate-950/25" />
    </div>
  );
}

// ─── Linhas de espectro decorativas (sobre o carrossel) ───────────────────────

function SpectrumLines() {
  const points = [
    "0,80 40,72 80,60 120,65 160,40 200,55 240,30 280,45 320,20 360,38 400,15 440,28 480,50 520,35 560,55 600,42 640,60 680,52 720,68 760,58 800,72",
    "0,90 40,85 80,75 120,80 160,60 200,70 240,50 280,62 320,40 360,55 400,35 440,48 480,65 520,52 560,70 600,58 640,74 680,65 720,80 760,70 800,85",
  ];
  return (
    <svg
      viewBox="0 0 800 100"
      className="absolute bottom-0 left-0 right-0 w-full text-white opacity-25"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {points.map((p, i) => (
        <polyline key={i} points={p} fill="none" stroke="currentColor" strokeWidth={i === 0 ? 1.5 : 0.8} />
      ))}
    </svg>
  );
}

// ─── Divisor em "meia lua" entre o painel de imagem e o painel de login ──────
// Uma única curva Bézier: flush (largura total) nos cantos superior e inferior,
// e recuada para dentro do painel de imagem no meio da tela — como uma lua
// crescente encaixada na borda, em vez de uma linha reta.

function CurveDivider() {
  return (
    <div
      className="hidden lg:block absolute inset-y-0 right-full w-36 xl:w-44 z-10 pointer-events-none"
      style={{ filter: "drop-shadow(-14px 0 28px rgba(0,0,0,0.18))" }}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 160 1000"
        preserveAspectRatio="none"
        className="text-background"
      >
        <path
          d="M160,0 C64,0 0,220 0,500 C0,780 64,1000 160,1000 Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

// ─── Language switcher (a página de login não usa o AppShell) ────────────────

function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pt";

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center rounded-lg border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden shadow-sm">
      <button
        onClick={() => i18n.changeLanguage("pt")}
        className={`px-2.5 h-8 text-xs font-semibold transition-colors ${
          lang === "pt" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
      >
        {t("appShell.language.pt")}
      </button>
      <button
        onClick={() => i18n.changeLanguage("en")}
        className={`px-2.5 h-8 text-xs font-semibold transition-colors ${
          lang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
      >
        {t("appShell.language.en")}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LoginPage() {
  const { t } = useTranslation();
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/home" });
  }, [user, loading, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // 1. Autentica e salva tokens via tokenStorage
      await authApi.login({ email, password: senha });

      // 2. Busca perfil completo e hidrata o contexto
      const { data: profile } = await usersApi.me();
      setUser(profile);

      toast.success(t("login.welcomeToast", { name: profile.name.split(" ")[0] }));
      navigate({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("login.errorToast"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      <LanguageSwitcher />

      {/* ── Painel esquerdo: carrossel + copy (agora ocupa a maior parte da tela) ── */}
      <div className="hidden lg:flex lg:flex-1 text-white flex-col justify-between relative overflow-hidden">
        <BackgroundCarousel />

        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="absolute top-1/3 -right-24 w-72 h-72 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, var(--color-accent) 0%, transparent 70%)",
            opacity: 0.2,
          }}
        />
        <SpectrumLines />

        <div className="relative p-14 xl:p-20 flex flex-col justify-between h-full">
          <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-700">
            <FlaskConical className="h-8 w-8 xl:h-9 xl:w-9 text-primary drop-shadow" />
            <span className="font-display font-bold text-2xl xl:text-3xl tracking-tight drop-shadow">
              {t("login.brand")}
            </span>
          </div>

          <div className="space-y-6 max-w-lg xl:max-w-xl animate-in fade-in slide-in-from-left-3 duration-700">
            <p className="text-xs xl:text-sm font-mono uppercase tracking-widest text-white/60">
              {t("login.heroEyebrow")}
            </p>
            <h2 className="text-4xl xl:text-5xl font-display font-semibold leading-tight tracking-tight drop-shadow-md">
              {t("login.heroTitle")}
            </h2>
            <p className="text-base xl:text-lg text-white/75 leading-relaxed drop-shadow-sm">
              {t("login.heroSubtitle")}
            </p>
            <div className="flex flex-wrap gap-2.5 pt-2">
              {["PLS-DA", "PCR", "SIMCA", "SVM", "CNN-1D"].map((m) => (
                <span
                  key={m}
                  className="text-xs font-mono px-3 py-1.5 rounded-full border border-white/25 bg-white/10 backdrop-blur-sm text-white/80"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs text-white/40">
            {t("login.footer", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>

      {/* ── Painel direito: formulário (menor, com fronteira em meia lua) ─── */}
      <div className="flex-1 lg:flex-none lg:w-[420px] xl:w-[460px] flex items-center justify-center p-6 relative bg-background">
        <CurveDivider />

        <div className="w-full max-w-xs animate-in fade-in slide-in-from-bottom-3 duration-500">
          {/* Logo — sempre acima do card de login, mobile e desktop */}
          <div className="flex items-center gap-2.5 mb-10">
            <FlaskConical className="h-7 w-7 text-primary" />
            <span className="font-display font-bold text-xl">{t("login.brand")}</span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">
              {t("login.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("login.subtitle")}
            </p>
          </div>

          {/* Delimitador — campos dentro de um card com borda, não mais soltos */}
          <div className="rounded-2xl border border-border bg-card/70 backdrop-blur-sm p-6 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("login.emailLabel")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    autoComplete="email"
                    placeholder={t("login.emailPlaceholder")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="senha">{t("login.passwordLabel")}</Label>
                  <Link
                    to="/login"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {t("login.forgotPassword")}
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="senha"
                    type="password"
                    required
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="pl-9"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("login.submitting") : t("login.submit")}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("login.noAccountPrefix")}{" "}
          </p>
        </div>
      </div>
    </div>
  );
}