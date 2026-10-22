import { currentLocale } from '../i18n';

/** Utilidades de data/hora no FUSO DO EQUIPAMENTO (o navegador pode estar em outro fuso). */

export const dateKey = (iso, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
export const todayKey = (tz) => dateKey(new Date().toISOString(), tz);
export const timeOf = (iso, tz) => new Intl.DateTimeFormat(currentLocale(), { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

export const addDays = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekStart = (key) => addDays(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7)); // segunda-feira
export const dayLabel = (key, opts = { weekday: 'short', day: '2-digit', month: '2-digit' }) => new Intl.DateTimeFormat(currentLocale(), { timeZone: 'UTC', ...opts }).format(new Date(`${key}T12:00:00Z`));
export const weekdayOf = (key) => new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = domingo

export const fmtRange = (startIso, endIso, tz) => `${dayLabel(dateKey(startIso, tz))} ${timeOf(startIso, tz)}–${timeOf(endIso, tz)}`;

/** Diferença (ms) entre o horário "de parede" em `tz` e UTC, no instante `ms`. */
function offsetAt(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}
/** '2026-10-22T09:00' (horário local do equipamento) → ISO UTC. */
export function zonedToIso(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || '');
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ms = guess - offsetAt(guess, tz);
  ms = guess - offsetAt(ms, tz);
  return new Date(ms).toISOString();
}
/** ISO UTC → valor para <input type="datetime-local"> no fuso do equipamento. */
export const isoToZonedInput = (iso, tz) => `${dateKey(iso, tz)}T${new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))}`;
export const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } };
