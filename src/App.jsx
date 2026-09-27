import { useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigError } from './lib/supabaseClient'

const fallbackProducts = [
  { id: 1, name: 'Chapati', price: 20, description: 'Fresh from the pan', image_url: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Chapati.jpg', created_at: '' },
  { id: 2, name: 'Cakes', price: 80, description: 'A sweet morning treat', image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 3, name: 'Corns', price: 30, description: 'Golden and roasted', image_url: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 4, name: 'Bread', price: 20, description: 'Soft, warm, daily baked', image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 5, name: 'Eggs', price: 50, description: 'Sunny and satisfying', image_url: 'https://images.unsplash.com/photo-1565636290659-d5b15f864f64?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 6, name: 'Mandazi', price: 10, description: 'Pillowy Kenyan classic', image_url: 'https://upload.wikimedia.org/wikipedia/commons/6/69/Bowl_of_mandazi.jpg', created_at: '' },
  { id: 7, name: 'Pizza', price: 300, description: 'Warm, cheesy, and satisfying', image_url: 'https://images.unsplash.com/photo-1713393281034-c7c9b046e1d3?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 8, name: 'Sausages', price: 150, description: 'Savory breakfast links', image_url: 'https://images.unsplash.com/photo-1569656048753-1ece52ee0eb1?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 9, name: 'Biscuits', price: 60, description: 'Crisp and buttery', image_url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=900&q=85', created_at: '' },
]

const baseProducts = fallbackProducts

const categoryFor = product => {
  const text = `${product.name} ${product.description || ''}`.toLowerCase()
  if (/cake|mandazi|muffin|cookie|pastr/.test(text)) return 'Sweet treats'
  if (/bread|chapati|toast|bun|croissant/.test(text)) return 'Fresh baked'
  if (/egg|corn|sausage|bacon|breakfast/.test(text)) return 'Breakfast favourites'
  if (/coffee|tea|juice|drink/.test(text)) return 'Drinks'
  return 'Menu favourites'
}

const money = value => `KSh ${Number(value || 0).toLocaleString()}`

export default function App() {
  const [products, setProducts] = useState(fallbackProducts)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [cart, setCart] = useState([])
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState(
    supabaseConfigError
      ? supabaseConfigError
      : 'Loading live products from Supabase. Showing the nine-item menu until the connection succeeds…'
  )
  const [profile, setProfile] = useState({ department: '', email: '', name: '' })
  const [checkoutStatus, setCheckoutStatus] = useState('')
  const [orderId, setOrderId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addedProductId, setAddedProductId] = useState(null)
  const [showMore, setShowMore] = useState(false)
  const [user, setUser] = useState(null)
  const [_session, setSession] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [authError, setAuthError] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [authSuccess, setAuthSuccess] = useState('')

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.from('products').select('id, name, price, description, image_url, created_at').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        if (error) { setStatus(`Supabase could not load products: ${error.message}. Showing the nine-item menu instead.`); return }
        if (!data?.length) { setStatus(''); return }
        setProducts(data)
        setStatus('')
      })
    return () => { active = false }
  }, [])

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
    if (!supabase) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const type = params.get('type')
    if (code && type === 'signup') {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setAuthError('Email confirmation failed. Please try signing up again.')
        } else {
          setAuthSuccess('Email confirmed! You are now signed in.')
          setAuthMode('login')
        }
        window.history.replaceState({}, document.title, window.location.pathname)
      })
    }
  }, [])

  useEffect(() => {
    if (!addedProductId) return undefined
    const timeout = setTimeout(() => setAddedProductId(null), 900)
    return () => clearTimeout(timeout)
  }, [addedProductId])

  const categories = useMemo(() => ['All', ...new Set(products.map(categoryFor))], [products])
  const filteredProducts = useMemo(() => products.filter(product => {
    const searchText = `${product.name} ${product.description || ''}`.toLowerCase()
    return (category === 'All' || categoryFor(product) === category) && searchText.includes(query.trim().toLowerCase())
  }), [products, category, query])
  const hasActiveFilter = Boolean(query.trim() || category !== 'All')
  const visibleProducts = hasActiveFilter || showMore ? filteredProducts : filteredProducts.slice(0, baseProducts.length)
  const hasMoreProducts = !hasActiveFilter && filteredProducts.length > baseProducts.length
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0)
  const cartTotal = cart.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0)

  const addToCart = product => {
    setAddedProductId(product.id)
    setCart(current => {
      const found = current.find(item => item.product.id === product.id)
      return found ? current.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { product, quantity: 1 }]
    })
    setSelected(product)
    document.getElementById('cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const changeQuantity = (productId, delta) => setCart(current => current.flatMap(item => {
    if (item.product.id !== productId) return [item]
    const quantity = item.quantity + delta
    return quantity > 0 ? [{ ...item, quantity }] : []
  }))
  const submitOrder = async event => {
    event.preventDefault()
    setCheckoutStatus('')
    setOrderId('')
    if (!cart.length) { setCheckoutStatus('Your cart is empty. Add a breakfast before placing an order.'); return }
    if (!supabase) { setCheckoutStatus('Connect Supabase in .env.local before placing an order.'); return }
    setIsSubmitting(true)
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please check your connection and try again.')), 15000)
      )
      const { data, error } = await Promise.race([
        supabase.rpc('place_order', {
          p_customer_name: profile.name,
          p_customer_email: profile.email,
          p_department: profile.department,
          p_items: cart.map(item => ({ product_id: item.product.id, quantity: item.quantity })),
        }),
        timeoutPromise,
      ])
      if (error) { setCheckoutStatus(`We couldn't save this order: ${error.message}`) }
      else {
        setOrderId(data)
        setCart([])
      }
    } catch (err) {
      setCheckoutStatus(`We couldn't save this order: ${err.message || err}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAuthInput = (field, value) => {
    setAuthForm(prev => ({ ...prev, [field]: value }))
    setAuthError('')
    setAuthSuccess('')
  }

  const handleSignUp = async event => {
    event.preventDefault()
    setAuthError('')
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
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
  }

  const handleSignIn = async event => {
    event.preventDefault()
    setAuthError('')
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
        setAuthError(error.message)
      }
      return
    }
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setProfile({ department: '', email: '', name: '' })
  }

  const toggleAuthMode = () => {
    setAuthMode(prev => prev === 'login' ? 'signup' : 'login')
    setAuthError('')
    setAuthSuccess('')
    setAuthForm({ name: '', email: '', password: '', confirmPassword: '' })
  }

  return <>
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark">C</span><span>Comfortable<br/><b>Breakfast Center</b></span></a>
      <nav>
        <a href="#menu">Menu</a>
        <a href="#cart">Your cart {cartCount ? `(${cartCount})` : ''}</a>
        <a className="hotline" href="tel:+254706416480">Call +254 706 416 480</a>
        {user ? (
          <div className="user-menu" style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
            <span style={{fontSize: '14px', fontWeight: 600}}>{user.user_metadata?.name || user.email}</span>
            <button className="button" onClick={handleSignOut} style={{padding: '8px 12px', fontSize: '13px'}}>Logout</button>
          </div>
        ) : (
          <button className="button" onClick={() => setIsAuthModalOpen(true)} style={{padding: '8px 12px', fontSize: '13px'}}>
            {authMode === 'login' ? 'Sign In' : 'Sign Up'}
          </button>
        )}
      </nav>
    </header>
    {!user && isAuthModalOpen && (
      <div className="auth-modal-overlay" onClick={() => setIsAuthModalOpen(false)} style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(32, 50, 42, 0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
      }}>
        <div className="auth-modal" onClick={e => e.stopPropagation()} style={{
          background: '#fffaf0', borderRadius: '12px', padding: '40px 32px',
          maxWidth: '420px', width: '100%', boxShadow: '0 20px 50px rgba(32,50,42,0.2)'
        }}>
          <button onClick={() => setIsAuthModalOpen(false)} style={{
            position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none',
            fontSize: '24px', cursor: 'pointer', color: '#68746b', lineHeight: 1
          }}>×</button>
          <div className="auth-header" style={{textAlign: 'center', marginBottom: '24px'}}>
            <p className="eyebrow" style={{margin: '0 0 8px'}}>{authMode === 'login' ? 'WELCOME BACK' : 'CREATE ACCOUNT'}</p>
            <h2 style={{font: '600 clamp(28px,4vw,36px)/1.03 Fraunces', margin: 0, color: '#20322a'}}>
              {authMode === 'login' ? 'Sign in to your account' : 'Join the Breakfast Center'}
            </h2>
          </div>
          {authError && <p className="form-error" style={{marginBottom: '16px'}}>{authError}</p>}
          {authSuccess && <p style={{color: '#2d7d2d', marginBottom: '16px', textAlign: 'center', fontSize: '14px'}}>{authSuccess}</p>}
          <form onSubmit={authMode === 'login' ? handleSignIn : handleSignUp}>
            {authMode === 'signup' && (
              <label style={{display: 'block', marginBottom: '16px'}}>
                <span style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#20322a'}}>
                  Your name
                </span>
                <input
                  required
                  type="text"
                  placeholder="Enter your name"
                  value={authForm.name}
                  onChange={e => handleAuthInput('name', e.target.value)}
                  style={{width: '100%', padding: '12px 14px', border: '1px solid #ddd2c1', borderRadius: '6px', fontSize: '14px', fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box'}}
                />
              </label>
            )}
            <label style={{display: 'block', marginBottom: '16px'}}>
              <span style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#20322a'}}>
                Email address
              </span>
              <input
                required
                type="email"
                placeholder="you@example.com"
                value={authForm.email}
                onChange={e => handleAuthInput('email', e.target.value)}
                style={{width: '100%', padding: '12px 14px', border: '1px solid #ddd2c1', borderRadius: '6px', fontSize: '14px', fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box'}}
              />
            </label>
            <label style={{display: 'block', marginBottom: '16px'}}>
              <span style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#20322a'}}>
                Password
              </span>
              <input
                required
                type="password"
                placeholder="Enter password"
                value={authForm.password}
                onChange={e => handleAuthInput('password', e.target.value)}
                style={{width: '100%', padding: '12px 14px', border: '1px solid #ddd2c1', borderRadius: '6px', fontSize: '14px', fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box'}}
              />
            </label>
            {authMode === 'signup' && (
              <label style={{display: 'block', marginBottom: '16px'}}>
                <span style={{display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#20322a'}}>
                  Confirm password
                </span>
                <input
                  required
                  type="password"
                  placeholder="Confirm password"
                  value={authForm.confirmPassword}
                  onChange={e => handleAuthInput('confirmPassword', e.target.value)}
                  style={{width: '100%', padding: '12px 14px', border: '1px solid #ddd2c1', borderRadius: '6px', fontSize: '14px', fontFamily: 'DM Sans', outline: 'none', boxSizing: 'border-box'}}
                />
              </label>
            )}
            <button
              className="button form-button"
              type="submit"
              disabled={isAuthLoading}
              style={{width: '100%', marginTop: '8px', padding: '14px 20px'}}
            >
              {isAuthLoading ? 'Please wait...' : (authMode === 'login' ? 'Sign In' : 'Create Account')} <span>→</span>
            </button>
          </form>
          <p style={{marginTop: '20px', textAlign: 'center', fontSize: '14px', color: '#68746b'}}>
            {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={toggleAuthMode} style={{color: '#ef6c31', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: '14px'}}>
              {authMode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    )}
    <main id="top">
      <section className="hero"><div className="hero-copy"><p className="eyebrow">YOUR MORNING, MADE COMFORTABLE</p><h1>Small comforts.<br/><em>Big</em> breakfasts.</h1><p className="hero-text">A bright, delicious start is waiting. Pick your favourite breakfast bite and add it to your cart in a few easy steps.</p><a className="button" href="#menu">Explore the menu <span>→</span></a></div><div className="hero-art"><div className="sun"/><div className="plate"><span>☕</span><i/><b/></div><div className="hero-note">Open for the<br/><strong>morning rush</strong></div></div></section>
      <section className="menu-section" id="menu"><div className="section-heading"><div><p className="eyebrow">OUR BREAKFAST MENU</p><h2>Made for an easy morning.</h2></div><label className="search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a breakfast..." aria-label="Search menu" /></label></div><div className="category-menu" aria-label="Product categories">{categories.map(item => <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>{status && <div className="not-found" role="status">{status}</div>}{!status && !filteredProducts.length && <div className="not-found">No breakfast found. Try another search or category.</div>}<div className="menu-grid" id="menu-grid">{visibleProducts.map((product, index) => <article className={`card ${selected?.id === product.id ? 'selected' : ''} ${addedProductId === product.id ? 'added' : ''}`} key={product.id} style={{ '--delay': `${index * 50}ms` }} onClick={() => setSelected(product)}><div className="photo"><img src={product.image_url || 'https://placehold.co/900x600/f5eddf/20322a?text=Breakfast'} alt={product.name}/><span>{categoryFor(product)}</span></div><div className="card-body"><div><button className="product-name" onClick={() => setSelected(product)}>{product.name}</button><p className="product-description">{product.description || 'Prepared fresh for your morning.'}</p>{product.created_at && <time className="product-meta" dateTime={product.created_at}>Added {new Date(product.created_at).toLocaleDateString()}</time>}</div><div className="card-actions"><strong>{money(product.price)}</strong><button className={`add-cart ${addedProductId === product.id ? 'added' : ''}`} onClick={event => { event.stopPropagation(); addToCart(product) }}>{addedProductId === product.id ? 'Added' : 'Add'} <span>{addedProductId === product.id ? '✓' : '+'}</span></button></div></div></article>)}</div>{hasMoreProducts && <div className="menu-toggle"><button className="button" type="button" aria-expanded={showMore} aria-controls="menu-grid" onClick={() => setShowMore(value => !value)}>{showMore ? 'Show less' : 'See more'} <span>{showMore ? '↑' : '↓'}</span></button></div>}</section>
      <section className="cart-section" id="cart"><div className="cart-intro"><p className="eyebrow">YOUR SELECTION</p><h2>Good choices,<br/>ready to go.</h2><p>Review your breakfast and adjust quantities before you order.</p><a className="cart-call" href="tel:+254706416480">Call to order <span>→</span></a></div><div className="cart-panel"><div className="cart-heading"><div><p className="form-kicker">YOUR CART</p><h3>{cartCount ? `${cartCount} item${cartCount === 1 ? '' : 's'} selected` : 'Your cart is empty'}</h3></div>{cartCount > 0 && <button className="clear-cart" onClick={() => setCart([])}>Clear cart</button>}</div>{cart.length === 0 ? <p className="empty-cart">Choose something from the menu and it will appear here.</p> : <><div className="cart-items">{cart.map(({ product, quantity }) => <div className="cart-item" key={product.id}><img src={product.image_url || 'https://placehold.co/120x120/f5eddf/20322a?text=Breakfast'} alt=""/><div><strong>{product.name}</strong><span>{money(product.price)} each</span></div><div className="quantity"><button aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)}>−</button><b>{quantity}</b><button aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(product.id, 1)}>+</button></div><strong>{money(Number(product.price) * quantity)}</strong></div>)}</div><div className="total"><span>Total amount</span><strong>{money(cartTotal)}</strong></div><a className="button form-button" href="#checkout">Continue to checkout <span>→</span></a></>}</div></section>
      <section className="registration" id="checkout"><div className="registration-intro"><p className="eyebrow">FAST & SIMPLE</p><h2>Your breakfast<br/>is almost ready.</h2><p>Share your details, review the cart, and send your order to the Breakfast Center.</p><div className="steps"><span className="active">01 <b>Your details</b></span><span className="active">02 <b>Place order</b></span></div></div><div className="form-panel"><form onSubmit={submitOrder}><p className="form-kicker">CHECKOUT <span>SECURE ORDER</span></p><h3>Tell us about you.</h3><label>Department<select required value={profile.department} onChange={event => setProfile({ ...profile, department: event.target.value })}><option value="">Select your department</option><option>Customer Service</option><option>Sales</option><option>Operations</option><option>Finance</option><option>Human Resources</option></select></label><label>Email address<input required type="email" placeholder="you@example.com" value={profile.email} onChange={event => setProfile({ ...profile, email: event.target.value })}/></label><label>Your name<input required placeholder="Enter your name" value={profile.name} onChange={event => setProfile({ ...profile, name: event.target.value })}/></label><div className="total"><span>Cart total ({cartCount} items)</span><strong>{money(cartTotal)}</strong></div>{checkoutStatus && <p className="form-error">{checkoutStatus}</p>}<button className="button form-button" disabled={!cartCount || isSubmitting} type="submit">{isSubmitting ? 'Saving order...' : 'Place order'} <span>→</span></button></form>{orderId && <div className="success" role="status"><strong>Order received!</strong> Your reference is {String(orderId).slice(0, 8)}.</div>}</div></section>
    </main>
    <footer><span className="brand-mark">C</span><p>Comfortable Breakfast Center · A better way to begin.</p><div className="social-links" aria-label="Social media links"><a className="social-link" href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="LinkedIn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452z"/></svg></a><a className="social-link" href="https://wa.me/254706416480" target="_blank" rel="noreferrer" aria-label="WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg></a><a className="social-link" href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a><a className="social-link" href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a></div><a href="tel:+254706416480">+254 706 416 480</a></footer>
  </>
}