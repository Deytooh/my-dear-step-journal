create table if not exists public.momo_usage (
  user_id uuid not null,
  day date not null default current_date,
  requests integer not null default 0,
  primary key (user_id, day)
);
grant all on public.momo_usage to service_role;
alter table public.momo_usage enable row level security;

create or replace function public.reserve_momo_request() returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then return false; end if;
  insert into public.momo_usage(user_id, day, requests) values(auth.uid(), current_date, 1)
  on conflict(user_id, day) do update set requests = momo_usage.requests + 1
  where momo_usage.requests < 20 returning requests into n;
  return n is not null;
end;
$$;
revoke all on function public.reserve_momo_request() from public, anon;
grant execute on function public.reserve_momo_request() to authenticated;

create table if not exists public.momo_daily_questions (
  user_id uuid not null,
  local_day date not null,
  locale text not null check (locale in ('ko','en','fr')),
  proposal jsonb,
  primary key (user_id, local_day)
);
grant all on public.momo_daily_questions to service_role;
alter table public.momo_daily_questions enable row level security;

create or replace function public.reserve_context_question(p_timezone text, p_locale text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date; inserted integer; row_data public.momo_daily_questions%rowtype;
begin
  if auth.uid() is null or p_locale not in ('ko','en','fr') then return null; end if;
  if not exists(select 1 from pg_timezone_names where name = p_timezone) then return null; end if;
  d := timezone(p_timezone, now())::date;
  delete from public.momo_daily_questions where user_id=auth.uid() and local_day < d-35;
  insert into public.momo_daily_questions(user_id,local_day,locale) values(auth.uid(),d,p_locale)
    on conflict do nothing;
  get diagnostics inserted = row_count;
  select * into row_data from public.momo_daily_questions where user_id=auth.uid() and local_day=d;
  return jsonb_build_object('claimed', inserted=1,'day',d,'locale',row_data.locale,'proposal',row_data.proposal);
end; $$;

create or replace function public.finish_context_question(p_day date, p_locale text, p_proposal jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null or length(p_proposal::text)>1000 then return false; end if;
  update public.momo_daily_questions set proposal=p_proposal
    where user_id=auth.uid() and local_day=p_day and locale=p_locale and proposal is null;
  get diagnostics n = row_count;
  return n=1;
end; $$;
revoke all on function public.reserve_context_question(text,text) from public,anon;
revoke all on function public.finish_context_question(date,text,jsonb) from public,anon;
grant execute on function public.reserve_context_question(text,text) to authenticated;
grant execute on function public.finish_context_question(date,text,jsonb) to authenticated;