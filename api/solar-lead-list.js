const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRM_ACCESS_TOKEN = process.env.CRM_ACCESS_TOKEN || process.env.CRON_SECRET;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function authorizationToken(req) {
  const headerToken = String(req.headers.authorization || '').replace(/^bearer\s+/i, '').trim();
  return headerToken || String(req.query?.token || '').trim();
}

function sanitizeSearch(value) {
  return String(value || '')
    .trim()
    .replace(/[,%]/g, '')
    .slice(0, 80);
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
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
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return send(res, 500, { error: 'missing_supabase_env' });
  if (!CRM_ACCESS_TOKEN) return send(res, 500, { error: 'missing_crm_access_token' });
  if (authorizationToken(req) !== CRM_ACCESS_TOKEN) return send(res, 401, { error: 'unauthorized' });

  try {
    const limit = Math.min(Number(req.query?.limit || 100), 300);
    const search = sanitizeSearch(req.query?.search);
    const filters = [
      'select=lead_id,captured_at,proposal_viewed_at,consultant_clicked_at,name,phone,phone_digits,zip,city,uf,region_label,bill,panels,inverter,kwp,generation_month,cash_price,bank_installment_60x,final_result_60_months,source',
      'order=updated_at.desc',
      `limit=${limit}`
    ];

    if (search) {
      const encoded = encodeURIComponent(`%${search}%`);
      filters.push(`or=(name.ilike.${encoded},phone.ilike.${encoded},phone_digits.ilike.${encoded},city.ilike.${encoded},zip.ilike.${encoded})`);
    }

    const leads = await supabaseRequest(`solar_leads?${filters.join('&')}`, { method: 'GET' });
    return send(res, 200, { ok: true, count: leads.length, leads });
  } catch (error) {
    return send(res, 500, { error: 'solar_lead_list_failed', message: error.message });
  }
};
