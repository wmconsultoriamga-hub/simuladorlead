const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.end(JSON.stringify(body));
}

function getPayload(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value) {
  const text = String(value || '').trim();
  return text || null;
}

function eventTimestampColumn(event) {
  if (event === 'lead_captured') return 'captured_at';
  if (event === 'proposal_viewed') return 'proposal_viewed_at';
  if (event === 'consultant_clicked') return 'consultant_clicked_at';
  return null;
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

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, { error: 'missing_supabase_env' });
  }

  try {
    const payload = getPayload(req);
    const event = textOrNull(payload.event);
    const leadId = textOrNull(payload.leadId);
    if (!event || !leadId) return send(res, 400, { error: 'missing_event_or_lead_id' });

    const lead = payload.lead || {};
    const simulation = payload.simulation || {};
    const page = payload.page || {};
    const now = new Date().toISOString();
    const timestampColumn = eventTimestampColumn(event);
    const leadRow = {
      lead_id: leadId,
      updated_at: now,
      source: textOrNull(payload.source) || 'landing_wm_simulador_solar',
      name: textOrNull(lead.name),
      phone: textOrNull(lead.phone),
      phone_digits: textOrNull(lead.phoneDigits),
      zip: textOrNull(lead.zip),
      city: textOrNull(lead.city),
      uf: textOrNull(lead.uf),
      region: textOrNull(lead.region),
      region_label: textOrNull(lead.regionLabel),
      bill: numberOrNull(simulation.bill),
      panels: numberOrNull(simulation.panels),
      panel_name: textOrNull(simulation.panelName),
      inverter: textOrNull(simulation.inverter),
      kwp: numberOrNull(simulation.kwp),
      generation_month: numberOrNull(simulation.generationMonth),
      cash_price: numberOrNull(simulation.cashPrice),
      bank_installment_60x: numberOrNull(simulation.bankInstallment60x),
      bank_total_60_months: numberOrNull(simulation.bankTotal60Months),
      card_installment_18x: numberOrNull(simulation.cardInstallment18x),
      card_total_18x: numberOrNull(simulation.cardTotal18x),
      bill_total_60_months: numberOrNull(simulation.billTotal60Months),
      finance_total_60_months: numberOrNull(simulation.financeTotal60Months),
      final_result_60_months: numberOrNull(simulation.finalResult60Months),
      first_installment_date: textOrNull(simulation.firstInstallmentDate),
      page_url: textOrNull(page.url),
      referrer: textOrNull(page.referrer),
      user_agent: textOrNull(page.userAgent),
      raw_payload: payload
    };
    if (timestampColumn) leadRow[timestampColumn] = payload.timestamp || now;

    const [savedLead] = await supabaseRequest('solar_leads?on_conflict=lead_id', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(leadRow)
    });

    await supabaseRequest('solar_lead_events', {
      method: 'POST',
      body: JSON.stringify({
        lead_id: leadId,
        event,
        created_at: payload.timestamp || now,
        payload
      })
    });

    return send(res, 200, { ok: true, leadId: savedLead?.lead_id || leadId });
  } catch (error) {
    return send(res, 500, { error: 'solar_lead_failed', message: error.message });
  }
};
