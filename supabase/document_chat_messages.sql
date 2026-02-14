-- Run this in Supabase SQL editor
-- Creates persistent, document-scoped chat with realtime support and safe deletes.

create table if not exists public.document_chat_messages (
  id bigint generated always as identity primary key,
  document_id text not null references public.documents(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_email text not null,
  role text not null default 'user' check (role in ('user', 'ai', 'system')),
  message text not null check (char_length(trim(message)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_document_chat_messages_doc_created
  on public.document_chat_messages (document_id, created_at desc);

alter table public.document_chat_messages enable row level security;
alter table public.document_chat_messages replica identity full;

drop policy if exists "chat_select_access" on public.document_chat_messages;
create policy "chat_select_access"
on public.document_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.documents d
    where d.id = document_chat_messages.document_id
      and (
        d.user_id = auth.uid()
        or d.is_public = true
      )
  )
  or exists (
    select 1
    from public.document_permissions dp
    where dp.document_id = document_chat_messages.document_id
      and dp.user_email = coalesce(auth.jwt() ->> 'email', '')
  )
);

drop policy if exists "chat_insert_access" on public.document_chat_messages;
create policy "chat_insert_access"
on public.document_chat_messages
for insert
to authenticated
with check (
  user_id = auth.uid()
  and user_email = coalesce(auth.jwt() ->> 'email', '')
  and (
    exists (
      select 1
      from public.documents d
      where d.id = document_chat_messages.document_id
        and d.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.document_permissions dp
      where dp.document_id = document_chat_messages.document_id
        and dp.user_email = coalesce(auth.jwt() ->> 'email', '')
    )
  )
);

drop policy if exists "chat_delete_own_or_owner" on public.document_chat_messages;
create policy "chat_delete_own_or_owner"
on public.document_chat_messages
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.documents d
    where d.id = document_chat_messages.document_id
      and d.user_id = auth.uid()
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'document_chat_messages'
  ) then
    alter publication supabase_realtime add table public.document_chat_messages;
  end if;
end
$$;
