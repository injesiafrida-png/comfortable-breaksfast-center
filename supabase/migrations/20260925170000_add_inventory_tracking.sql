-- Migration: Add inventory tracking to products and update place_order RPC with stock validation
-- Applies to: supabase project atajhzvgaqzdlmxttfec

-- ============================================================
-- 1. Add stock column to products table (idempotent)
-- ============================================================
alter table public.products
    add column if not exists stock integer not null default 0;

-- ============================================================
-- 2. Initialize opening stock to 60 for the six core products
--    Truly one-time: uses a migration tracking table to prevent
--    re-initialization even if stock reaches 0 (legitimate out-of-stock)
-- ============================================================
create table if not exists public._migration_state (
    migration_name text primary key,
    applied_at timestamp with time zone default now()
);

do $$
begin
    if not exists (
        select 1 from public._migration_state
        where migration_name = '20260925170000_add_inventory_tracking'
    ) then
        update public.products
        set stock = 60
        where id in (1, 2, 3, 4, 5, 6);

        insert into public._migration_state (migration_name)
        values ('20260925170000_add_inventory_tracking');
    end if;
end $$;

-- ============================================================
-- 3. Recreate place_order RPC with stock checking and row locking
--    - Validates stock for ALL items before creating order
--    - Uses SELECT ... FOR UPDATE to prevent concurrent overselling
--    - Rejects entire order if any item has insufficient stock
--    - Decrements stock atomically after successful order creation
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
    v_stock       integer;
    v_order_total numeric(10,2) := 0;
begin
    -- Phase 1: Validate stock for ALL items with row locking
    -- SELECT ... FOR UPDATE locks the product rows until transaction ends
    -- Prevents concurrent orders from overselling the same stock
    for v_item in
        select *
        from jsonb_to_recordset(p_items)
        as x(product_id text, quantity int)
    loop
        select price, stock into v_price, v_stock
        from public.products
        where id = v_item.product_id::bigint
          and is_available = true
        for update;  -- Row-level lock held until transaction commits/rolls back

        if v_price is null then
            raise exception 'Product % not found or unavailable', v_item.product_id;
        end if;

        if v_stock < v_item.quantity then
            raise exception 'Insufficient stock for product %: requested %, available %', v_item.product_id, v_item.quantity, v_stock;
        end if;
    end loop;

    -- Phase 2: All stock validated - create order header
    insert into public.orders (customer_name, customer_email, department, total_amount)
    values (p_customer_name, p_customer_email, p_department, 0)
    returning id into v_order_id;

    -- Phase 3: Insert order items and decrement stock
    -- Product rows remain locked from Phase 1, so stock decrement is safe
    for v_item in
        select *
        from jsonb_to_recordset(p_items)
        as x(product_id text, quantity int)
    loop
        select price into v_price
        from public.products
        where id = v_item.product_id::bigint
          and is_available = true;

        -- Insert order line item
        insert into public.order_items (order_id, product_id, quantity, unit_price)
        values (v_order_id, v_item.product_id::bigint, v_item.quantity, v_price);

        -- Decrement stock (row still locked from Phase 1)
        update public.products
        set stock = stock - v_item.quantity
        where id = v_item.product_id::bigint;

        v_order_total := v_order_total + (v_price * v_item.quantity);
    end loop;

    -- Update order total
    update public.orders
    set total_amount = v_order_total
    where id = v_order_id;

    return v_order_id;
end;
$$ language plpgsql security definer;

grant execute on function public.place_order to anon;