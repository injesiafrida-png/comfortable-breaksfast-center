// Generates premium product photos with an AI image API and writes them into
// public/images/products/ so Vite serves them as static assets.
//
// Usage:
//   node scripts/generate-product-images.mjs              # the 4 products being changed
//   node scripts/generate-product-images.mjs --all        # every product
//   node scripts/generate-product-images.mjs --force      # regenerate even if a file exists
//   node scripts/generate-product-images.mjs --dry-run    # list prompts, call nothing
//   node scripts/generate-product-images.mjs chapati corn # specific products
//
// No npm dependencies: uses the global fetch in Node 18+.

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(here, '..')
const outputDir = join(projectRoot, 'public', 'images', 'products')
const manifestPath = join(outputDir, 'manifest.json')

// Cards render at aspect-ratio 1.42 / 1 with object-fit: cover, so a 3:2
// landscape source is the least wasteful framing. 1536x1024 is exactly 3:2.
const SIZE = '1536x1024'

// Shared styling so the set looks like one commission rather than nine
// unrelated photos: same light, same lens, same surface, same colour grade.
const STYLE = [
  'professional commercial food photography',
  'shot on a 50mm lens at f/2.8, shallow depth of field',
  'soft natural window light from the left',
  'warm, appetising colour grade, gentle contrast',
  'styled on a matte ceramic plate on a pale oak table',
  'subtle scattered ingredients, uncluttered composition',
  'hero shot, product filling about 80% of the frame',
  'ultra realistic, high detail, no text, no watermark, no people, no hands',
].join(', ')

const products = [
  {
    slug: 'chapati',
    name: 'Chapati',
    description:
      'A small stack of freshly cooked chapati, thin wheat flatbread with lightly charred blistered spots, soft and folded at the edges',
  },
  {
    slug: 'mandazi',
    name: 'Mandazi',
    description:
      'Golden-brown East African mandazi, plump and sugar dusted, with crisp edges and a soft centre',
  },
  {
    slug: 'corns',
    name: 'Corns',
    description:
      'Roasted corn on the cob, glossy golden kernels with light char marks, cut into rounds and lightly buttered',
  },
  {
    slug: 'bread',
    name: 'Bread',
    description:
      'A rustic artisan bread loaf, deeply scored crust, one thick slice cut to show an open crumb',
  },
  {
    slug: 'cakes',
    name: 'Cakes',
    description:
      'A moist slice of sponge cake with crumbly topping and a soft icing drizzle',
  },
  {
    slug: 'eggs',
    name: 'Eggs',
    description:
      'Soft boiled eggs halved to show the set yolk, arranged on a breakfast plate',
  },
  {
    slug: 'pizza',
    name: 'Pizza',
    description:
      'A hot slice of thin crust pizza with bubbling mozzarella, crisp blistered crust and fresh basil',
  },
  {
    slug: 'sausages',
    name: 'Sausages',
    description:
      'Grilled breakfast sausages with a glossy caramelised surface, scored and split',
  },
  {
    slug: 'biscuits',
    name: 'Biscuits',
    description:
      'A short stack of golden baked biscuits, crisp with a buttery crumb',
  },
]

// The four products whose photo is being replaced. The other five already have
// verified stock photography, so regenerating them is opt-in via --all.
const CHANGED = ['chapati', 'mandazi', 'corns', 'bread']

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const named = args.filter(a => !a.startsWith('--'))
const dryRun = flags.has('--dry-run')
const force = flags.has('--force')
const useAll = flags.has('--all')

const selected = useAll
  ? products
  : named.length
    ? products.filter(p => named.includes(p.slug))
    : products.filter(p => CHANGED.includes(p.slug))

if (!selected.length) {
  console.error(`No product matched. Known slugs: ${products.map(p => p.slug).join(', ')}`)
  process.exit(1)
}

// The site is deployed under a base path, so URLs stored in the database need
// that prefix. Read it from vite.config.js so the two cannot drift apart.
async function siteBase() {
  try {
    const source = await readFile(join(projectRoot, 'vite.config.js'), 'utf8')
    return source.match(/base:\s*['"]([^'"]+)['"]/)?.[1] ?? '/'
  } catch {
    return '/'
  }
}

const buildPrompt = product => `${product.description}. ${STYLE}.`

// Sniffs the real container so a provider that returns PNG is not saved with a
// lying .jpg extension.
function extensionFor(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return { ext: 'png', type: 'image/png' }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return { ext: 'webp', type: 'image/webp' }
  return null
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Retries 429 and 5xx with exponential backoff, because bulk image jobs
// routinely hit provider rate limits.
async function withRetry(label, attemptFn, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await attemptFn()
    } catch (err) {
      const status = err.status
      const retryable = status === 429 || (status >= 500 && status < 600)
      if (!retryable || attempt === attempts) throw err
      const waitMs = 2000 * 2 ** (attempt - 1)
      console.log(`  ${label}: ${err.message}. retrying in ${waitMs / 1000}s (${attempt}/${attempts - 1})`)
      await sleep(waitMs)
    }
  }
}

async function callOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  const model = process.env.IMAGE_MODEL || 'gpt-image-1'
  // IMAGE_ENDPOINT allows an OpenAI-compatible server (a proxy, or a local
  // Ollama / LM Studio instance) to stand in for api.openai.com.
  const endpoint = process.env.IMAGE_ENDPOINT || 'https://api.openai.com/v1/images/generations'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, prompt, size: SIZE, n: 1, quality: 'high' }),
  })
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} ${await response.text()}`), { status: response.status })
  const payload = await response.json()
  const item = payload.data?.[0]
  if (!item) throw new Error('response contained no image data')
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64')
  const download = await fetch(item.url)
  if (!download.ok) throw Object.assign(new Error(`image download HTTP ${download.status}`), { status: download.status })
  return Buffer.from(await download.arrayBuffer())
}

async function callStability(prompt) {
  const key = process.env.STABILITY_API_KEY
  if (!key) throw new Error('STABILITY_API_KEY is not set')
  const form = new FormData()
  form.append('prompt', prompt)
  form.append('output_format', 'jpeg')
  const response = await fetch('https://api.stability.ai/v2/stable-image/generate/core', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
    body: form,
  })
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} ${await response.text()}`), { status: response.status })
  return Buffer.from(await response.arrayBuffer())
}

const providers = {
  openai: { requiredKey: 'OPENAI_API_KEY', call: callOpenAI },
  stability: { requiredKey: 'STABILITY_API_KEY', call: callStability },
}

async function main() {
  const base = await siteBase()
  const providerName = (process.env.IMAGE_PROVIDER || 'openai').toLowerCase()
  const provider = providers[providerName]
  if (!provider) {
    console.error(`Unknown IMAGE_PROVIDER "${providerName}". Supported: ${Object.keys(providers).join(', ')}`)
    process.exit(1)
  }

  console.log(`Provider : ${providerName}${process.env.IMAGE_MODEL ? ` (${process.env.IMAGE_MODEL})` : ''}`)
  console.log(`Size     : ${SIZE} (3:2 landscape)`)
  console.log(`Output   : ${outputDir}`)
  console.log(`Products : ${selected.map(p => p.slug).join(', ')}`)
  console.log('')

  if (dryRun) {
    for (const product of selected) console.log(`--- ${product.slug}\n${buildPrompt(product)}\n`)
    return
  }

  if (!process.env[provider.requiredKey]) {
    console.error(
      `${provider.requiredKey} is not set.\n` +
      `Add it to a .env file or export it before running:\n\n` +
      `  $env:${provider.requiredKey} = "your-key"\n` +
      `  npm run generate:images\n\n` +
      `Never commit the key. See .env.example for the place to document it.`
    )
    process.exit(1)
  }

  await mkdir(outputDir, { recursive: true })
  const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {}
  const written = []
  const failed = []

  for (const product of selected) {
    const existing = Object.values(manifest).find(entry => entry.slug === product.slug)
    if (existing && existsSync(join(outputDir, existing.file)) && !force) {
      console.log(`skip    ${product.slug} (${existing.file} already present; pass --force to redo)`)
      continue
    }

    process.stdout.write(`gen     ${product.slug} ... `)
    try {
      const bytes = await withRetry(product.slug, () => provider.call(buildPrompt(product)))
      const sniffed = extensionFor(bytes)
      if (!sniffed) throw new Error('provider returned data that is not a JPEG, PNG or WebP image')
      if (bytes.length < 5000) throw new Error(`image is only ${bytes.length} bytes, which is too small to be a real photo`)

      const file = `${product.slug}.${sniffed.ext}`
      await writeFile(join(outputDir, file), bytes)

      manifest[product.slug] = {
        slug: product.slug,
        name: product.name,
        file,
        url: `${base}images/products/${file}`,
        bytes: bytes.length,
        type: sniffed.type,
        provider: providerName,
        model: process.env.IMAGE_MODEL || null,
        generatedAt: new Date().toISOString(),
      }
      written.push(manifest[product.slug])
      console.log(`ok ${file} (${Math.round(bytes.length / 1024)} KB)`)
    } catch (err) {
      failed.push({ slug: product.slug, error: err.message })
      console.log(`FAILED ${err.message}`)
    }
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log('')
  console.log(`written ${written.length}, failed ${failed.length}`)
  if (written.length) {
    console.log('')
    console.log('Set these as image_url for the matching product:')
    for (const entry of written) console.log(`  ${entry.name.padEnd(12)} ${entry.url}`)
  }
  if (failed.length) {
    console.log('')
    console.log('Failed, and nothing was written for these:')
    for (const entry of failed) console.log(`  ${entry.slug}: ${entry.error}`)
    process.exitCode = 1
  }
}

await main()
