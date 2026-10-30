-- Additive. Apply in the existing project's SQL editor/migration workflow.
create table if not exists public.momo_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  requests integer not null default 0,
  primary key (user_id, day)
);
alter table public.momo_usage enable row level security;
-- No direct client writes; authenticated function derives the caller itself.
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
