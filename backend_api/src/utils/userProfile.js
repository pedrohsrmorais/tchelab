'use strict';

/**
 * Serialização e validação do perfil de usuário.
 *
 *  - `selfUser`   : o que o PRÓPRIO usuário (ou admin) vê — tudo menos segredos.
 *  - `publicUser` : o que outros usuários veem — respeita as opções de
 *                   privacidade guardadas em `users.preferences.privacy`.
 *  - `sanitize*`  : validação de entrada (URLs, datas, preferências).
 */

const THEMES = ['dark', 'light', 'classic'];
const LANGUAGES = ['pt', 'en', 'es'];

const DEFAULT_PRIVACY = { show_email: false, show_birth_date: false, show_stats: true };

function parseJson(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}

function readPreferences(row) {
  const raw = parseJson(row.preferences, {}) || {};
  const privacy = { ...DEFAULT_PRIVACY, ...(raw.privacy || {}) };
  const out = { ...raw, privacy };
  if (!THEMES.includes(out.theme)) delete out.theme;
  if (!LANGUAGES.includes(out.language)) delete out.language;
  return out;
}

function dateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function selfUser(row) {
  const { password_hash, deleted_at, ...rest } = row;
  return { ...rest, birth_date: dateOnly(row.birth_date), preferences: readPreferences(row) };
}

function publicUser(row, viewer) {
  const prefs = readPreferences(row);
  const privacy = prefs.privacy;
  const isSelf = !!viewer && viewer.id === row.id;
  const isAdmin = !!viewer && viewer.role === 'admin';
  const base = {
    uuid: row.uuid,
    name: row.name,
    initials: row.initials,
    avatar_url: row.avatar_url,
    cover_color: row.cover_color,
    bio: row.bio,
    research_area: row.research_area,
    institution: row.institution,
    lattes_url: row.lattes_url,
    linkedin_url: row.linkedin_url,
    github_url: row.github_url,
    created_at: row.created_at,
    is_self: isSelf,
  };
  if (isSelf || isAdmin || privacy.show_email) base.email = row.email;
  if (isSelf || isAdmin || privacy.show_birth_date) base.birth_date = dateOnly(row.birth_date);
  if (isSelf || isAdmin) base.privacy = privacy;
  return base;
}

const URL_HOSTS = {
  lattes_url: [/(^|\.)cnpq\.br$/i],
  linkedin_url: [/(^|\.)linkedin\.com$/i, /^lnkd\.in$/i],
  github_url: [/(^|\.)github\.com$/i, /(^|\.)gitlab\.com$/i],
};

/** Retorna { value } (string normalizada ou null) ou { error }. */
function sanitizeUrl(field, input) {
  if (input == null || String(input).trim() === '') return { value: null };
  let raw = String(input).trim();
  if (raw.length > 500) return { error: 'URL muito longa.' };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  let u;
  try { u = new URL(raw); } catch { return { error: 'URL inválida.' }; }
  if (!['http:', 'https:'].includes(u.protocol)) return { error: 'Use um endereço http(s).' };
  const hosts = URL_HOSTS[field] || [];
  if (hosts.length && !hosts.some((re) => re.test(u.hostname))) {
    return { error: 'O endereço não pertence ao site esperado.' };
  }
  u.protocol = 'https:';
  return { value: u.toString() };
}

function sanitizeBirthDate(input) {
  if (input == null || input === '') return { value: null };
  const s = String(input).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: 'Data inválida (AAAA-MM-DD).' };
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { error: 'Data inválida.' };
  const now = new Date();
  if (d > now) return { error: 'A data não pode estar no futuro.' };
  if (d.getUTCFullYear() < 1900) return { error: 'Data inválida.' };
  return { value: s };
}

/** Mescla preferências recebidas (whitelist) sobre as atuais. */
function mergePreferences(current, incoming) {
  const out = { ...(current || {}) };
  const errors = [];
  if (incoming == null || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return { errors: [{ field: 'preferences', message: 'Inválido.' }] };
  }
  if (incoming.theme !== undefined) {
    if (THEMES.includes(incoming.theme)) out.theme = incoming.theme;
    else errors.push({ field: 'preferences.theme', message: `Deve ser um de: ${THEMES.join(', ')}.` });
  }
  if (incoming.language !== undefined) {
    if (LANGUAGES.includes(incoming.language)) out.language = incoming.language;
    else errors.push({ field: 'preferences.language', message: `Deve ser um de: ${LANGUAGES.join(', ')}.` });
  }
  if (incoming.privacy !== undefined) {
    if (incoming.privacy && typeof incoming.privacy === 'object') {
      const priv = { ...DEFAULT_PRIVACY, ...(out.privacy || {}) };
      for (const k of Object.keys(DEFAULT_PRIVACY)) {
        if (incoming.privacy[k] !== undefined) priv[k] = !!incoming.privacy[k];
      }
      out.privacy = priv;
    } else errors.push({ field: 'preferences.privacy', message: 'Inválido.' });
  }
  return { value: out, errors };
}

module.exports = {
  THEMES, LANGUAGES, DEFAULT_PRIVACY,
  parseJson, readPreferences, selfUser, publicUser,
  sanitizeUrl, sanitizeBirthDate, mergePreferences, dateOnly,
};
