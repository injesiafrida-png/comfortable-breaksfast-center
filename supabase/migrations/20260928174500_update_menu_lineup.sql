-- Migration: Update the menu lineup
-- Applies to: supabase project atajhzvgaqzdlmxttfec
-- Runs after 20260928173000_dedupe_products_and_enforce_unique_name.sql
--
-- Removes three products that are no longer offered, adds three that are, and
-- keeps the menu aligned with the app's own fallbackProducts list in
-- src/App.jsx so the live menu and the offline fallback stay identical.
--
-- The final lineup is nine products:
--   Chapati, Cakes, Corns, Bread, Eggs, Mandazi, Pizza, Biscuits, Sausages

-- ============================================================
-- 1. Remove products that are no longer on the menu
-- ============================================================
-- "Big Eggs" was a stray duplicate-priced copy of "Eggs" and is the item being
-- dropped; the standard "Eggs" product at KSh 50 stays on the menu.
--
-- products.id has no sequence or default, so ids are not reused. This is safe
-- because order_items does not exist in this database, so no order rows
-- reference these product ids.

delete from public.products
 where lower(btrim(name)) in ('big eggs', 'cooking oil', 'sugar');

-- ============================================================
-- 2. Point the replaced products at the new photographs
-- ============================================================
-- These four photos now live in the repository at
-- public/images/products/ instead of being hotlinked from Wikimedia, which
-- rate-limits visitors with HTTP 429. The paths must match `base` in
-- vite.config.js. Attribution for each is recorded in
-- public/images/CREDITS.md, as the CC BY-SA licences require.
--
-- These run after the dedupe migration, so exactly one row per product exists
-- and no image is written onto a row that is about to be deleted.

update public.products
   set image_url = '/comfortable-breaksfast-center/images/products/chapati.jpg'
 where lower(btrim(name)) = 'chapati';

update public.products
   set image_url = '/comfortable-breaksfast-center/images/products/mandazi.jpg'
 where lower(btrim(name)) = 'mandazi';

update public.products
   set image_url = '/comfortable-breaksfast-center/images/products/corns.jpg'
 where lower(btrim(name)) = 'corns';

update public.products
   set image_url = '/comfortable-breaksfast-center/images/products/bread.jpg'
 where lower(btrim(name)) = 'bread';

-- ============================================================
-- 3. Add the new products
-- ============================================================
-- Ids are derived from the current maximum instead of hardcoded so a re-run
-- cannot collide with a row added by hand. The conflict target is the unique
-- index on lower(btrim(name)) created by the dedupe migration, which makes
-- this statement idempotent: re-applying it updates the price, description
-- and image rather than inserting a second copy of the product.
--
-- stock is set to 60 to match the opening stock the inventory migration gave
-- the original products. The default is 0, and place_order() rejects any item
-- with insufficient stock, so a new product left at 0 would be visible on the
-- menu but impossible to order.
--
-- display_order is 7, 8 and 9 so these three sort after the six core products.
-- The app reads the menu ordered by display_order and shows only the first six
-- until "See more" is pressed, so these values decide what the button reveals.
-- The photos are stored in the repository rather than hotlinked from Wikimedia,
-- which rate-limits visitors with HTTP 429. See public/images/CREDITS.md.

insert into public.products (id, name, price, description, image_url, is_available, stock, display_order, created_at)
select
    (select coalesce(max(id), 0) from public.products) + v.ord,
    v.name,
    v.price,
    v.description,
    v.image_url,
    true,
    60,
    6 + v.ord,
    now()
from (values
    (1, 'Pizza',    300, 'Warm, cheesy, and satisfying', '/comfortable-breaksfast-center/images/products/pizza.jpg'),
    (2, 'Sausages', 150, 'Savory breakfast links',        '/comfortable-breaksfast-center/images/products/sausages.jpg'),
    (3, 'Biscuits',  60, 'Crisp and buttery',             '/comfortable-breaksfast-center/images/products/biscuits.jpg')
) as v(ord, name, price, description, image_url)
on conflict (lower(btrim(name))) do update
   set price        = excluded.price,
       description  = excluded.description,
       image_url    = excluded.image_url,
       is_available = true;

-- ============================================================
-- 4. Pin the display order
-- ============================================================
-- The surviving rows inherited display_order values from the duplicate batches
-- that were just removed, and two products shared 0. Those happened to sort
-- acceptably, but the menu order now drives which products "See more" reveals,
-- so the values are set explicitly instead of being left to chance.
--
-- 1-6 are the six products shown before the button is pressed. 7-9 were set by
-- the insert above. The app breaks display_order ties on id.

update public.products set display_order = 1 where lower(btrim(name)) = 'chapati';
update public.products set display_order = 2 where lower(btrim(name)) = 'cakes';
update public.products set display_order = 3 where lower(btrim(name)) = 'corns';
update public.products set display_order = 4 where lower(btrim(name)) = 'bread';
update public.products set display_order = 5 where lower(btrim(name)) = 'eggs';
update public.products set display_order = 6 where lower(btrim(name)) = 'mandazi';
update public.products set display_order = 7 where lower(btrim(name)) = 'pizza';
update public.products set display_order = 8 where lower(btrim(name)) = 'sausages';
update public.products set display_order = 9 where lower(btrim(name)) = 'biscuits';

-- ============================================================
-- 5. Confirm the lineup
-- ============================================================
-- Raises a notice listing anything still without an image, so a mistake here is
-- visible immediately rather than as a blank tile on the site. It also checks
-- display_order, because a product left unordered would be dropped into the
-- first six by the app's sort and could push a real product behind "See more".

do $$
declare
    v_rows       integer;
    v_missing    text;
    v_duplicate  text;
    v_unordered  text;
    v_shown      text;
begin
    select count(*) into v_rows from public.products;
    if v_rows <> 9 then
        raise notice 'Expected 9 products after the lineup change, found %', v_rows;
    end if;

    select string_agg(name, ', ') into v_missing
      from public.products
     where image_url is null or btrim(image_url) = '';
    if v_missing is not null then
        raise notice 'Products without an image: %', v_missing;
    end if;

    select string_agg(lower(btrim(name)), ', ') into v_duplicate
      from (
          select lower(btrim(name)) as lower_btrim_name
            from public.products
           group by lower(btrim(name))
          having count(*) > 1
      ) duplicates;
    if v_duplicate is not null then
        raise notice 'Duplicate product names: %', v_duplicate;
    end if;

    select string_agg(name, ', ') into v_unordered
      from public.products
     where display_order is null or display_order < 1 or display_order > 9;
    if v_unordered is not null then
        raise notice 'Products with a missing or out of range display_order: %', v_unordered;
    end if;

    -- These three must sort last, otherwise "See more" reveals the wrong items.
    select string_agg(name, ', ' order by display_order) into v_shown
      from public.products
     where display_order > 6;
    if v_shown is distinct from 'Pizza, Sausages, Biscuits' then
        raise notice 'See more should reveal Pizza, Sausages, Biscuits but would reveal: %', v_shown;
    end if;
end $$;
