# Comfortable Breakfast Center

## Supabase setup

Copy `.env.example` to `.env.local` and add the public values from Supabase Dashboard → Settings → API:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Restart Vite after changing environment variables. The browser app reads only the existing `products` fields: `id`, `name`, `price`, `description`, `image_url`, and `created_at`. Do not put a service-role key in `.env.local`.

The `products` table must permit public `select` access, normally through a Supabase RLS policy, for visitors to see the menu.

## Commands

```bash
npm run dev
npm run lint
npm run build
```
