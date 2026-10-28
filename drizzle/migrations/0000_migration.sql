create table public.journal_records (
  id text not null,
  user_id uuid not null default auth.uid(),
  type text not null,
  local_date date not null,
  data jsonb not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
grant select, insert, update, delete on public.journal_records to authenticated;
grant all on public.journal_records to service_role;
alter table public.journal_records enable row level security;
create policy "own records select" on public.journal_records for select to authenticated using (auth.uid() = user_id);
create policy "own records insert" on public.journal_records for insert to authenticated with check (auth.uid() = user_id);
create policy "own records update" on public.journal_records for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own records delete" on public.journal_records for delete to authenticated using (auth.uid() = user_id);

create table public.purchases (
  id text not null,
  user_id uuid not null default auth.uid(),
  local_date date not null,
  data jsonb not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
grant select, insert, update, delete on public.purchases to authenticated;
grant all on public.purchases to service_role;
alter table public.purchases enable row level security;
create policy "own purchases select" on public.purchases for select to authenticated using (auth.uid() = user_id);
create policy "own purchases insert" on public.purchases for insert to authenticated with check (auth.uid() = user_id);
create policy "own purchases update" on public.purchases for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own purchases delete" on public.purchases for delete to authenticated using (auth.uid() = user_id);

create table public.journal_settings (
  user_id uuid primary key default auth.uid(),
  reminder jsonb,
  stock_adjust integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.journal_settings to authenticated;
grant all on public.journal_settings to service_role;
alter table public.journal_settings enable row level security;
create policy "own settings select" on public.journal_settings for select to authenticated using (auth.uid() = user_id);
create policy "own settings insert" on public.journal_settings for insert to authenticated with check (auth.uid() = user_id);
create policy "own settings update" on public.journal_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own settings delete" on public.journal_settings for delete to authenticated using (auth.uid() = user_id);

create policy "own photos select" on storage.objects for select to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos insert" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);