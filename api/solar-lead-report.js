const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_ALERT_BOT_TOKEN = process.env.TELEGRAM_ALERT_BOT_TOKEN;
const TELEGRAM_ALERT_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID;
const CRON_SECRET = process.env.CRON_SECRET;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function authorizationToken(req) {
  return String(req.headers.authorization || '').replace(/^bearer\s+/i, '').trim();
}

function money(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function defaultWindowStart(now = new Date()) {
  const saoPauloHour = Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hour12: false
  }).format(now));
  const hoursBack = saoPauloHour < 12 ? 16 : 8;
  return new Date(now.getTime() - hoursBack * 60 * 60 * 1000).toISOString();
}

async function supabaseRequest(path, options) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.hint || `Supabase error ${response.status}`);
  }
  return data;
}

async function sendTelegram(text) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_ALERT_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_ALERT_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram error ${response.status}`);
  }
  return data;
}

function buildReport(leads, sinceIso) {
  const period = new Date(sinceIso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  if (!leads.length) {
    return [
      '<b>WM Solar - Relatorio de cliques</b>',
      `Periodo desde: ${period}`,
      '',
      'Nenhum cliente clicou em falar com consultor neste periodo.'
    ].join('\n');
  }

  const lines = [
    '<b>WM Solar - Relatorio de cliques</b>',
    `Periodo desde: ${period}`,
    `Total: ${leads.length}`,
    ''
  ];

  leads.slice(0, 30).forEach((lead, index) => {
    const city = [lead.city, lead.uf].filter(Boolean).join('/');
    lines.push(
      `${index + 1}. <b>${lead.name || 'Sem nome'}</b>`,
      `Telefone: ${lead.phone || lead.phone_digits || '-'}`,
      `Cidade: ${city || '-'}`,
      `Conta: ${money(lead.bill)}`,
      `Sistema: ${lead.panels || '-'} placas | ${lead.inverter || '-'}`,
      `Proposta: ${money(lead.cash_price)}`,
      ''
    );
  });

  if (leads.length > 30) lines.push(`Mais ${leads.length - 30} leads ficaram no Supabase.`);
  return lines.join('\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (CRON_SECRET && authorizationToken(req) !== CRON_SECRET && req.query?.secret !== CRON_SECRET) {
    return send(res, 401, { error: 'unauthorized' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return send(res, 500, { error: 'missing_supabase_env' });
  if (!TELEGRAM_ALERT_BOT_TOKEN || !TELEGRAM_ALERT_CHAT_ID) return send(res, 500, { error: 'missing_telegram_env' });

  try {
    const since = req.query?.since || defaultWindowStart();
    const query = [
      'consultant_clicked_at=gte.' + encodeURIComponent(since),
      'select=lead_id,consultant_clicked_at,name,phone,phone_digits,city,uf,bill,panels,inverter,cash_price',
      'order=consultant_clicked_at.desc',
      'limit=100'
    ].join('&');
    const leads = await supabaseRequest(`solar_leads?${query}`, { method: 'GET' });
    const text = buildReport(leads, since);
    await sendTelegram(text);

    const ids = leads.map((lead) => lead.lead_id).filter(Boolean);
    if (ids.length) {
      await supabaseRequest(`solar_lead_events?event=eq.consultant_clicked&lead_id=in.(${ids.map(encodeURIComponent).join(',')})&reported_at=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ reported_at: new Date().toISOString() })
      });
    }

    return send(res, 200, { ok: true, count: leads.length });
  } catch (error) {
    return send(res, 500, { error: 'solar_report_failed', message: error.message });
  }
};
