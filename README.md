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

## Product photography

Product photos live in `public/images/products/` and are served by Vite as
static assets, so the site never depends on an external image host at runtime.

Four of the current photos (chapati, mandazi, corns, bread) were taken from
Wikimedia Commons and are committed here rather than hotlinked, because
`upload.wikimedia.org` returns HTTP 429 to ordinary visitors and would leave
blank cards. All four are CC BY-SA, so they carry an attribution requirement —
see `public/images/CREDITS.md`, which the footer links to. The remaining five
use Unsplash stock photography, which needs no attribution.

### Generating photos with an AI image API

If you want to replace or extend the set with generated imagery, this script
calls an image provider and writes the results into the same directory.

```bash
# See the exact prompts without calling anything
npm run generate:images -- --dry-run

# The four products whose photo is being replaced: chapati, mandazi, corns, bread
npm run generate:images

# Every product, or specific ones by slug
npm run generate:images -- --all
npm run generate:images -- chapati corn

# Regenerate even when a file already exists
npm run generate:images -- --force
```

The provider is selected with environment variables, which are deliberately
**not** `VITE_` prefixed so the keys can never reach the browser bundle. See
`.env.example` for the exact names. Set the key in your shell before running:

```powershell
$env:OPENAI_API_KEY = "sk-..."
npm run generate:images
```

The script has no npm dependencies. It retries `429` and `5xx` responses with
exponential backoff, refuses to save anything that is not a real JPEG, PNG or
WebP of at least 5 KB, and skips products that already have a file unless
`--force` is passed. Per-product results are recorded in
`public/images/products/manifest.json`.

The base path is read from `vite.config.js`, so generated URLs always match the
deploy prefix. After generating, copy the URLs from the manifest into
`fallbackProducts` in `src/App.jsx` and into the `image_url` values in
`supabase/migrations/`.
