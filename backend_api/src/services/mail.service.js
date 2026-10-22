'use strict';

/**
 * Envio de e-mail.
 *   MAIL_TRANSPORT = resend | file | none   (padrão: "resend" se houver RESEND_API_KEY, senão "none")
 *   resend → API REST da Resend (https://resend.com/docs/api-reference/emails/send-email), sem dependência extra
 *   file   → grava cada e-mail como JSON em storage/outbox (desenvolvimento e testes)
 *   none   → não envia; quem chama usa `enabled()` para escolher um fluxo sem e-mail
 * Nunca lança: falha de e-mail não pode derrubar a reserva.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const storage = require('../config/storage.config');

const transport = () => process.env.MAIL_TRANSPORT || (process.env.RESEND_API_KEY ? 'resend' : 'none');
const enabled = () => transport() !== 'none';
const from = () => process.env.MAIL_FROM || 'TcheLab <onboarding@resend.dev>';

/** URL pública do site (links de e-mail e QR). Sem barra final. */
function baseUrl(req) {
  const env = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  if (req) return `${req.protocol}://${req.get('host')}`;
  return '';
}

async function send({ to, subject, html, text }) {
  const t = transport();
  if (!to || t === 'none') return { sent: false, transport: t };
  try {
    if (t === 'file') {
      fs.mkdirSync(storage.outbox, { recursive: true });
      const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`;
      fs.writeFileSync(path.join(storage.outbox, name), JSON.stringify({ to, subject, html, text, from: from() }, null, 2));
      return { sent: true, transport: t };
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from(), to: [to], subject, html, text }),
        signal: ctl.signal,
      });
      if (!r.ok) {
        let msg = ''; try { msg = (await r.json()).message || ''; } catch { /* sem corpo */ }
        console.error(`[mail] Resend recusou (${r.status}) ${msg}`);
        return { sent: false, transport: t, status: r.status };
      }
      return { sent: true, transport: t };
    } finally { clearTimeout(timer); }
  } catch (err) {
    console.error('[mail] falha no envio:', err.name === 'AbortError' ? 'tempo esgotado' : err.message);
    return { sent: false, transport: t };
  }
}

module.exports = { send, enabled, baseUrl, transport };
