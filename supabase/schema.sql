-- Complete schema for Comfortable Breakfast Center
-- This file documents the intended database state.
-- The migration in supabase/migrations/ applies incremental changes to an existing DB.

-- ============================================================
-- products
--   - The menu displayed on the website.
--   - Public SELECT via RLS policy (visitors browse the menu).
--   - `is_available` controls whether an item can be ordered.
--   - One row per product: `name` is unique once normalised, so a repeated
--     seed cannot append duplicate rows and repeat a product's image on the
--     menu. Applied by the 20260928173000 migration.
-- ============================================================
create table if not exists public.products (
    id            bigint      primary key,
    name          text          not null,
    price         numeric(10,2) not null default 0,
    description   text,
    image_url     text,
    is_available  boolean       not null default true,
    created_at    timestamp     not null default now()
);

-- ============================================================
-- orders
--   - Created by the place_order() RPC function.
--   - `total_amount` is computed by summing all order_items.
-- ============================================================
create table if not exists public.orders (
    id            bigint      primary key,
    customer_name text,
    customer_email text,
    department    text,
    total_amount  numeric(10,2),
    created_at    timestamp     not null default now()
);

-- ============================================================
-- order_items
--   - Line items belonging to an order.
--   - `unit_price` is captured at order time (snapshot of product.price).
-- ============================================================
create table if not exists public.order_items (
    id          bigint      primary key,
    order_id    bigint      references public.orders(id),
    product_id  bigint      references public.products(id),
    quantity    integer     not null default 1,
    unit_price  numeric(10,2),
    created_at    timestamp     not null default now()
);

-- One row per product. Normalised so "corns" and " Corns " cannot both exist.
create unique index if not exists products_name_unique
    on public.products (lower(btrim(name)));

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "public can read products" on public.products
    for select using (true);

create policy "public can read orders" on public.orders
    for select using (true);

create policy "public can read order_items" on public.order_items
    for select using (true);

-- ============================================================
-- place_order RPC
--   - Called from the React app via supabase.rpc('place_order', {...})
--   - Parameters match the app's submitOrder() in src/main.jsx
--   - Returns the new order ID
-- ============================================================
create or replace function public.place_order(
    p_customer_name  text,
    p_customer_email text,
    p_department     text,
    p_items          jsonb
) returns bigint as $$
declare
    v_order_id    bigint;
    v_item        record;
    v_price       numeric(10,2);
    v_order_total numeric(10,2) := 0;
begin
    insert into public.orders (customer_name, customer_email, department, total_amount)
    values (p_customer_name, p_customer_email, p_department, 0)
    returning id into v_order_id;

    for v_item in
        select *
        from jsonb_to_recordset(p_items)
        as x(product_id text, quantity int)
    loop
        select price into v_price
        from public.products
        where id = v_item.product_id::bigint
          and is_available = true;

        if v_price is null then
            continue;
        end if;

        insert into public.order_items (order_id, product_id, quantity, unit_price)
        values (v_order_id, v_item.product_id::bigint, v_item.quantity, v_price);

        v_order_total := v_order_total + (v_price * v_item.quantity);
    end loop;

    update public.orders
    set total_amount = v_order_total
    where id = v_order_id;

    return v_order_id;
end;
$$ language plpgsql security definer;

grant execute on function public.place_order to anon;
