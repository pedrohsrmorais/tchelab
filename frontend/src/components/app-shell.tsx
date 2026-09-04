import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlaskConical, Database, Brain,
  History, Settings, HelpCircle, Smartphone,
  Search, Bell, ChevronDown, LogOut, User,
  Menu, X, Globe, BookOpen, FolderOpen,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface NavItem {
  labelKey: string;
  to:       string;
  icon:     React.ReactNode;
}

// ─── Fluxo principal ────────────────────────────────────────────────────────
// A ordem aqui reflete o pipeline real do usuário:
// 1. Espectros  → dado bruto entra na plataforma (upload/paste)
// 2. Coleções   → agrupamento livre dos espectros coletados
// 3. Datasets   → matriz homogênea, pronta pra modelagem (train/test/médias)
// 4. Modelagem  → treina o modelo (PLS, PCA, etc.)
// 5. Análise    → aplica o modelo treinado (predição/classificação)

const WORKFLOW_ITEMS: NavItem[] = [
  { labelKey: "appShell.nav.spectra",    to: "/spectra",    icon: <BookOpen     className="h-4 w-4" /> },
  { labelKey: "appShell.nav.collections", to: "/collection", icon: <FolderOpen   className="h-4 w-4" /> },
  { labelKey: "appShell.nav.datasets",   to: "/datasets",   icon: <Database     className="h-4 w-4" /> },
  { labelKey: "appShell.nav.modeling",   to: "/modelagem",  icon: <Brain        className="h-4 w-4" /> },
  { labelKey: "appShell.nav.analysis",   to: "/analise",    icon: <FlaskConical className="h-4 w-4" /> },
];

// ─── Secundário: navegação/monitoramento, fora do fluxo linear ─────────────

const OTHER_ITEMS: NavItem[] = [
  { labelKey: "appShell.nav.explore", to: "/",          icon: <Globe   className="h-4 w-4" /> },
  { labelKey: "appShell.nav.history", to: "/historico", icon: <History className="h-4 w-4" /> },
];

const BOTTOM_NAV: NavItem[] = [
  { labelKey: "appShell.nav.settings", to: "/configuracoes", icon: <Settings   className="h-4 w-4" /> },
  { labelKey: "appShell.nav.support",  to: "/suporte",       icon: <HelpCircle className="h-4 w-4" /> },
  { labelKey: "appShell.nav.mobile",   to: "/mobile",        icon: <Smartphone className="h-4 w-4" /> },
];

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({ initials, size = 40 }: { initials: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground grid place-items-center font-display font-semibold shrink-0 select-none"
    >
      {initials}
    </div>
  );
}

// ─── Badge numérico do passo (reforça a ordem do fluxo) ──────────────────────

function StepBadge({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={`h-4 w-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {n}
    </span>
  );
}

// ─── Language switcher ────────────────────────────────────────────────────────

function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "pt";

  return (
    <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0">
      <button
        onClick={() => i18n.changeLanguage("pt")}
        className={`px-2 h-9 text-xs font-semibold transition-colors ${
          lang === "pt" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
      >
        {t("appShell.language.pt")}
      </button>
      <button
        onClick={() => i18n.changeLanguage("en")}
        className={`px-2 h-9 text-xs font-semibold transition-colors ${
          lang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
      >
        {t("appShell.language.en")}
      </button>
    </div>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t }            = useTranslation();
  const { user, logout } = useAuth();
  const routerState      = useRouterState();
  const pathname          = routerState.location.pathname;

  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  function isActive(to: string) {
    if (to === "/") return pathname === "/" || pathname === "/home";
    return pathname.startsWith(to);
  }

  const noShell = ["/login"].includes(pathname);
  if (noShell) return <>{children}</>;

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── Sidebar overlay (mobile) ──────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col
        transform transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>

        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold text-sm">T</span>
            </div>
            <span className="font-display font-semibold text-lg tracking-tight">TcheLab</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User info */}
        {user && (
          <div className="px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <Avatar initials={user.initials ?? user.name?.charAt(0).toUpperCase() ?? "U"} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">

          {/* Fluxo de trabalho — ordem 1 a 5 */}
          <div>
            <p className="px-2 mb-2 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              {t("appShell.workflowSection")}
            </p>
            <ul className="space-y-0.5">
              {WORKFLOW_ITEMS.map((item, i) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.to)
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/70 hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <StepBadge n={i + 1} active={isActive(item.to)} />
                    <span className={isActive(item.to) ? "text-primary" : "text-muted-foreground"}>
                      {item.icon}
                    </span>
                    {t(item.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Exploração e monitoramento */}
          <div>
            <p className="px-2 mb-2 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              {t("appShell.exploreSection")}
            </p>
            <ul className="space-y-0.5">
              {OTHER_ITEMS.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.to)
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/70 hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span className={isActive(item.to) ? "text-primary" : "text-muted-foreground"}>
                      {item.icon}
                    </span>
                    {t(item.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Nav inferior */}
        <div className="border-t border-border py-3 px-3 shrink-0">
          <ul className="space-y-0.5">
            {BOTTOM_NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.to)
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className={isActive(item.to) ? "text-primary" : "text-muted-foreground"}>
                    {item.icon}
                  </span>
                  {t(item.labelKey)}
                </Link>
              </li>
            ))}
            {user && (
              <li>
                <button
                  onClick={() => { logout(); setSidebarOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
                >
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                  {t("appShell.logout")}
                </button>
              </li>
            )}
          </ul>
          <p className="px-2 mt-3 text-[10px] text-muted-foreground">
            {t("appShell.footerTagline")}
          </p>
        </div>
      </aside>

      {/* ── Área principal ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="h-14 border-b border-border bg-card flex items-center gap-3 px-4 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder={t("appShell.searchPlaceholder")}
                className="w-full h-9 pl-9 pr-4 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <LanguageSwitcher />

            <button className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <Bell className="h-4 w-4" />
            </button>
            <Link
              to="/mobile"
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Smartphone className="h-4 w-4" />
            </Link>
            <Link
              to="/instrucoes"
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <BookOpen className="h-4 w-4" />
            </Link>
            <Link
              to="/configuracoes"
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Settings className="h-4 w-4" />
            </Link>

            {user && (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 h-9 px-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <Avatar initials={user.initials ?? user.name?.charAt(0).toUpperCase() ?? "U"} size={28} />
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-card border border-border rounded-lg shadow-lg py-1 text-sm">
                      <div className="px-3 py-2 border-b border-border">
                        <p className="font-medium truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <Link
                        to="/perfil"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors"
                      >
                        <User className="h-4 w-4 text-muted-foreground" /> {t("appShell.userMenu.profile")}
                      </Link>
                      <Link
                        to="/configuracoes"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors"
                      >
                        <Settings className="h-4 w-4 text-muted-foreground" /> {t("appShell.userMenu.settings")}
                      </Link>
                      <div className="border-t border-border mt-1 pt-1">
                        <button
                          onClick={() => { logout(); setUserMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-destructive/80 hover:text-destructive"
                        >
                          <LogOut className="h-4 w-4" /> {t("appShell.userMenu.logout")}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Conteúdo */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}