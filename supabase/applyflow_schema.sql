create extension if not exists pgcrypto;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  role text not null,
  location text not null default '',
  source text not null,
  status text not null,
  applied_on date not null,
  link text not null default '',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists applications_user_id_idx on public.applications(user_id);
create index if not exists applications_updated_at_idx on public.applications(updated_at desc);

alter table public.applications enable row level security;

create policy "Users can read their own applications"
on public.applications
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own applications"
on public.applications
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own applications"
on public.applications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own applications"
on public.applications
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_applications_updated_at on public.applications;

create trigger set_applications_updated_at
before update on public.applications
for each row
execute function public.handle_updated_at();
