'use strict';

/** Modelos de quadro (colunas, grupos e um item de exemplo), em pt/en/es. */

const { labelsFrom, defaultConfig, newId } = require('./boardCells.service');

const T = {
  pt: {
    group_new: 'Novas tarefas', group_week: 'Esta semana', group_next: 'Próximas', group_done: 'Concluídas',
    group_open: 'Abertos', group_closed: 'Resolvidos', group_mod: 'Módulo 1',
    status: 'Status', person: 'Responsável', due: 'Prazo', prio: 'Prioridade', notes: 'Notas', type: 'Tipo', requester: 'Solicitante',
    period: 'Período', link: 'Material', ticket_status: 'Situação',
    prio_labels: [['Baixa', '#579bfc', false], ['Média', '#fdab3d', false], ['Alta', '#e2445c', false], ['Crítica', '#333333', false]],
    ticket_labels: [['Novo', '#579bfc', false], ['Em análise', '#fdab3d', false], ['Aguardando', '#a25ddc', false], ['Resolvido', '#00c875', true], ['Descartado', '#c4c4c4', true]],
    types: ['Dúvida', 'Problema', 'Melhoria', 'Equipamento'],
    ex_task: 'Exemplo: preparar as amostras', ex_ticket: 'Exemplo: espectrômetro não conecta', ex_course: 'Exemplo: leitura do capítulo 1',
  },
  en: {
    group_new: 'New tasks', group_week: 'This week', group_next: 'Upcoming', group_done: 'Completed',
    group_open: 'Open', group_closed: 'Resolved', group_mod: 'Module 1',
    status: 'Status', person: 'Owner', due: 'Due date', prio: 'Priority', notes: 'Notes', type: 'Type', requester: 'Requester',
    period: 'Period', link: 'Material', ticket_status: 'Status',
    prio_labels: [['Low', '#579bfc', false], ['Medium', '#fdab3d', false], ['High', '#e2445c', false], ['Critical', '#333333', false]],
    ticket_labels: [['New', '#579bfc', false], ['Investigating', '#fdab3d', false], ['Waiting', '#a25ddc', false], ['Resolved', '#00c875', true], ['Dismissed', '#c4c4c4', true]],
    types: ['Question', 'Problem', 'Improvement', 'Equipment'],
    ex_task: 'Example: prepare the samples', ex_ticket: 'Example: spectrometer will not connect', ex_course: 'Example: read chapter 1',
  },
  es: {
    group_new: 'Nuevas tareas', group_week: 'Esta semana', group_next: 'Próximas', group_done: 'Completadas',
    group_open: 'Abiertos', group_closed: 'Resueltos', group_mod: 'Módulo 1',
    status: 'Estado', person: 'Responsable', due: 'Fecha límite', prio: 'Prioridad', notes: 'Notas', type: 'Tipo', requester: 'Solicitante',
    period: 'Período', link: 'Material', ticket_status: 'Situación',
    prio_labels: [['Baja', '#579bfc', false], ['Media', '#fdab3d', false], ['Alta', '#e2445c', false], ['Crítica', '#333333', false]],
    ticket_labels: [['Nuevo', '#579bfc', false], ['En análisis', '#fdab3d', false], ['En espera', '#a25ddc', false], ['Resuelto', '#00c875', true], ['Descartado', '#c4c4c4', true]],
    types: ['Duda', 'Problema', 'Mejora', 'Equipo'],
    ex_task: 'Ejemplo: preparar las muestras', ex_ticket: 'Ejemplo: el espectrómetro no conecta', ex_course: 'Ejemplo: leer el capítulo 1',
  },
};

const GROUP_COLORS = ['#579bfc', '#a25ddc', '#00c875', '#fdab3d', '#e2445c', '#037f4c', '#ff158a', '#66ccff'];

const col = (title, type, config, width) => ({ title, type, config: config || defaultConfig(type), width: width || 150 });
const status = (title, lang, labels) => col(title, 'status', { labels: labelsFrom(labels || require('./boardCells.service').DEFAULT_STATUS[lang]) }, 140);
const dropdown = (title, names) => col(title, 'dropdown', { options: names.map((n, i) => ({ id: `o${i + 1}${newId().slice(0, 3)}`, label: n, color: ['#579bfc', '#e2445c', '#00c875', '#fdab3d'][i % 4] })) }, 150);

function build(template, langIn) {
  const lang = T[langIn] ? langIn : 'pt';
  const t = T[lang];
  switch (template) {
    case 'lab_tasks': return {
      columns: [col(t.person, 'people', { multiple: true }, 140), status(t.status, lang), status(t.prio, lang, t.prio_labels), col(t.due, 'date', {}, 130), col(t.notes, 'text', {}, 200)],
      groups: [t.group_week, t.group_next, t.group_done],
      example: { group: 0, title: t.ex_task },
    };
    case 'tickets': return {
      columns: [status(t.ticket_status, lang, t.ticket_labels), status(t.prio, lang, t.prio_labels), dropdown(t.type, t.types), col(t.requester, 'people', { multiple: false }, 140), col(t.person, 'people', { multiple: true }, 140), col(t.due, 'date', {}, 130)],
      groups: [t.group_open, t.group_closed],
      example: { group: 0, title: t.ex_ticket },
    };
    case 'course': return {
      columns: [col(t.person, 'people', { multiple: true }, 140), status(t.status, lang), col(t.period, 'timeline', {}, 190), col(t.link, 'link', {}, 160)],
      groups: [t.group_mod],
      example: { group: 0, title: t.ex_course },
    };
    default: return {
      columns: [col(t.person, 'people', { multiple: true }, 140), status(t.status, lang), col(t.due, 'date', {}, 130)],
      groups: [t.group_new],
      example: null,
    };
  }
}

module.exports = { build, GROUP_COLORS, TEMPLATES: ['blank', 'lab_tasks', 'tickets', 'course'] };
