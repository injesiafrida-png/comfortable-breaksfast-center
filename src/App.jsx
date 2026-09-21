import { useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigError } from './lib/supabaseClient'

const fallbackProducts = [
  { id: 1, name: 'Chapati', price: 20, description: 'Fresh from the pan', image_url: 'https://images.unsplash.com/photo-1601050690597-df0568b70950?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 2, name: 'Cakes', price: 80, description: 'A sweet morning treat', image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 3, name: 'Corns', price: 30, description: 'Golden and roasted', image_url: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 4, name: 'Bread', price: 20, description: 'Soft, warm, daily baked', image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 5, name: 'Eggs', price: 50, description: 'Sunny and satisfying', image_url: 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=900&q=85', created_at: '' },
  { id: 6, name: 'Mandazi', price: 10, description: 'Pillowy Kenyan classic', image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85', created_at: '' },
]

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
      : 'Loading live products from Supabase. Showing the six-item menu until the connection succeeds…'
  )
  const [profile, setProfile] = useState({ department: '', email: '', name: '' })
  const [checkoutStatus, setCheckoutStatus] = useState('')
  const [orderId, setOrderId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.from('products').select('id, name, price, description, image_url, created_at').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        if (error) { setStatus(`Supabase could not load products: ${error.message}. Showing the six-item menu instead.`); return }
        if (!data?.length) { setStatus('Supabase connected, but no products were found. Showing the six-item menu instead.'); return }
        setProducts(data)
        setStatus('')
      })
    return () => { active = false }
  }, [])

  const categories = useMemo(() => ['All', ...new Set(products.map(categoryFor))], [products])
  const filteredProducts = useMemo(() => products.filter(product => {
    const searchText = `${product.name} ${product.description || ''}`.toLowerCase()
    return (category === 'All' || categoryFor(product) === category) && searchText.includes(query.trim().toLowerCase())
  }), [products, category, query])
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0)
  const cartTotal = cart.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0)

  const addToCart = product => {
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
    const { data, error } = await supabase.rpc('place_order', {
      p_customer_name: profile.name,
      p_customer_email: profile.email,
      p_department: profile.department,
      p_items: cart.map(item => ({ product_id: item.product.id, quantity: item.quantity })),
    })
    setIsSubmitting(false)
    if (error) { setCheckoutStatus(`We couldn't save this order: ${error.message}`); return }
    setOrderId(data)
    setCart([])
  }

  return <>
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">C</span><span>Comfortable<br/><b>Breakfast Center</b></span></a><nav><a href="#menu">Menu</a><a href="#cart">Your cart {cartCount ? `(${cartCount})` : ''}</a><a className="hotline" href="tel:+254706416480">Call +254 706 416 480</a></nav></header>
    <main id="top">
      <section className="hero"><div className="hero-copy"><p className="eyebrow">YOUR MORNING, MADE COMFORTABLE</p><h1>Small comforts.<br/><em>Big</em> breakfasts.</h1><p className="hero-text">A bright, delicious start is waiting. Pick your favourite breakfast bite and add it to your cart in a few easy steps.</p><a className="button" href="#menu">Explore the menu <span>→</span></a></div><div className="hero-art"><div className="sun"/><div className="plate"><span>☕</span><i/><b/></div><div className="hero-note">Open for the<br/><strong>morning rush</strong></div></div></section>
      <section className="menu-section" id="menu"><div className="section-heading"><div><p className="eyebrow">OUR BREAKFAST MENU</p><h2>Made for an easy morning.</h2></div><label className="search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a breakfast..." aria-label="Search menu" /></label></div><div className="category-menu" aria-label="Product categories">{categories.map(item => <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>{status && <div className="not-found" role="status">{status}</div>}{!status && !filteredProducts.length && <div className="not-found">No breakfast found. Try another search or category.</div>}<div className="menu-grid">{filteredProducts.map((product, index) => <article className={`card ${selected?.id === product.id ? 'selected' : ''}`} key={product.id} style={{ '--delay': `${index * 50}ms` }} onClick={() => setSelected(product)}><div className="photo"><img src={product.image_url || 'https://placehold.co/900x600/f5eddf/20322a?text=Breakfast'} alt={product.name}/><span>{categoryFor(product)}</span></div><div className="card-body"><div><button className="product-name" onClick={() => setSelected(product)}>{product.name}</button><p className="product-description">{product.description || 'Prepared fresh for your morning.'}</p>{product.created_at && <time className="product-meta" dateTime={product.created_at}>Added {new Date(product.created_at).toLocaleDateString()}</time>}</div><div className="card-actions"><strong>{money(product.price)}</strong><button className="add-cart" onClick={event => { event.stopPropagation(); addToCart(product) }}>Add <span>+</span></button></div></div></article>)}</div></section>
      <section className="cart-section" id="cart"><div className="cart-intro"><p className="eyebrow">YOUR SELECTION</p><h2>Good choices,<br/>ready to go.</h2><p>Review your breakfast and adjust quantities before you order.</p><a className="cart-call" href="tel:+254706416480">Call to order <span>→</span></a></div><div className="cart-panel"><div className="cart-heading"><div><p className="form-kicker">YOUR CART</p><h3>{cartCount ? `${cartCount} item${cartCount === 1 ? '' : 's'} selected` : 'Your cart is empty'}</h3></div>{cartCount > 0 && <button className="clear-cart" onClick={() => setCart([])}>Clear cart</button>}</div>{cart.length === 0 ? <p className="empty-cart">Choose something from the menu and it will appear here.</p> : <><div className="cart-items">{cart.map(({ product, quantity }) => <div className="cart-item" key={product.id}><img src={product.image_url || 'https://placehold.co/120x120/f5eddf/20322a?text=Breakfast'} alt=""/><div><strong>{product.name}</strong><span>{money(product.price)} each</span></div><div className="quantity"><button aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)}>−</button><b>{quantity}</b><button aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(product.id, 1)}>+</button></div><strong>{money(Number(product.price) * quantity)}</strong></div>)}</div><div className="total"><span>Total amount</span><strong>{money(cartTotal)}</strong></div><a className="button form-button" href="#checkout">Continue to checkout <span>→</span></a></>}</div></section>
      <section className="registration" id="checkout"><div className="registration-intro"><p className="eyebrow">FAST & SIMPLE</p><h2>Your breakfast<br/>is almost ready.</h2><p>Share your details, review the cart, and send your order to the Breakfast Center.</p><div className="steps"><span className="active">01 <b>Your details</b></span><span className="active">02 <b>Place order</b></span></div></div><div className="form-panel"><form onSubmit={submitOrder}><p className="form-kicker">CHECKOUT <span>SECURE ORDER</span></p><h3>Tell us about you.</h3><label>Department<select required value={profile.department} onChange={event => setProfile({ ...profile, department: event.target.value })}><option value="">Select your department</option><option>Customer Service</option><option>Sales</option><option>Operations</option><option>Finance</option><option>Human Resources</option></select></label><label>Email address<input required type="email" placeholder="you@example.com" value={profile.email} onChange={event => setProfile({ ...profile, email: event.target.value })}/></label><label>Your name<input required placeholder="Enter your name" value={profile.name} onChange={event => setProfile({ ...profile, name: event.target.value })}/></label><div className="total"><span>Cart total ({cartCount} items)</span><strong>{money(cartTotal)}</strong></div>{checkoutStatus && <p className="form-error">{checkoutStatus}</p>}<button className="button form-button" disabled={!cartCount || isSubmitting} type="submit">{isSubmitting ? 'Saving order...' : 'Place order'} <span>→</span></button></form>{orderId && <div className="success" role="status"><strong>Order received!</strong> Your reference is {String(orderId).slice(0, 8)}.</div>}</div></section>
    </main>
    <footer><span className="brand-mark">C</span><p>Comfortable Breakfast Center · A better way to begin.</p><a href="tel:+254706416480">+254 706 416 480</a></footer>
  </>
}
