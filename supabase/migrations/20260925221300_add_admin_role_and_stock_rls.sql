-- Migration: Add admin role for stock management only
-- Applies to: supabase project atajhzvgaqzdlmxttfec

-- ============================================================
-- 1. Add is_admin flag to auth.users
--    Used to control who can update product stock
-- ============================================================
alter table auth.users
    add column if not exists is_admin boolean not null default false;

-- ============================================================
-- 2. Set your existing Auth user as admin
-- ============================================================
update auth.users
set is_admin = true
where id = '152225e1-52f1-413a-86d5-73c7e127465d';

-- ============================================================
-- 3. RLS policy: allow only admins to UPDATE product stock
--    Public SELECT remains unrestricted (menu still works)
--    No INSERT or DELETE access granted
-- ============================================================
create policy "admins can update products stock"
on public.products
for update
using (
    (select is_admin from auth.users where id = auth.uid()) = true
);