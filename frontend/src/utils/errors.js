/** Extrai { campo: mensagem } e a mensagem geral de um erro da API (422 → details). */
export function parseApiError(err, fallback = '') {
  const e = err?.response?.data?.error;
  const fields = {};
  (Array.isArray(e?.details) ? e.details : []).forEach((d) => {
    if (d?.field) fields[String(d.field).replace(/^preferences\./, '')] = d.message;
  });
  const first = Object.values(fields)[0];
  return { fields, message: first || e?.message || err?.message || fallback, code: e?.code, status: err?.response?.status };
}
