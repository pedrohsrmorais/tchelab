import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { currentLocale } from '../../i18n';
import { toKey, todayKey, parseKey } from './boardUtils';

/**
 * Calendário de mês. Modo "dia": `value` = 'AAAA-MM-DD'. Modo "período" (`range`): `value` = {start,end};
 * o primeiro clique define o início, o segundo o fim.
 */
export default function MiniCalendar({ value, onPick, range = false }) {
  const { t } = useTranslation();
  const start = range ? value?.start : value;
  const [view, setView] = useState(() => { const d = start ? parseKey(start) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [pending, setPending] = useState(null); // início escolhido, aguardando o fim
  const today = todayKey();
  const first = (view.getDay() + 6) % 7; // segunda-feira primeiro
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(toKey(new Date(view.getFullYear(), view.getMonth(), d)));
  const monday = new Date(2024, 0, 1);
  const wd = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), 0, 1 + i).toLocaleDateString(currentLocale(), { weekday: 'narrow' }));
  const title = view.toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });

  const click = (k) => {
    if (!range) { onPick(k); return; }
    if (!pending) { setPending(k); return; }
    const [a, b] = k < pending ? [k, pending] : [pending, k];
    setPending(null); onPick({ start: a, end: b });
  };
  const inRange = (k) => {
    if (!range) return false;
    if (pending) return k === pending;
    return !!value?.start && k >= value.start && k <= value.end;
  };

  return (
    <div className="p-2" style={{ userSelect: 'none' }}>
      <div className="flex items-center justify-between mb-1">
        <button type="button" className="btn-ghost p-1" aria-label={t('board.prevMonth')} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{title}</span>
        <button type="button" className="btn-ghost p-1" aria-label={t('board.nextMonth')} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[0.65rem] mb-1" style={{ color: 'var(--text-muted)' }}>{wd.map((w, i) => <span key={i}>{w}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((k, i) => (k ? (
          <button key={k} type="button" onClick={() => click(k)} data-day={k}
            className="h-8 text-xs rounded-md"
            style={{
              background: inRange(k) ? 'var(--accent)' : 'transparent', color: inRange(k) ? '#fff' : 'var(--text-primary)',
              outline: k === today ? '1px solid var(--accent)' : 'none', fontWeight: k === today ? 700 : 400,
            }}>{Number(k.slice(8))}</button>
        ) : <span key={`b${i}`} />))}
      </div>
      {range && pending && <p className="text-[0.7rem] mt-1 text-center" style={{ color: 'var(--text-muted)' }}>{t('board.pickEndDate')}</p>}
    </div>
  );
}
