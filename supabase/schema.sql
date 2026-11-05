-- AgroApp: almacenamiento por usuario para parcelas, actividades, bitácora y ajustes.
-- Ejecuta este script en Supabase > SQL Editor.

create table if not exists public.app_records (
    user_id uuid not null references auth.users (id) on delete cascade,
    collection text not null check (collection in ('parcelas', 'activities', 'notes', 'settings')),
    record_id text not null,
    data jsonb not null check (jsonb_typeof(data) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, collection, record_id)
);

create index if not exists app_records_user_collection_idx
    on public.app_records (user_id, collection);

create or replace function public.update_app_records_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = pg_catalog.now();
    return new;
end;
$$;

drop trigger if exists app_records_updated_at on public.app_records;
create trigger app_records_updated_at
    before update on public.app_records
    for each row execute function public.update_app_records_updated_at();

alter table public.app_records enable row level security;

revoke all on public.app_records from public, anon, authenticated;
grant select, insert, update, delete on public.app_records to authenticated;

drop policy if exists "Users can read their own AgroApp records" on public.app_records;
create policy "Users can read their own AgroApp records"
    on public.app_records for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own AgroApp records" on public.app_records;
create policy "Users can create their own AgroApp records"
    on public.app_records for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own AgroApp records" on public.app_records;
create policy "Users can update their own AgroApp records"
    on public.app_records for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own AgroApp records" on public.app_records;
create policy "Users can delete their own AgroApp records"
    on public.app_records for delete to authenticated
    using ((select auth.uid()) = user_id);
