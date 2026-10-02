import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, memo } from 'react'
import { supabase } from './lib/supabaseClient'

const fallbackProducts = [
  { id: 1, name: 'Chapati', price: 20, description: 'Fresh from the pan', image_url: '/comfortable-breaksfast-center/images/products/chapati.jpg', display_order: 1, is_available: true, created_at: '' },
  { id: 2, name: 'Cakes', price: 80, description: 'A sweet morning treat', image_url: '/comfortable-breaksfast-center/images/products/cakes.jpg', display_order: 2, is_available: true, created_at: '' },
  { id: 3, name: 'Corns', price: 30, description: 'Golden and roasted', image_url: '/comfortable-breaksfast-center/images/products/corns.jpg', display_order: 3, is_available: true, created_at: '' },
  { id: 4, name: 'Bread', price: 20, description: 'Soft, warm, daily baked', image_url: '/comfortable-breaksfast-center/images/products/bread.jpg', display_order: 4, is_available: true, created_at: '' },
  { id: 6, name: 'Eggs', price: 50, description: 'Breakfast favourites', image_url: '/comfortable-breaksfast-center/images/products/eggs.jpg', display_order: 5, is_available: true, created_at: '' },
  { id: 5, name: 'Mandazi', price: 10, description: 'Pillowy Kenyan classic', image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80', display_order: 6, is_available: true, created_at: '' },
  { id: 7, name: 'Pizza', price: 300, description: 'Warm, cheesy, and satisfying', image_url: '/comfortable-breaksfast-center/images/products/pizza.jpg', display_order: 7, is_available: true, created_at: '' },
  { id: 8, name: 'Sausages', price: 150, description: 'Savory breakfast links', image_url: '/comfortable-breaksfast-center/images/products/sausages.jpg', display_order: 8, is_available: true, created_at: '' },
  { id: 9, name: 'Biscuits', price: 60, description: 'Crisp and buttery', image_url: '/comfortable-breaksfast-center/images/products/biscuits.jpg', display_order: 9, is_available: true, created_at: '' },
]

const hiddenProductNames = new Set(['Sugar', 'Big Eggs', 'Cooking Oil'])
const filterHiddenProducts = list =>
  list.filter(product => !hiddenProductNames.has(String(product.name || '').trim()))

const orderedVisibleProducts = list =>
  [...list].sort((a, b) => Number(a.display_order ?? a.id) - Number(b.display_order ?? b.id) || Number(a.id) - Number(b.id))

// Products held back until "See more" is pressed, so the menu opens on the
// everyday eight: chapati, cakes, corns, bread, eggs, mandazi, pizza and
// sausages. The lineup is keyed by name rather than by a count, so a new row
// in the database can never push pizza or sausages back behind the fold.
const HELD_BACK_PRODUCT_NAMES = new Set(['biscuits'])
const MAX_QUANTITY = 10

// The one correct image per product. fallbackProducts is the single source of
// truth for the lineup and is kept in step with the Supabase migrations
// 20260928173000_dedupe_products_and_enforce_unique_name.sql and
// 20260928174500_update_menu_lineup.sql, so the live menu and this offline
// fallback can never disagree about a product or its photo.
const canonicalImageFor = name => {
  const key = String(name || '').trim().toLowerCase()
  return fallbackProducts.find(
    product => product.name.trim().toLowerCase() === key
  )?.image_url
}

// The menu renders one card per row, so duplicate rows for a single product
// repeat both the product and its image. Keep one row per product name,
// preferring the row that actually carries an image, then the lowest id.
const dedupeProducts = list => {
  const best = new Map()
  for (const product of list) {
    const key = String(product.name || '').trim().toLowerCase()
    const current = best.get(key)
    if (!current) {
      best.set(key, product)
      continue
    }
    const currentHasImage = Boolean(current.image_url?.trim())
    const candidateHasImage = Boolean(product.image_url?.trim())
    if (candidateHasImage !== currentHasImage) {
      if (candidateHasImage) best.set(key, product)
    } else if (Number(product.id) < Number(current.id)) {
      best.set(key, product)
    }
  }
  return [...best.values()].sort((a, b) => Number(a.display_order ?? a.id) - Number(b.display_order ?? b.id) || Number(a.id) - Number(b.id))
}

const completeCatalog = list => {
  const liveByName = new Map(list.map(product => [String(product.name || '').trim().toLowerCase(), product]))
  const knownNames = new Set(fallbackProducts.map(product => product.name.trim().toLowerCase()))
  const missingProducts = fallbackProducts
    .filter(product => !liveByName.has(product.name.trim().toLowerCase()))
    .map(product => ({ ...product, is_available: false, stock: 0 }))
  const additionalProducts = list.filter(product => !knownNames.has(String(product.name || '').trim().toLowerCase()))
  return [...list, ...missingProducts, ...additionalProducts]
    .sort((a, b) => Number(a.display_order ?? a.id) - Number(b.display_order ?? b.id) || Number(a.id) - Number(b.id))
}

const categoryFor = product => {
  const name = String(product.name || '').toLowerCase()
  if (/pizza|sausage/.test(name)) return 'Signature'
  if (/cake|bread|chapati|mandazi|biscuit/.test(name)) return 'Baked'
  if (/egg|corn|breakfast/.test(name)) return 'Breakfast'
  return 'Savory'
}

const descriptionFor = product => fallbackProducts.find(
  item => item.name.trim().toLowerCase() === String(product.name || '').trim().toLowerCase()
)?.description || product.description || 'Prepared fresh for your morning.'

const money = value => `KSh ${Number(value || 0).toLocaleString()}`

// Every contact and opening detail the footer shows lives here, so the whole
// block can be corrected in one place. The phone number is the same one the
// cart and WhatsApp links already used.
const breakfastCenter = {
  name: 'Comfortable Breakfast Center',
  phone: '+254 706 416 480',
  phoneHref: 'tel:+254706416480',
  whatsapp: 'https://wa.me/254706416480',
  email: 'hello@comfortablebreakfast.co.ke',
  location: 'Nairobi, Kenya',
  hours: 'Mon – Sun · 6:00 am – 11:00 am',
  delivery: 'Collection & staff delivery on site',
  highlights: ['Baked and cooked fresh daily', 'Clear, honest pricing', 'Ready in as little as 5 minutes'],
}
const isUnavailable = product => product.is_available === false || (product.stock != null && Number(product.stock) <= 0)

const handleImageError = event => {
  const image = event.currentTarget
  const productImage = canonicalImageFor(image.alt)
  if (productImage && !image.dataset.fallbackApplied && !image.src.endsWith(productImage)) {
    image.dataset.fallbackApplied = '1'
    image.src = productImage
    return
  }
  image.hidden = true
}

const ProductCard = memo(({ product, index, selected, addedProductId, productQuantities, setProductQuantities, setSelected, addToCart, isUnavailable }) => {
  const imageSrc = canonicalImageFor(product.name) || product.image_url
  const isMaxQty = (productQuantities[product.id] || 1) >= MAX_QUANTITY
  const unavailable = isUnavailable(product)
  return (
    <article className={`card ${selected?.id === product.id ? 'selected' : ''} ${addedProductId === product.id ? 'added' : ''}`} style={{ '--delay': `${Math.min(index, 6) * 45}ms` }} onClick={() => setSelected(product)}>
      <div className="photo">
        <img src={imageSrc} onError={handleImageError} alt={product.name} loading={index < 3 ? 'eager' : 'lazy'} decoding="async" />
        <span className={unavailable ? 'stock-out' : 'stock-in'}>{unavailable ? 'Out of stock' : 'Available'}</span>
      </div>
      <div className="card-body">
        <div>
          <button className="product-name" onClick={() => setSelected(product)}>{product.name}</button>
          <p className="product-description">{descriptionFor(product)}</p>
        </div>
        <div className="card-actions">
          <strong>{money(product.price)}</strong>
          <div className="product-buy">
            <div className="product-quantity" aria-label={`Quantity for ${product.name}`}>
              <button type="button" aria-label={`Decrease ${product.name} quantity`} disabled={unavailable} onClick={event => { event.stopPropagation(); setProductQuantities(current => ({ ...current, [product.id]: Math.max(1, Number(current[product.id] || 1) - 1) })) }}>−</button>
              <span aria-live="polite">{productQuantities[product.id] || 1}</span>
              <button type="button" aria-label={`Increase ${product.name} quantity`} disabled={unavailable || (productQuantities[product.id] || 1) >= MAX_QUANTITY} onClick={event => { event.stopPropagation(); const next = Number(productQuantities[product.id] || 1) + 1; if (next <= MAX_QUANTITY) setProductQuantities(current => ({ ...current, [product.id]: next })) }}>+</button>
            </div>
            <button className={`add-cart ${addedProductId === product.id ? 'added' : ''}`} disabled={unavailable || isMaxQty} onClick={event => { event.stopPropagation(); addToCart(product, Number(productQuantities[product.id] || 1)) }}>
              {unavailable ? 'Out of stock' : isMaxQty ? 'Out of stock' : addedProductId === product.id ? 'Added' : 'Add to order'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
})

const CartItem = memo(({ product, quantity, changeQuantity, money, canonicalImageFor, handleImageError }) => (
  <div className="cart-item" key={product.id}>
    <img src={canonicalImageFor(product.name) || product.image_url} onError={handleImageError} alt={product.name} loading="lazy" decoding="async" />
    <div>
      <strong>{product.name}</strong>
      <span>{money(product.price)} each</span>
    </div>
    <div className="quantity">
      <button aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)}>−</button>
      <b aria-live="polite">{quantity}</b>
      <button aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(product.id, 1)} disabled={quantity >= MAX_QUANTITY}>+</button>
    </div>
    <strong>{money(Number(product.price) * quantity)}</strong>
  </div>
))

const JOURNEY_STEPS = [
  { label: 'Menu', href: '#menu' },
  { label: 'Your order', href: '#cart' },
  { label: 'Checkout', href: '#checkout' },
  { label: 'Confirmed', href: '#checkout' },
]

// The path the customer is on, so "what do I do next" is never a guess.
const JourneySteps = memo(({ current }) => (
  <nav className="journey" aria-label="Ordering progress">
    <ol>
      {JOURNEY_STEPS.map((step, index) => (
        <li key={step.label} className={index === current ? 'current' : index < current ? 'done' : ''} aria-current={index === current ? 'step' : undefined}>
          <a href={step.href}>
            <span className="journey-dot" aria-hidden="true">{index < current ? '✓' : index + 1}</span>
            <span className="journey-label">{step.label}</span>
          </a>
        </li>
      ))}
    </ol>
  </nav>
))

export default function App() {
  const [products, setProducts] = useState(fallbackProducts)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [cart, setCart] = useState([])
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState(
    supabase ? 'Loading the latest breakfast menu…' : 'Online ordering is temporarily unavailable. Please call us to place your order.'
  )
  const [profile, setProfile] = useState({ department: '', email: '', name: '' })
  const [checkoutStatus, setCheckoutStatus] = useState('')
  const [orderId, setOrderId] = useState('')
  // Snapshot of what was just ordered, so the confirmation can show the items
  // and total after the cart is emptied. Presentation only.
  const [placedOrder, setPlacedOrder] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addedProductId, setAddedProductId] = useState(null)
  const [showMore, setShowMore] = useState(false)
  const [productQuantities, setProductQuantities] = useState({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [user, setUser] = useState(null)
  const [_session, setSession] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [showPassword, setShowPassword] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [authError, setAuthError] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [authSuccess, setAuthSuccess] = useState('')
  const [notice, setNotice] = useState('')
  const [activeSection, setActiveSection] = useState('')
  const noticeTimer = useRef(null)
  const orderTimer = useRef(null)
  const firstAuthFieldRef = useRef(null)

  // One polite channel for every transient result (added, cleared, refreshed,
  // blocked). Screen readers announce it and sighted users get the toast.
  const announce = useCallback(message => {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 3200)
  }, [])

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    if (orderTimer.current) clearTimeout(orderTimer.current)
  }, [])

  useEffect(() => {
    if (!isAuthModalOpen) return
    firstAuthFieldRef.current?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape') setIsAuthModalOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isAuthModalOpen])

  const loadProducts = useCallback(async () => {
    if (!supabase) {
      setStatus('Online ordering is temporarily unavailable. Please call us to place your order.')
      return
    }
    try {
      const { data, error } = await supabase
        .from('products')
        // image_url is deliberately not selected. The column does not exist on
        // the live products table, and asking for it fails the whole query with
        // 42703, which left the menu stuck on its offline fallback. The photo
        // comes from canonicalImageFor(product.name) instead.
        .select('id, name, price, description, created_at, is_available, stock, display_order')
        // Order by display_order, not created_at. The products added latest
        // would otherwise sort to the top, which would put Pizza, Sausages and
        // Biscuits in the first six and leave "See more" revealing nothing.
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
      if (error) {
        setStatus('We could not refresh the menu just now. Showing our current breakfast selection.')
        return
      }
      const visibleData = orderedVisibleProducts(filterHiddenProducts(data || []))
      if (!visibleData.length) {
        setProducts(completeCatalog([]))
        setStatus('')
        return
      }
      setProducts(completeCatalog(dedupeProducts(visibleData)))
      setStatus('')
    } catch {
      setStatus('We could not refresh the menu just now. Showing our current breakfast selection.')
    }
  }, [])

  const refreshProducts = useCallback(async () => {
    if (!supabase) return
    setIsRefreshing(true)
    try {
      await loadProducts()
    } finally {
      setIsRefreshing(false)
    }
  }, [loadProducts])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setProfile(prev => ({ ...prev, name: session.user.user_metadata?.name || '', email: session.user.email || '' }))
      }
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setProfile(prev => ({ ...prev, name: session.user.user_metadata?.name || '', email: session.user.email || '' }))
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!addedProductId) return undefined
    const timeout = setTimeout(() => setAddedProductId(null), 900)
    return () => clearTimeout(timeout)
  }, [addedProductId])

  // Highlights the nav link for whichever band is currently on screen, so
  // clicking a link leaves a visible trace instead of only a scroll.
  useEffect(() => {
    const sections = ['menu', 'cart', 'checkout']
      .map(id => document.getElementById(id))
      .filter(Boolean)
    if (!sections.length || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setActiveSection(visible.target.id)
    }, { rootMargin: '-45% 0px -50% 0px', threshold: [0, 0.25, 0.6] })
    sections.forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  const categories = useMemo(() => ['All', 'Breakfast', 'Baked', 'Signature'], [])
  // Typing stays responsive because the cards re-filter against the deferred
  // value: the field updates on every keystroke, the grid catches up after.
  const deferredQuery = useDeferredValue(query)
  const filteredProducts = useMemo(() => products.filter(product => {
    const searchText = `${product.name} ${product.description || ''}`.toLowerCase()
    return (category === 'All' || categoryFor(product) === category) && searchText.includes(deferredQuery.trim().toLowerCase())
  }), [products, category, deferredQuery])
  const hasActiveFilter = Boolean(deferredQuery.trim() || category !== 'All')
  const isFiltering = query.trim() !== deferredQuery.trim()
  const isHeldBack = product => HELD_BACK_PRODUCT_NAMES.has(String(product.name || '').trim().toLowerCase())
  // Searching or picking a category shows every match straight away: the
  // customer has asked for something specific, so nothing is held back.
  const visibleProducts = hasActiveFilter || showMore
    ? filteredProducts
    : filteredProducts.filter(product => !isHeldBack(product))
  // Stays visible after expanding so the row can be collapsed again.
  const hasMoreProducts = !hasActiveFilter && filteredProducts.some(isHeldBack)
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0)
  const cartTotal = cart.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0)
  // Where the customer stands in the journey. Drives the stepper and the
  // sticky mobile order bar; the order itself is unchanged.
  const journeyStep = orderId ? 3 : isSubmitting ? 2 : cart.length ? 1 : 0

  const addToCart = useCallback((product, quantity = 1) => {
    if (!supabase || status) {
      announce('Online ordering is unavailable right now. Please call us to place your order.')
      return
    }
    if (isUnavailable(product)) {
      announce(`${product.name} is out of stock today.`)
      return
    }
    const currentQty = productQuantities[product.id] || 1
    if (currentQty + quantity > MAX_QUANTITY) {
      announce(`You can order up to ${MAX_QUANTITY} of each item.`)
      return
    }
    setAddedProductId(product.id)
    setCart(current => {
      const found = current.find(item => item.product.id === product.id)
      return found ? current.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item) : [...current, { product, quantity }]
    })
    setSelected(product)
    announce(`${product.name} ×${quantity} added to your order.`)
    document.getElementById('cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [announce, productQuantities, status])

  const changeQuantity = useCallback((productId, delta) => {
    setCart(current => {
      const item = current.find(entry => entry.product.id === productId)
      if (!item) return current
      if (delta > 0 && item.quantity >= MAX_QUANTITY) {
        announce(`You can order up to ${MAX_QUANTITY} of each item.`)
        return current
      }
      if (delta < 0 && item.quantity === 1) announce(`${item.product.name} removed from your order.`)
      return current.flatMap(entry => {
        if (entry.product.id !== productId) return [entry]
        const quantity = entry.quantity + delta
        if (quantity > MAX_QUANTITY) return [entry]
        return quantity > 0 ? [{ ...entry, quantity }] : []
      })
    })
  }, [announce])

  const clearCart = useCallback(() => {
    setCart([])
    announce('Your order was cleared.')
  }, [announce])

  const submitOrder = async event => {
    event.preventDefault()
    setCheckoutStatus('')
    setOrderId('')
    if (!cart.length) { setCheckoutStatus('Your cart is empty. Add a breakfast before placing an order.'); return }
    if (!supabase) { setCheckoutStatus('Online ordering is not available right now. Please call us to place your order.'); return }

    // Checked here as well as on the fields, so a keyboard or autofill path that
    // skips the browser's own validation still gets a precise message.
    const missingField = [
      [profile.name.trim(), 'your name'],
      [profile.email.trim(), 'your email address'],
      [profile.department, 'your department'],
    ].find(([value]) => !value)
    if (missingField) {
      setCheckoutStatus(`Please add ${missingField[1]} before placing your order.`)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) {
      setCheckoutStatus('Please check your email address and try again.')
      return
    }

    setIsSubmitting(true)
    try {
      const timeoutPromise = new Promise((_, reject) => {
        orderTimer.current = setTimeout(() => reject(new Error('Request timed out. Please check your connection and try again.')), 15000)
      })
      const { data, error } = await Promise.race([
        supabase.rpc('place_order', {
          p_customer_name: profile.name,
          p_customer_email: profile.email,
          p_department: profile.department,
          p_items: cart.map(item => ({ product_id: item.product.id, quantity: item.quantity })),
        }),
        timeoutPromise,
      ])
      if (error) {
        setCheckoutStatus('One or more items may no longer be available. Refresh the menu and review your order.')
        announce('We could not save your order. Please review your items.')
        await loadProducts()
      } else {
        setPlacedOrder({
          reference: data,
          items: cart.map(({ product, quantity }) => ({ name: product.name, quantity, price: Number(product.price) })),
          total: cartTotal,
          name: profile.name.trim(),
          email: profile.email.trim(),
          department: profile.department,
        })
        setOrderId(data)
        setCart([])
        announce('Order received. Thank you!')
      }
    } catch {
      setCheckoutStatus('We could not place your order just now. Please try again or call us for help.')
      announce('We could not place your order just now.')
    } finally {
      if (orderTimer.current) clearTimeout(orderTimer.current)
      setIsSubmitting(false)
    }
  }

  const handleAuthInput = (field, value) => {
    setAuthForm(prev => ({ ...prev, [field]: value }))
    setAuthError('')
    setAuthSuccess('')
  }

  // Same check the form fields make, repeated here so an autofilled or
  // keyboard-driven submit cannot slip past with an empty value.
  const authValidationError = () => {
    if (!authForm.email.trim()) return 'Please enter your email address.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForm.email.trim())) return 'That email address does not look right.'
    if (!authForm.password) return 'Please enter your password.'
    return ''
  }

  const openAuthModal = () => {
    if (!supabase) {
      setAuthError('Account sign-in is temporarily unavailable. Please try again later.')
      setAuthSuccess('')
      setAuthMode('login')
      setIsAuthModalOpen(true)
      return
    }
    setAuthError('')
    setAuthSuccess('')
    setIsAuthModalOpen(true)
  }

  const handleSignUp = async event => {
    event.preventDefault()
    setAuthError('')
    setAuthSuccess('')
    if (!supabase) {
      setAuthError('Account creation is temporarily unavailable. Please try again later.')
      return
    }
    if (authMode === 'signup' && !authForm.name.trim()) {
      setAuthError('Please enter your name.')
      return
    }
    const problem = authValidationError()
    if (problem) {
      setAuthError(problem)
      return
    }
    if (authForm.password !== authForm.confirmPassword) {
      setAuthError('Passwords do not match')
      return
    }
    if (authForm.password.length < 6) {
      setAuthError('Password must be at least 6 characters')
      return
    }
    setIsAuthLoading(true)
    const { error } = await supabase.auth.signUp({
      email: authForm.email,
      password: authForm.password,
      options: { data: { name: authForm.name } }
    })
    setIsAuthLoading(false)
    if (error) { setAuthError(error.message); return }
    setAuthSuccess('Check your email to confirm your account. Then sign in.')
    announce('Account created. Check your email to confirm it.')
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
  }

  const handleSignIn = async event => {
    event.preventDefault()
    setAuthError('')
    setAuthSuccess('')
    if (!supabase) {
      setAuthError('Account sign-in is temporarily unavailable. Please try again later.')
      return
    }
    const problem = authValidationError()
    if (problem) {
      setAuthError(problem)
      return
    }
    setIsAuthLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: authForm.email,
      password: authForm.password
    })
    setIsAuthLoading(false)
    if (error) {
      if (error.message.includes('Email not confirmed') || error.message.includes('email not confirmed')) {
        setAuthError('Please confirm your email first. Check your inbox for the confirmation link.')
      } else {
        setAuthError('Those sign-in details were not recognised. Please try again.')
      }
      return
    }
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
    announce('You are signed in. Welcome back!')
  }

  const handleSignOut = async () => {
    if (!supabase) return
    setIsAuthLoading(true)
    const { error } = await supabase.auth.signOut()
    setIsAuthLoading(false)
    if (error) {
      setNotice('We could not sign you out. Please try again.')
      return
    }
    setProfile({ department: '', email: '', name: '' })
    announce('You have been signed out.')
  }

  const toggleAuthMode = () => {
    setAuthMode(prev => prev === 'login' ? 'signup' : 'login')
    setAuthError('')
    setAuthSuccess('')
    setShowPassword(false)
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
  }

  return <>
    <div className={`toast ${notice ? 'toast--visible' : ''}`} role="status" aria-live="polite">
      {notice && <><span className="toast-dot" aria-hidden="true"></span>{notice}</>}
    </div>
    <a className="skip-link" href="#menu">Skip to the menu</a>
    <header className="topbar" role="banner">
      <div className="topbar-inner">
        <a className="brand" href="#top" aria-label="Comfortable Breakfast Center - Home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-text">
            <span className="brand-line">Comfortable</span>
            <span className="brand-line brand-line--accent">Breakfast Center</span>
          </span>
        </a>

        <nav className="primary-nav" aria-label="Main navigation">
          <a href="#menu" data-nav="shop" className={activeSection === 'menu' ? 'active' : ''} aria-current={activeSection === 'menu' ? 'true' : undefined}>Shop</a>
          <a href="#menu" data-nav="menu" className={activeSection === 'menu' ? 'active' : ''} aria-current={activeSection === 'menu' ? 'true' : undefined}>Our Menu</a>
          <a href="#cart" data-nav="order" className={activeSection === 'cart' ? 'active' : ''} aria-current={activeSection === 'cart' ? 'true' : undefined}>Order</a>
        </nav>

        <div className="nav-actions">
          <label className="nav-search" aria-label="Search menu">
            <svg className="search-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter') return
                document.getElementById('menu-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              placeholder="Search the menu…"
              aria-label="Search menu"
              autoComplete="off"
            />
            {query && (
              <button type="button" className="search-clear" onClick={() => { setQuery(''); announce('Search cleared.') }} aria-label="Clear search">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            )}
          </label>

          {user ? (
            <div className="user-menu">
              <button className="user-avatar" onClick={handleSignOut} aria-label="Sign out of your account" title="Sign out">
                <span className="avatar-initial">{ (user.user_metadata?.name || user.email || 'U').charAt(0).toUpperCase() }</span>
              </button>
            </div>
          ) : (
            <button className="icon-action sign-in-btn" onClick={openAuthModal} aria-label="Sign in" title="Sign in">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/></svg>
              <span className="sign-in-text">Log in</span>
            </button>
          )}

          <a className="cart-action" href="#cart" aria-label={`View cart, ${cartCount} items`}>
            <svg className="cart-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            <span className="cart-label">Cart</span>
            <span className="cart-count" aria-hidden="true">{cartCount}</span>
          </a>
        </div>
      </div>
      <div className="topbar-divider" aria-hidden="true"></div>
    </header>
    {!user && isAuthModalOpen && (
      <div className="auth-modal-overlay" onClick={() => setIsAuthModalOpen(false)} style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(23, 42, 58, 0.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
      }}>
        <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={e => e.stopPropagation()} style={{
          background: '#FFF7E8', borderRadius: '12px',
          maxWidth: '420px', width: '100%', boxShadow: '0 20px 50px rgba(23,42,58,0.18)'
        }}>
          <button className="auth-modal-close" onClick={() => setIsAuthModalOpen(false)} aria-label="Close sign in" style={{
            position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none',
            fontSize: '24px', cursor: 'pointer', color: '#4F5F6A', lineHeight: 1
          }}>×</button>
          <div className="auth-header" style={{textAlign: 'center', marginBottom: '24px'}}>
            <p className="eyebrow" style={{margin: '0 0 8px'}}>{authMode === 'login' ? 'WELCOME BACK' : 'CREATE ACCOUNT'}</p>
            <h2 id="auth-title" style={{font: '600 clamp(28px,4vw,36px)/1.03 Fraunces', margin: 0, color: '#172A3A'}}>
              {authMode === 'login' ? 'Sign in to your account' : 'Join the Breakfast Center'}
            </h2>
          </div>
          <div className="auth-messages" aria-live="polite">
            {authError && <p className="form-error" style={{marginBottom: '16px'}}>{authError}</p>}
            {authSuccess && <p style={{color: '#2E5B3D', marginBottom: '16px', textAlign: 'center', fontSize: '14px'}}>{authSuccess}</p>}
          </div>
          <form onSubmit={authMode === 'login' ? handleSignIn : handleSignUp} noValidate>
            {authMode === 'signup' && (
              <label style={{display: 'block', marginBottom: '16px'}}>
                <span style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#172A3A'}}>
                  Your name
                </span>
                <input
                  required
                  ref={authMode === 'signup' ? firstAuthFieldRef : undefined}
                  type="text"
                  placeholder="Enter your name"
                  autoComplete="name"
                  value={authForm.name}
                  onChange={e => handleAuthInput('name', e.target.value)}
                  style={{width: '100%', padding: '12px 14px', border: '1px solid #E9DDC7', borderRadius: '6px', fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box'}}
                />
              </label>
            )}
            <label style={{display: 'block', marginBottom: '16px'}}>
              <span style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#172A3A'}}>
                Email address
              </span>
              <input
                required
                ref={authMode === 'login' ? firstAuthFieldRef : undefined}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={authForm.email}
                onChange={e => handleAuthInput('email', e.target.value)}
                style={{width: '100%', padding: '12px 14px', border: '1px solid #E9DDC7', borderRadius: '6px', fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box'}}
              />
            </label>
            <label style={{display: 'block', marginBottom: '16px'}}>
              <span style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#172A3A'}}>
                Password
              </span>
              <input
                required
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                value={authForm.password}
                onChange={e => handleAuthInput('password', e.target.value)}
                style={{width: '100%', padding: '12px 14px', border: '1px solid #E9DDC7', borderRadius: '6px', fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box'}}
              />
              <button type="button" className="auth-toggle" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} style={{marginTop: '8px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#4F5F6A', fontFamily: 'DM Sans', fontSize: '13px', fontWeight: 600, textDecoration: 'underline'}}>
                {showPassword ? 'Hide password' : 'Show password'}
              </button>
            </label>
            {authMode === 'signup' && (
              <label style={{display: 'block', marginBottom: '16px'}}>
                <span style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#172A3A'}}>
                  Confirm password
                </span>
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  value={authForm.confirmPassword}
                  onChange={e => handleAuthInput('confirmPassword', e.target.value)}
                  style={{width: '100%', padding: '12px 14px', border: '1px solid #E9DDC7', borderRadius: '6px', fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box'}}
                />
              </label>
            )}
            <button
              className={`button form-button ${isAuthLoading ? 'is-busy' : ''}`}
              type="submit"
              disabled={isAuthLoading}
              aria-busy={isAuthLoading}
              style={{width: '100%', marginTop: '8px', padding: '14px 20px'}}
            >
              {isAuthLoading ? <><span className="spin" aria-hidden="true"></span>Please wait…</> : <>{authMode === 'login' ? 'Sign In' : 'Create Account'}</>}
            </button>
          </form>
          <p style={{marginTop: '20px', textAlign: 'center', fontSize: '14px', color: '#4F5F6A'}}>
            {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={toggleAuthMode} style={{color: '#D99A2B', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: '14px'}}>
              {authMode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    )}
    <main id="top">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A proper pause, made easy</p>
          <h1>
            A warm break for the busy <span className="highlight">workday.</span>
          </h1>
          <p className="hero-text">
            Fresh breakfast, comforting favourites, and a few minutes to reset before the day gets ahead of you. Order something satisfying, hot, and ready when you need it most.
          </p>
          <div className="hero-actions">
            <a className="button" href="#menu">Order breakfast now</a>
          </div>
          <div className="hero-meta" aria-label="Breakfast benefits">
            <span>Fresh daily</span>
            <span>Hot &amp; ready</span>
            <span>Made for busy mornings</span>
          </div>
        </div>
        <figure className="hero-art" aria-label="Fresh breakfast spread">
          <div className="hero-plate">
            <img className="hero-photo" src={`${import.meta.env.BASE_URL}images/products/corns.jpg`} alt="Freshly roasted breakfast corn and warm breakfast favourites" width="800" height="920" fetchPriority="high" decoding="async" />
          </div>
          <div className="hero-inset">
            <img src={`${import.meta.env.BASE_URL}images/products/cakes.jpg`} alt="Fresh cakes and pastry selection" width="600" height="264" loading="lazy" decoding="async" />
            <div className="hero-mini-copy">
              <strong>Fresh from the kitchen</strong>
              <span>Breakfast worth pausing for</span>
            </div>
          </div>
          <div className="hero-stamp">Fresh daily</div>
        </figure>
      </section>
      <section className="menu-section" id="menu">
        <JourneySteps current={journeyStep} />
        <div className="shop-heading">
          <p className="eyebrow">THE BREAKFAST EDITION</p>
          <h2>Breakfast, made easy</h2>
          <p>Thoughtfully made favourites to start your day well.</p>
        </div>
        <div className="category-menu" aria-label="Product categories">{categories.map(item => <button className={category === item ? 'active' : ''} aria-pressed={category === item} key={item} onClick={() => setCategory(item)}>{item === 'All' ? 'All items' : item}</button>)}</div>
        <div className="shop-toolbar">
          <p aria-live="polite">
            {isFiltering ? 'Searching…' : query.trim() ? `${filteredProducts.length} match${filteredProducts.length === 1 ? '' : 'es'} for “${query.trim()}”` : category === 'All' ? 'A few good things for your morning.' : `${category} favourites`}
          </p>
          <button className={`refresh-button ${isRefreshing ? 'is-busy' : ''}`} type="button" onClick={refreshProducts} disabled={!supabase || isRefreshing} aria-busy={isRefreshing}>{isRefreshing ? <><span className="spin" aria-hidden="true"></span>Refreshing…</> : 'Refresh menu'}</button>
        </div>
        {status && <div className="menu-status" role="status">{status}</div>}
        {!status && !filteredProducts.length && <div className="not-found" role="status">No matches for “{query}”. Try a different search or category.</div>}
        <div className={`menu-grid ${isFiltering ? 'is-filtering' : ''} ${status ? 'is-loading' : ''}`} id="menu-grid" aria-busy={isFiltering || Boolean(status)}>{visibleProducts.map((product, index) => <ProductCard key={product.name.trim().toLowerCase()} product={product} index={index} selected={selected} addedProductId={addedProductId} productQuantities={productQuantities} setProductQuantities={setProductQuantities} setSelected={setSelected} addToCart={addToCart} isUnavailable={isUnavailable} />)}</div>
        {hasMoreProducts && <div className="menu-toggle"><button className="button" type="button" aria-expanded={showMore} aria-controls="menu-grid" onClick={() => { const next = !showMore; setShowMore(next); announce(next ? `${filteredProducts.length - visibleProducts.length} more item${filteredProducts.length - visibleProducts.length === 1 ? '' : 's'} revealed.` : 'Menu condensed to the everyday selection.') }}>{showMore ? 'Show less' : `See more (${filteredProducts.length - visibleProducts.length})`} <span aria-hidden="true">{showMore ? '↑' : '↓'}</span></button></div>}
      </section>
      <section className="trust-strip" aria-label="Why order with us">
        <div><span>01</span><strong>Everyday favourites</strong><p>Familiar breakfast bites, all in one place.</p></div>
        <div><span>02</span><strong>Clear, honest prices</strong><p>See your total before placing your order.</p></div>
        <div><span>03</span><strong>Easy from start to finish</strong><p>Choose, review and send your order.</p></div>
      </section>
      <section className="order-banner"><div><p className="eyebrow">A BETTER START IS A FEW CLICKS AWAY</p><h2>Your morning favourite is waiting.</h2></div><a className="button" href="#menu">Explore the menu</a></section>
      <section className="cart-section" id="cart"><div className="cart-intro"><p className="eyebrow">YOUR SELECTION</p><h2>Good choices,<br/>ready to go.</h2><p>Review your breakfast and adjust quantities before you order.</p><a className="cart-call" href="tel:+254706416480">Call to order</a><a className="text-link" href="#menu">Back to the menu</a></div><div className="cart-panel"><div className="cart-heading"><div><p className="form-kicker">YOUR CART</p><h3 aria-live="polite">{cartCount ? `${cartCount} item${cartCount === 1 ? '' : 's'} selected` : 'Your cart is empty'}</h3></div>{cartCount > 0 && <button className="clear-cart" onClick={clearCart}>Clear cart</button>}</div>{cart.length === 0 ? <div className="empty-cart"><p>Choose something from the menu and it will appear here.</p><a className="button" href="#menu">Browse the menu</a></div> : <><div className="cart-items">{cart.map(({ product, quantity }) => <CartItem key={product.id} product={product} quantity={quantity} changeQuantity={changeQuantity} money={money} canonicalImageFor={canonicalImageFor} handleImageError={handleImageError} />)}</div><div className="total"><span>Total amount</span><strong aria-live="polite">{money(cartTotal)}</strong></div><a className="button form-button" href="#checkout">Continue to checkout</a><p className="next-step"><strong>Next:</strong> confirm your name and email at checkout. Nothing is charged online — pay on collection.</p></>}</div></section>
      <section className="registration" id="checkout"><div className="registration-intro"><p className="eyebrow">FAST & SIMPLE</p><h2>Your breakfast<br/>is almost ready.</h2><p>Share your details, review the cart, and send your order to the Breakfast Center.</p><div className="steps"><span className="active">01 <b>Your details</b></span><span className={cartCount ? 'active' : ''}>02 <b>Place order</b></span></div><a className="text-link" href="#cart">Back to your order</a></div><div className="form-panel">{orderId ? (
          <div className="confirmation" role="status">
            <p className="confirmation-mark" aria-hidden="true">✓</p>
            <p className="form-kicker">ORDER CONFIRMED</p>
            <h3>Thank you{placedOrder?.name ? `, ${placedOrder.name.split(' ')[0]}` : ''}. Your breakfast is in.</h3>
            <p className="confirmation-lead">We have your order and the kitchen has been notified. Collect it warm from the Breakfast Center{placedOrder?.department ? ` — ${placedOrder.department}` : ''}.</p>
            <dl className="confirmation-facts">
              <div><dt>Reference</dt><dd>{String(orderId).slice(0, 8)}</dd></div>
              <div><dt>Items</dt><dd>{placedOrder?.items.reduce((sum, item) => sum + item.quantity, 0) ?? cartCount}</dd></div>
              <div><dt>Total to pay on collection</dt><dd>{money(placedOrder?.total ?? cartTotal)}</dd></div>
              <div><dt>Sent to</dt><dd>{placedOrder?.email || profile.email}</dd></div>
            </dl>
            {placedOrder?.items?.length ? (
              <ul className="confirmation-items">
                {placedOrder.items.map(item => <li key={item.name}><span>{item.quantity} × {item.name}</span><strong>{money(item.price * item.quantity)}</strong></li>)}
              </ul>
            ) : null}
            <div className="confirmation-actions">
              <a className="button" href="#menu">Order something else</a>
              <a className="footer-whatsapp" href={breakfastCenter.whatsapp} target="_blank" rel="noreferrer">Ask about this order</a>
            </div>
            <p className="confirmation-note">Keep your reference handy. {breakfastCenter.phone} · {breakfastCenter.hours}</p>
          </div>
        ) : (
          <form onSubmit={submitOrder} noValidate><p className="form-kicker">CHECKOUT <span>SECURE ORDER</span></p><h3>Tell us about you.</h3>{cartCount > 0 && (
            <div className="order-summary">
              <div className="order-summary-head"><p className="form-kicker">ORDER SUMMARY</p><a href="#cart">Edit</a></div>
              <ul>{cart.map(({ product, quantity }) => <li key={product.id}><span>{quantity} × {product.name}</span><strong>{money(Number(product.price) * quantity)}</strong></li>)}</ul>
              <div className="total"><span>Total ({cartCount} items)</span><strong>{money(cartTotal)}</strong></div>
            </div>
          )}<label>Department<select id="checkout-department" required value={profile.department} disabled={isSubmitting} onChange={event => setProfile({ ...profile, department: event.target.value })}><option value="">Select your department</option><option>Customer Service</option><option>Sales</option><option>Operations</option><option>Finance</option><option>Human Resources</option></select></label><label>Email address<input id="checkout-email" required type="email" placeholder="you@example.com" autoComplete="email" value={profile.email} disabled={isSubmitting} onChange={event => setProfile({ ...profile, email: event.target.value })}/></label><label>Your name<input id="checkout-name" required placeholder="Enter your name" autoComplete="name" value={profile.name} disabled={isSubmitting} onChange={event => setProfile({ ...profile, name: event.target.value })}/></label><div className="checkout-status" role="status" aria-live="polite">{checkoutStatus && <p className="form-error">{checkoutStatus}</p>}</div><button className={`button form-button ${isSubmitting ? 'is-busy' : ''}`} disabled={!cartCount || isSubmitting} type="submit">{isSubmitting ? <><span className="spin" aria-hidden="true"></span>Saving order…</> : <>Place order</>}</button><p className="next-step"><strong>What happens next:</strong> we confirm your order by email and you pay on collection. No card details needed.</p></form>
        )}</div></section>
      {cartCount > 0 && !orderId && (
        <div className="order-bar" aria-hidden="false">
          <div className="order-bar-inner">
            <p><strong>{money(cartTotal)}</strong><span>{cartCount} item{cartCount === 1 ? '' : 's'} · {breakfastCenter.delivery}</span></p>
            <a className="button" href="#checkout">Checkout</a>
          </div>
        </div>
      )}
    </main>
    <footer className="site-footer">
      <div className="footer-shell">
        <div className="footer-head">
          <div className="footer-intro">
            <a className="footer-logo" href="#top" aria-label={`${breakfastCenter.name} - Home`}>
              <span className="footer-logo-mark" aria-hidden="true">C</span>
              <span className="footer-logo-text">
                <span className="footer-logo-eyebrow">Comfortable</span>
                <span className="footer-logo-name">Breakfast Center</span>
              </span>
            </a>
            <p className="footer-tagline">A better way to begin. Warm, familiar breakfast made fresh every morning and ready when you are.</p>
            <ul className="footer-highlights">
              {breakfastCenter.highlights.map(item => <li key={item}>{item}</li>)}
            </ul>
            <div className="footer-social">
              <p className="footer-social-label" id="footer-social-label">Follow the kitchen</p>
              <ul className="social-links" aria-labelledby="footer-social-label">
                <li>
                  <a className="social-link social-link--facebook" href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Comfortable Breakfast Center on Facebook">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </a>
                </li>
                <li>
                  <a className="social-link social-link--instagram" href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Comfortable Breakfast Center on Instagram">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                  </a>
                </li>
                <li>
                  <a className="social-link social-link--linkedin" href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="Comfortable Breakfast Center on LinkedIn">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452z"/></svg>
                  </a>
                </li>
                <li>
                  <a className="social-link social-link--whatsapp" href={breakfastCenter.whatsapp} target="_blank" rel="noreferrer" aria-label="Chat with Comfortable Breakfast Center on WhatsApp">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-cta">
            <p className="footer-kicker">Order ahead</p>
            <h3>Your morning, already sorted.</h3>
            <p>{breakfastCenter.delivery}. Order online for a warm pickup, or call and we will have it waiting.</p>
            <div className="footer-cta-actions">
              <a className="button" href="#menu">Start an order</a>
              <a className="footer-whatsapp" href={breakfastCenter.whatsapp} target="_blank" rel="noreferrer">Chat on WhatsApp</a>
            </div>
            <p className="footer-cta-note">{breakfastCenter.hours} · {breakfastCenter.location}</p>
          </div>
        </div>
        <div className="footer-columns">
          <nav className="footer-nav" aria-label="Footer navigation">
            <div className="footer-column">
              <h4 className="footer-heading">Order</h4>
              <a href="#menu">Full menu</a>
              <a href="#menu">Breakfast favourites</a>
              <a href="#menu">Baked fresh</a>
              <a href="#cart">Your order</a>
              <a href="#checkout">Checkout</a>
            </div>
            <div className="footer-column">
              <h4 className="footer-heading">Connect</h4>
              <a href={breakfastCenter.phoneHref}>Call to order</a>
              <a href={breakfastCenter.whatsapp} target="_blank" rel="noreferrer">WhatsApp us</a>
              <a href={`mailto:${breakfastCenter.email}`}>Email the team</a>
              <a className="footer-credits" href={`${import.meta.env.BASE_URL}images/CREDITS.md`}>Photo credits</a>
            </div>
          </nav>
          <div className="footer-column footer-details">
            <h4 className="footer-heading">Find us</h4>
            <ul className="footer-contact-list">
              <li><svg className="footer-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg><span>{breakfastCenter.location}</span></li>
              <li><svg className="footer-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.59 3.7 3.7-1.41 1.42L11 13.41V6h2v6.59z"/></svg><span>{breakfastCenter.hours}</span></li>
              <li><svg className="footer-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z"/></svg><a href={breakfastCenter.phoneHref}>{breakfastCenter.phone}</a></li>
              <li><svg className="footer-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg><a href={`mailto:${breakfastCenter.email}`}>{breakfastCenter.email}</a></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} {breakfastCenter.name}. All rights reserved.</p>
        <p>{breakfastCenter.location} · A better way to begin.</p>
      </div>
    </footer>
  </>
}