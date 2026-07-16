-- AI Vault. Buying Club: extend tool_deals + hide private terms from members (run sixth)

-- admin upserts deals by name
alter table tool_deals add constraint tool_deals_name_key unique (name);
alter table tool_deals add column category       text not null default 'Tools';
alter table tool_deals add column monthly_saving int  not null default 0;     -- USD/mo, feeds the savings counter
alter table tool_deals add column model          text;                        -- affiliate | member_discount | double | rev_share | service
alter table tool_deals add column conditional    boolean not null default true; -- discount tied to active membership
alter table tool_deals add column private_terms  text;                        -- Jay only: real affiliate %, rev share, contact

-- Members must NOT be able to read private_terms. Drop the direct table read
-- policy and expose only the public columns through a security-definer function.
drop policy if exists "members read deals" on tool_deals;

create or replace function get_deals()
returns table (
  id uuid, name text, description text, deal_note text, coupon text,
  url text, category text, monthly_saving int, conditional boolean, model text
) language sql stable security definer set search_path = public as $$
  select d.id, d.name, d.description, d.deal_note, d.coupon,
         d.url, d.category, d.monthly_saving, d.conditional, d.model
  from tool_deals d
  where d.active and has_vault_access(auth.uid())
  order by d.sort, d.monthly_saving desc;
$$;

-- total monthly savings available to a member (for the counter).
-- Public on purpose: join.html shows the aggregate to anonymous prospects as the
-- "pays for itself" proof. Deal details (coupons, terms) stay member-gated.
create or replace function get_deal_savings()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(monthly_saving), 0)::int
  from tool_deals where active;
$$;
