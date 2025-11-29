-- Enable public editing for documents
-- This policy allows anyone (anon or authenticated) to UPDATE documents that are marked as public

create policy "Public documents are editable by everyone"
on documents for update
using (is_public = true);

-- Verify the policy
select * from pg_policies where tablename = 'documents';
