import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListTodo, CalendarClock, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import { parseApiError } from '../../utils/errors';
import EmptyState from '../ui/EmptyState';
import Popover from './Popover';
import { ink, fmtDay, todayKey, addDaysKey, arr } from './boardUtils';

function StatusPill({ task, onPick }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const st = task.status;
  const can = st && task.access !== 'none' && (task.access === 'all' || task.access === 'status');
  if (!st) return null;
  const l = st.label;
  return (
    <>
      <button ref={ref} type="button" disabled={!can} onClick={() => setOpen((o) => !o)} className="board-status" style={{ width: 130, height: 28, margin: 0, background: l ? l.color : 'var(--bg-hover)', color: l ? ink(l.color) : 'var(--text-muted)' }} aria-label={t('board.changeStatus')} data-testid="task-status">
        <span className="truncate">{l ? l.label : '—'}</span>
      </button>
      {open && (
        <Popover anchor={ref.current} onClose={() => setOpen(false)} width={200}>
          <ul className="p-2 space-y-1.5">
            {st.labels.map((x) => (
              <li key={x.id}><button type="button" className="board-status w-full" style={{ background: x.color, color: ink(x.color), margin: 0, height: 30 }} onClick={() => { setOpen(false); onPick(x.id); }}>{x.label}{x.done && <Check className="w-3.5 h-3.5 ml-1" />}</button></li>
            ))}
          </ul>
        </Popover>
      )}
    </>
  );
}

/** "Minhas tarefas": tudo o que está atribuído a mim em todos os quadros da comunidade, por prazo. */
export default function MyTasks({ cid }) {
  const { t } = useTranslation();
  const today = todayKey();
  const { data, refetch } = useApi(() => api.boards.mine(cid, today), [cid]);
  const [showDone, setShowDone] = useState(false);
  const list = arr(data);

  const groups = useMemo(() => {
    const week = addDaysKey(today, 7);
    const g = { overdue: [], today: [], week: [], later: [], none: [], done: [] };
    list.forEach((x) => {
      if (x.done) g.done.push(x);
      else if (!x.due) g.none.push(x);
      else if (x.overdue) g.overdue.push(x);
      else if (x.due === today) g.today.push(x);
      else if (x.due <= week) g.week.push(x);
      else g.later.push(x);
    });
    Object.values(g).forEach((a) => a.sort((p, q) => (p.due || '9999').localeCompare(q.due || '9999')));
    return g;
  }, [list, today]);

  const setStatus = async (task, id) => {
    try { await api.boards.setCell(cid, task.board.uuid, task.uuid, task.status.column, id); await refetch(); }
    catch (err) { toast.error(parseApiError(err, t('common.error')).message); }
  };

  if (data && list.length === 0) {
    return <EmptyState icon={ListTodo} title={t('board.noTasksTitle')} description={t('board.noTasksDesc')} />;
  }
  const sections = [['overdue', 'var(--danger)'], ['today', 'var(--warning)'], ['week', 'var(--accent)'], ['later', 'var(--text-secondary)'], ['none', 'var(--text-muted)']];
  const Row = ({ x }) => (
    <li className="card px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="task-row">
      <span className="w-1.5 self-stretch rounded-full" style={{ background: x.group.color }} aria-hidden />
      <Link to={`/communities/${cid}/boards/${x.board.uuid}?item=${x.uuid}`} className="min-w-0 flex-1 basis-48 hover:underline">
        <span className="board-seq">#{x.seq}</span> <span className="text-sm font-medium break-words" style={{ color: 'var(--text-primary)', textDecoration: x.done ? 'line-through' : 'none' }}>{x.title}</span>
        <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{x.board.title} · {x.group.title}</span>
      </Link>
      {x.due && <span className="text-xs flex items-center gap-1 whitespace-nowrap" style={{ color: x.overdue ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: x.overdue ? 600 : 400 }}><CalendarClock className="w-3.5 h-3.5" />{fmtDay(x.due)}</span>}
      <StatusPill task={x} onPick={(id) => setStatus(x, id)} />
    </li>
  );
  return (
    <div className="space-y-5" data-testid="my-tasks">
      {sections.map(([k, color]) => groups[k].length > 0 && (
        <section key={k} aria-label={t(`board.tasks.${k}`)}>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color }}>{t(`board.tasks.${k}`)} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{groups[k].length}</span></h3>
          <ul className="space-y-2">{groups[k].map((x) => <Row key={x.uuid} x={x} />)}</ul>
        </section>
      ))}
      {groups.done.length > 0 && (
        <section>
          <button type="button" className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-muted)' }} onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>{t('board.tasks.done')} <span className="text-xs font-normal">{groups.done.length}</span> <span className="text-xs underline font-normal">{showDone ? t('board.hide') : t('board.show')}</span></button>
          {showDone && <ul className="space-y-2 mt-2">{groups.done.map((x) => <Row key={x.uuid} x={x} />)}</ul>}
        </section>
      )}
    </div>
  );
}
