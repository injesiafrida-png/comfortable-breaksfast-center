-- Migration: Deduplicate products, restore one correct image per product, enforce unique names
-- Applies to: supabase project atajhzvgaqzdlmxttfec
--
-- ============================================================
-- Root cause
-- ============================================================
-- public.products has no uniqueness constraint on `name`, so nothing stopped
-- the seed from running more than once. The table ended up with 19 rows for 9
-- real products:
--
--   * ids 8-13 and 14-19 are two byte-identical batches (identical created_at,
--     price, description, display_order and stock), i.e. the seed was applied
--     twice.
--   * 17 of the 19 rows had image_url = NULL. The menu renders one card per
--     row and every NULL row falls back to the same placeholder image, so the
--     same picture appeared again and again.
--   * The duplicate rows also carried category labels as descriptions
--     ("Sweet treats", "Fresh baked") instead of real product copy.
--
-- The fix is three parts: give every product a real image, keep exactly one
-- row per product, and add the unique index that was missing so a repeat seed
-- can never recreate the duplicates.
--
-- Note: order_items / orders do not exist in this database, so no order rows
-- reference these product ids and the deletes below cannot orphan an order.

-- ============================================================
-- 1. Backfill the correct image for every product
-- ============================================================
-- Runs BEFORE the dedupe so whichever row survives is guaranteed to hold a
-- real image. Every URL below was verified to return HTTP 200 with an image
-- content type. The Wikimedia entries use Special:FilePath, which resolves to
-- the canonical upload.wikimedia.org file and stays valid if the file is
-- re-uploaded.

update public.products
   set image_url = 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=900&q=85'
 where lower(btrim(name)) = 'corns'
   and (image_url is null or btrim(image_url) = '');

update public.products
   set image_url = 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85'
 where lower(btrim(name)) = 'bread'
   and (image_url is null or btrim(image_url) = '');

update public.products
   set image_url = 'https://images.unsplash.com/photo-1565636290659-d5b15f864f64?auto=format&fit=crop&w=900&q=85'
 where lower(btrim(name)) = 'eggs'
   and (image_url is null or btrim(image_url) = '');

update public.products
   set image_url = 'https://upload.wikimedia.org/wikipedia/commons/6/69/Bowl_of_mandazi.jpg'
 where lower(btrim(name)) = 'mandazi'
   and (image_url is null or btrim(image_url) = '');

-- Big Eggs, Cooking Oil and Sugar are not backfilled here because the later
-- 20260928174500_update_menu_lineup.sql migration removes all three from the
-- menu, so there is no point writing an image for a row that is about to go.

-- Guard: any surviving NULL image would still render as the shared placeholder.
do $$
declare
    v_missing text;
begin
    select string_agg(name, ', ')
      into v_missing
      from public.products
     where image_url is null or btrim(image_url) = '';

    if v_missing is not null then
        raise notice 'Products still without an image (will show placeholder): %', v_missing;
    end if;
end $$;

-- ============================================================
-- 2. Keep exactly one row per product
-- ============================================================
-- Bread exists twice with different prices: id 7 at 100 ("Fresh bread") and
-- ids 11/17 at 20 ("Fresh baked"). The app's canonical menu lists Bread at 20,
-- so drop the row that contradicts the canonical price. Nothing else in the
-- table disagrees with the canonical price, so this currently removes id 7.

delete from public.products
 where id in (
       select p.id
         from public.products p
        where (lower(btrim(p.name)) = 'chapati' and p.price <> 20)
           or (lower(btrim(p.name)) = 'cakes'   and p.price <> 80)
           or (lower(btrim(p.name)) = 'corns'   and p.price <> 30)
           or (lower(btrim(p.name)) = 'bread'   and p.price <> 20)
           or (lower(btrim(p.name)) = 'eggs'    and p.price <> 50)
           or (lower(btrim(p.name)) = 'mandazi' and p.price <> 10)
 );

-- Now that exactly one meaningful row remains per name, collapse the
-- remaining exact duplicates and keep the lowest id. Chapati (1) and Cakes (2)
-- survive because they are the lowest id for their name and already carry a
-- correct image; Bread settles on 11; Big Eggs 3, Cooking Oil 5, Sugar 6,
-- Corns 10, Eggs 12 and Mandazi 13. Nine rows remain in total.

delete from public.products p
 using public.products k
 where lower(btrim(k.name)) = lower(btrim(p.name))
   and k.id < p.id;

-- ============================================================
-- 3. Restore the canonical copy for products the bad batch overwrote
-- ============================================================
-- Only affects rows whose current description is a category label, so genuine
-- edits by the site owner are left alone.

update public.products
   set description = 'Golden and roasted', price = 30
 where lower(btrim(name)) = 'corns'
   and description in ('Fresh bread', 'Golden and roasted');

update public.products
   set description = 'Soft, warm, daily baked', price = 20
 where lower(btrim(name)) = 'bread'
   and description in ('Fresh baked', 'Soft, warm, daily baked');

update public.products
   set description = 'Sunny and satisfying', price = 50
 where lower(btrim(name)) = 'eggs'
   and description in ('Breakfast favourites', 'Sunny and satisfying');

update public.products
   set description = 'Pillowy Kenyan classic', price = 10
 where lower(btrim(name)) = 'mandazi'
   and description in ('Sweet treats', 'Pillowy Kenyan classic');

update public.products
   set description = 'A sweet morning treat', price = 80
 where lower(btrim(name)) = 'cakes'
   and description in ('Sweet treats', 'A sweet morning treat');

update public.products
   set description = 'Fresh from the pan', price = 20
 where lower(btrim(name)) = 'chapati'
   and description in ('Fresh baked', 'Fresh from the pan');

-- ============================================================
-- 4. Stop it happening again
-- ============================================================
-- This is the constraint the schema was missing. The old seed only guarded
-- `on conflict (id) do nothing`, which does nothing when a new id is inserted,
-- so a second run appended six more rows. A unique index on the normalised
-- name turns that repeat into a no-op failure instead of duplicate menu cards.
--
-- The index is unique on lower(btrim(name)) rather than raw name so "corns"
-- and " Corns " cannot both exist.

create unique index if not exists products_name_unique
    on public.products (lower(btrim(name)));
