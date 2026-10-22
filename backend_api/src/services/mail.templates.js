'use strict';

/** Textos dos e-mails de reserva em pt / en / es. Todo texto vindo do usuário é escapado. */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LANGS = ['pt', 'en', 'es'];
const pick = (lang) => (LANGS.includes(lang) ? lang : 'pt');

const T = {
  verify: {
    subject: { pt: 'Confirme seu e-mail para reservar {eq}', en: 'Confirm your email to book {eq}', es: 'Confirma tu correo para reservar {eq}' },
    body: { pt: 'Olá, {name}! Recebemos seu pedido para usar {eq} em {when}. Confirme seu e-mail em até 15 minutos para segurar o horário.', en: 'Hi {name}! We received your request to use {eq} on {when}. Confirm your email within 15 minutes to hold the slot.', es: '¡Hola, {name}! Recibimos tu solicitud para usar {eq} el {when}. Confirma tu correo en 15 minutos para reservar el horario.' },
    cta: { pt: 'Confirmar e-mail', en: 'Confirm email', es: 'Confirmar correo' },
  },
  received: {
    subject: { pt: 'Pedido recebido: {eq}', en: 'Request received: {eq}', es: 'Solicitud recibida: {eq}' },
    body: { pt: 'Seu pedido para {eq} em {when} foi recebido e aguarda a aprovação do responsável. Você receberá a resposta por e-mail.', en: 'Your request for {eq} on {when} was received and awaits approval. You will get the answer by email.', es: 'Tu solicitud para {eq} el {when} fue recibida y espera aprobación. Recibirás la respuesta por correo.' },
    cta: { pt: 'Ver ou cancelar o pedido', en: 'View or cancel the request', es: 'Ver o cancelar la solicitud' },
  },
  confirmed: {
    subject: { pt: 'Reserva confirmada: {eq}', en: 'Booking confirmed: {eq}', es: 'Reserva confirmada: {eq}' },
    body: { pt: 'Sua reserva de {eq} em {when} está confirmada.', en: 'Your booking of {eq} on {when} is confirmed.', es: 'Tu reserva de {eq} el {when} está confirmada.' },
    cta: { pt: 'Ver ou cancelar a reserva', en: 'View or cancel the booking', es: 'Ver o cancelar la reserva' },
  },
  rejected: {
    subject: { pt: 'Reserva não aprovada: {eq}', en: 'Booking not approved: {eq}', es: 'Reserva no aprobada: {eq}' },
    body: { pt: 'Seu pedido para {eq} em {when} não foi aprovado.', en: 'Your request for {eq} on {when} was not approved.', es: 'Tu solicitud para {eq} el {when} no fue aprobada.' },
  },
  cancelled: {
    subject: { pt: 'Reserva cancelada: {eq}', en: 'Booking cancelled: {eq}', es: 'Reserva cancelada: {eq}' },
    body: { pt: 'Sua reserva de {eq} em {when} foi cancelada.', en: 'Your booking of {eq} on {when} was cancelled.', es: 'Tu reserva de {eq} el {when} fue cancelada.' },
  },
  staff: {
    subject: { pt: 'Novo pedido de reserva: {eq}', en: 'New booking request: {eq}', es: 'Nueva solicitud de reserva: {eq}' },
    body: { pt: '{name} ({inst}) pediu {eq} em {when}. Abra o aplicativo para aprovar ou recusar.', en: '{name} ({inst}) requested {eq} on {when}. Open the app to approve or reject.', es: '{name} ({inst}) solicitó {eq} el {when}. Abre la aplicación para aprobar o rechazar.' },
    cta: { pt: 'Abrir pedidos', en: 'Open requests', es: 'Abrir solicitudes' },
  },
};
const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : vars[k]));

/**
 * kind: verify | received | confirmed | rejected | cancelled | staff
 * vars: { name, eq, when, inst, note }   link: URL (opcional)
 */
function render(kind, lang, vars, link) {
  const l = pick(lang); const def = T[kind];
  const v = Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, String(x == null ? '' : x)]));
  const subject = fill(def.subject[l], v);
  const text = fill(def.body[l], v) + (v.note ? `\n\n${v.note}` : '') + (link && def.cta ? `\n\n${def.cta[l]}: ${link}` : '');
  const ev = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, esc(x)]));
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1e293b">
<h2 style="margin:0 0 12px;font-size:18px">${esc(subject)}</h2>
<p style="line-height:1.5">${fill(def.body[l], ev)}</p>
${v.note ? `<p style="line-height:1.5;background:#f1f5f9;padding:10px 12px;border-radius:8px">${esc(v.note)}</p>` : ''}
${link && def.cta ? `<p><a href="${esc(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">${esc(def.cta[l])}</a></p><p style="font-size:12px;color:#64748b;word-break:break-all">${esc(link)}</p>` : ''}
<p style="font-size:12px;color:#94a3b8;margin-top:24px">TcheLab</p></div>`;
  return { subject, html, text };
}

module.exports = { render, esc, LANGS, pick };
