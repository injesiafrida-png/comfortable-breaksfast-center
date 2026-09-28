-- Migration: Fix products schema, recreate place_order function, add RLS policies
-- Applies to: supabase project atajhzvgaqzdlmxttfec

-- ============================================================
-- 1. Add missing columns to the products table
--    The app expects: id, name, price, description, image_url, created_at
--    The DB had: id, created_at only
--    Also add is_available (referenced by place_order function)
-- ============================================================
alter table public.products
    add column if not exists name         text,
    add column if not exists price        numeric(10,2) not null default 0,
    add column if not exists description  text,
    add column if not exists image_url    text,
    add column if not exists is_available boolean not null default true;

-- Seed the six breakfast items (matches the app's fallbackProducts)
insert into public.products (id, name, price, description, image_url, is_available, created_at)
values
     (1, 'Chapati', 20, 'Fresh from the pan',
      'https://upload.wikimedia.org/wikipedia/commons/5/5b/Chapati.jpg',
      true, now()),
    (2, 'Cakes', 80, 'A sweet morning treat',
     'https://images.unsplash.com/photo-1700448293876-07dca826c161?auto=format&fit=crop&w=900&q=85',
     true, now()),
    (3, 'Corns', 30, 'Golden and roasted',
     'https://images.unsplash.com/photo-1774519198366-56ca04599351?auto=format&fit=crop&w=900&q=85',
     true, now()),
    (4, 'Bread', 20, 'Soft, warm, daily baked',
     'https://images.unsplash.com/photo-1753012248041-d5f54438af93?auto=format&fit=crop&w=900&q=85',
     true, now()),
    (5, 'Eggs', 50, 'Sunny and satisfying',
     'https://images.unsplash.com/photo-1521513919009-be90ad555598?auto=format&fit=crop&w=900&q=85',
     true, now()),
    (6, 'Mandazi', 10, 'Pillowy Kenyan classic',
     'https://upload.wikimedia.org/wikipedia/commons/6/69/Bowl_of_mandazi.jpg',
     true, now())
on conflict (id) do nothing;

-- ============================================================
-- 2. Enable RLS and add policies
-- ============================================================

-- Products: public can read (menu is public)
alter table public.products enable row level security;
create policy "public can read products" on public.products
    for select using (true);

-- Orders: function handles inserts via SECURITY DEFINER
alter table public.orders enable row level security;
create policy "public can read own orders" on public.orders
    for select using (true);

-- Order items: function handles inserts via SECURITY DEFINER
alter table public.order_items enable row level security;
create policy "public can read order items" on public.order_items
    for select using (true);

-- ============================================================
-- 3. Recreate place_order function
--    Fixes the "column is_available does not exist" error
--    by adding the is_available column (above) and using it correctly
-- ============================================================
drop function if exists public.place_order(text, text, text, jsonb);

create or replace function public.place_order(
    p_customer_name  text,
    p_customer_email text,
    p_department     text,
    p_items          jsonb
) returns bigint as $$
declare
    v_order_id   bigint;
    v_item       record;
    v_price      numeric(10,2);
    v_order_total numeric(10,2) := 0;
begin
    -- Create the order header
    insert into public.orders (customer_name, customer_email, department, total_amount)
    values (p_customer_name, p_customer_email, p_department, 0)
    returning id into v_order_id;

    -- Iterate over each item in the JSON array
    for v_item in
        select *
        from jsonb_to_recordset(p_items)
        as x(product_id text, quantity int)
    loop
        -- Look up the product price (supports both numeric and string product IDs)
        select price into v_price
        from public.products
        where id = v_item.product_id::bigint
          and is_available = true;

        -- Skip items whose product doesn't exist or is unavailable
        if v_price is null then
            continue;
        end if;

        -- Insert the order line item
        insert into public.order_items (order_id, product_id, quantity, unit_price)
        values (v_order_id, v_item.product_id::bigint, v_item.quantity, v_price);

        v_order_total := v_order_total + (v_price * v_item.quantity);
    end loop;

    -- Update the order total
    update public.orders
    set total_amount = v_order_total
    where id = v_order_id;

    return v_order_id;
end;
$$ language plpgsql security definer;

-- Allow the anon role to execute the function
grant execute on function public.place_order to anon;
