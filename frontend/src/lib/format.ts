import type { UIJobStatus, UIModelStatus } from "./types";

// ─── Formatadores de data ──────────────────────────────────────────────────────

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day:   "2-digit",
  month: "2-digit",
  year:  "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day:    "2-digit",
  month:  "2-digit",
  year:   "numeric",
  hour:   "2-digit",
  minute: "2-digit",
});

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : dateFormatter.format(d);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : dateTimeFormatter.format(d);
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)           return "agora";
  if (diff < 3_600)        return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86_400)       return `há ${Math.floor(diff / 3_600)} h`;
  if (diff < 86_400 * 7)   return `há ${Math.floor(diff / 86_400)} d`;
  return fmtDate(iso);
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}

export function fmtPercent(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

export function fmtFloat(n: number | null | undefined, decimals = 4): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

// ─── Tokens de estilo por status de job ───────────────────────────────────────

export const JOB_STATUS_TOKEN: Record<UIJobStatus, string> = {
  queued:    "bg-amber-50   text-amber-700   border-amber-200   dark:bg-amber-950/30  dark:text-amber-400  dark:border-amber-800",
  running:   "bg-blue-50    text-blue-700    border-blue-200    dark:bg-blue-950/30   dark:text-blue-400   dark:border-blue-800",
  done:      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  failed:    "bg-red-50     text-red-700     border-red-200     dark:bg-red-950/30    dark:text-red-400    dark:border-red-800",
  cancelled: "bg-zinc-50    text-zinc-600    border-zinc-200    dark:bg-zinc-900/30   dark:text-zinc-400   dark:border-zinc-700",
};

export const JOB_STATUS_LABEL: Record<UIJobStatus, string> = {
  queued:    "Na fila",
  running:   "Treinando",
  done:      "Concluído",
  failed:    "Falhou",
  cancelled: "Cancelado",
};

// ─── Tokens de estilo por status de modelo ────────────────────────────────────

export const MODEL_STATUS_TOKEN: Record<UIModelStatus, string> = {
  pending:  "bg-zinc-50    text-zinc-600    border-zinc-200    dark:bg-zinc-900/30  dark:text-zinc-400   dark:border-zinc-700",
  training: "bg-blue-50    text-blue-700    border-blue-200    dark:bg-blue-950/30  dark:text-blue-400   dark:border-blue-800",
  ready:    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  failed:   "bg-red-50     text-red-700     border-red-200     dark:bg-red-950/30   dark:text-red-400    dark:border-red-800",
};

export const MODEL_STATUS_LABEL: Record<UIModelStatus, string> = {
  pending:  "Pendente",
  training: "Treinando",
  ready:    "Pronto",
  failed:   "Falhou",
};

// ─── Técnica espectral ────────────────────────────────────────────────────────

export const TECHNIQUE_COLOR: Record<string, string> = {
  NIR:          "bg-blue-400",
  Raman:        "bg-violet-400",
  FTIR:         "bg-amber-400",
  "UV-Vis":     "bg-emerald-400",
  NMR:          "bg-rose-400",
  Fluorescence: "bg-cyan-400",
  Other:        "bg-zinc-400",
};

export const TECHNIQUE_BADGE: Record<string, string> = {
  NIR:          "bg-blue-50   text-blue-700   border-blue-200   dark:bg-blue-950/30  dark:text-blue-400   dark:border-blue-800",
  Raman:        "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800",
  FTIR:         "bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-950/30 dark:text-amber-400  dark:border-amber-800",
  "UV-Vis":     "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  NMR:          "bg-rose-50   text-rose-700   border-rose-200   dark:bg-rose-950/30  dark:text-rose-400   dark:border-rose-800",
  Fluorescence: "bg-cyan-50   text-cyan-700   border-cyan-200   dark:bg-cyan-950/30  dark:text-cyan-400   dark:border-cyan-800",
  Other:        "bg-zinc-50   text-zinc-600   border-zinc-200   dark:bg-zinc-900/30  dark:text-zinc-400   dark:border-zinc-700",
};

// ─── Tipo de modelo ───────────────────────────────────────────────────────────

export const MODEL_TYPE_LABEL: Record<string, string> = {
  classification: "Classificação",
  regression:     "Quantificação",
  exploratory:    "Exploratório",
};

export const MODEL_TYPE_TOKEN: Record<string, string> = {
  classification: "bg-purple-50  text-purple-700  border-purple-200  dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800",
  regression:     "bg-teal-50    text-teal-700    border-teal-200    dark:bg-teal-950/30   dark:text-teal-400   dark:border-teal-800",
  exploratory:    "bg-zinc-50    text-zinc-600    border-zinc-200    dark:bg-zinc-900/30   dark:text-zinc-400   dark:border-zinc-700",
};