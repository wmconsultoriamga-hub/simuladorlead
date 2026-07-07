create table if not exists public.solar_leads (
  lead_id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  captured_at timestamptz,
  proposal_viewed_at timestamptz,
  consultant_clicked_at timestamptz,
  source text,
  name text,
  phone text,
  phone_digits text,
  zip text,
  city text,
  uf text,
  region text,
  region_label text,
  bill numeric,
  panels integer,
  panel_name text,
  inverter text,
  kwp numeric,
  generation_month numeric,
  cash_price numeric,
  bank_installment_60x numeric,
  bank_total_60_months numeric,
  card_installment_18x numeric,
  card_total_18x numeric,
  bill_total_60_months numeric,
  finance_total_60_months numeric,
  final_result_60_months numeric,
  first_installment_date text,
  page_url text,
  referrer text,
  user_agent text,
  raw_payload jsonb
);

create table if not exists public.solar_lead_events (
  id bigint generated always as identity primary key,
  lead_id text not null references public.solar_leads(lead_id) on delete cascade,
  event text not null,
  created_at timestamptz not null default now(),
  reported_at timestamptz,
  payload jsonb
);

create index if not exists solar_leads_updated_at_idx on public.solar_leads (updated_at desc);
create index if not exists solar_leads_phone_digits_idx on public.solar_leads (phone_digits);
create index if not exists solar_leads_consultant_clicked_at_idx on public.solar_leads (consultant_clicked_at desc);
create index if not exists solar_lead_events_lead_id_idx on public.solar_lead_events (lead_id);
