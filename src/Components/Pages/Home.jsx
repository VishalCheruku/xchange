import React, { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../Navbar/Navbar'
import Login from '../Modal/Login'
import Sell from '../Modal/Sell'
import Card from '../Card/Card'
import { ItemsContext } from '../Context/Item'
import { auth, fireStore } from '../Firebase/Firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useAIMode } from '../Context/AIMode'


const Home = () => {
  const[openModal,setModal] = useState(false)
  const [openModalSell ,setModalSell] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [sortKey, setSortKey] = useState('latest')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const [viewMode, setViewMode] = useState('grid')
  const [favModal, setFavModal] = useState(false)
  const [offerItemIds, setOfferItemIds] = useState(new Set())
  const [user] = useAuthState(auth)
  const {
    aiModeEnabled,
    toggleAIMode,
    getAdaptiveProfile,
    rankListingsForProfile,
    trackAdaptiveInteraction,
  } = useAIMode()
  const [adaptiveProfile, setAdaptiveProfile] = useState(null)
  const [personalizedRecommendations, setPersonalizedRecommendations] = useState(null)
  const interactionThrottleRef = useRef(new Map())

  const toggleModal = ()=>{setModal(!openModal)}
  const toggleModalSell = () => {setModalSell(!openModalSell)}

  const itemsCtx =ItemsContext();//refers to the context value;

  const [favoriteIds, setFavoriteIds] = useState(() => {
    const stored = JSON.parse(localStorage.getItem('xchange_favorites') || '[]')
    return Array.isArray(stored) ? stored : []
  })

  const [recentIds, setRecentIds] = useState(() => {
    const stored = JSON.parse(localStorage.getItem('xchange_recent') || '[]')
    return Array.isArray(stored) ? stored : []
  })

  useEffect(() => {
    localStorage.setItem('xchange_favorites', JSON.stringify(favoriteIds))
  }, [favoriteIds])

  useEffect(() => {
    localStorage.setItem('xchange_recent', JSON.stringify(recentIds))
  }, [recentIds])

  // Track items that have offers so active listing count can exclude them
  useEffect(() => {
    const offersRef = collection(fireStore, 'offers')
    const unsub = onSnapshot(offersRef, (snap) => {
      const ids = new Set(snap.docs.map((d) => d.data()?.itemId).filter(Boolean))
      setOfferItemIds(ids)
    })
    return () => unsub()
  }, [])

  const categories = useMemo(() => {
    const items = itemsCtx.items || []
    const unique = Array.from(new Set(items.map((item) => item.category).filter(Boolean)))
    return ['All', ...unique].slice(0, 12)
  }, [itemsCtx.items])

  const parsePrice = (value) => {
    const parsed = Number(String(value || '').replace(/[^\d.]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }

  const getDateValue = (item) => {
    const raw = item?.createAt || item?.createdAt || ''
    const parsed = new Date(raw).getTime()
    return Number.isFinite(parsed) ? parsed : 0
  }

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds])
  const favoriteItems = useMemo(() => {
    const items = itemsCtx.items || []
    return items.filter((it) => favoriteSet.has(it.id))
  }, [itemsCtx.items, favoriteSet])

  const toggleFavorite = (item) => {
    if (!item?.id) return
    setFavoriteIds((prev) => {
      const exists = prev.includes(item.id)
      if (!exists && aiModeEnabled && user?.uid) {
        const key = `favorite:${item.id}`
        const now = Date.now()
        const lastAt = interactionThrottleRef.current.get(key) || 0
        if (now - lastAt > 15000) {
          interactionThrottleRef.current.set(key, now)
          trackAdaptiveInteraction({
            userId: user.uid,
            interactionType: 'favorite',
            listing: {
              id: item.id,
              category: item.category,
              price: item.price,
            },
          }).then((profile) => {
            if (profile) setAdaptiveProfile(profile)
          })
        }
      }
      if (exists) return prev.filter((id) => id !== item.id)
      return [item.id, ...prev].slice(0, 50)
    })
  }

  const trackRecent = (item) => {
    if (!item?.id) return
    setRecentIds((prev) => {
      const next = [item.id, ...prev.filter((id) => id !== item.id)]
      return next.slice(0, 12)
    })
    if (aiModeEnabled && user?.uid) {
      const key = `view:${item.id}`
      const now = Date.now()
      const lastAt = interactionThrottleRef.current.get(key) || 0
      if (now - lastAt > 12000) {
        interactionThrottleRef.current.set(key, now)
        trackAdaptiveInteraction({
          userId: user.uid,
          interactionType: 'view',
          listing: {
            id: item.id,
            category: item.category,
            price: item.price,
          },
        }).then((profile) => {
          if (profile) setAdaptiveProfile(profile)
        })
      }
    }
  }

  const deferredSearch = useDeferredValue(searchQuery)

  const filteredItems = useMemo(() => {
    const items = itemsCtx.items || []
    const query = deferredSearch.trim().toLowerCase()
    const locality = ''
    let list = items

    if (query) {
      list = list.filter((item) => {
        const haystack = `${item.title || ''} ${item.category || ''} ${item.description || ''}`.toLowerCase()
        return haystack.includes(query)
      })
    }

    if (selectedCategory !== 'All') {
      list = list.filter((item) => item.category === selectedCategory)
    }

    const min = parsePrice(minPrice)
    const max = parsePrice(maxPrice)
    if (min !== null) list = list.filter((item) => (parsePrice(item.price) ?? 0) >= min)
    if (max !== null) list = list.filter((item) => (parsePrice(item.price) ?? 0) <= max)

    if (showFavorites) {
      list = list.filter((item) => favoriteSet.has(item.id))
    }

    if (sortKey === 'price_low') {
      list = [...list].sort((a, b) => (parsePrice(a.price) ?? 0) - (parsePrice(b.price) ?? 0))
    } else if (sortKey === 'price_high') {
      list = [...list].sort((a, b) => (parsePrice(b.price) ?? 0) - (parsePrice(a.price) ?? 0))
    } else if (sortKey === 'alpha') {
      list = [...list].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
    } else {
      list = [...list].sort((a, b) => getDateValue(b) - getDateValue(a))
    }

    return list
  }, [
    itemsCtx.items,
    searchQuery,
    selectedCategory,
    minPrice,
    maxPrice,
    showFavorites,
    sortKey,
    favoriteSet,
  ])

  const latestItems = useMemo(() => {
    const items = itemsCtx.items || []
    return [...items].sort((a, b) => getDateValue(b) - getDateValue(a))
  }, [itemsCtx.items])

  const newTodayCount = useMemo(() => {
    const items = itemsCtx.items || []
    return items.filter((it) => getDateValue(it) > Date.now() - 86400000).length
  }, [itemsCtx.items])

  const activeCount = useMemo(() => {
    const items = itemsCtx.items || []
    return Math.max(0, items.length - offerItemIds.size)
  }, [itemsCtx.items, offerItemIds])

  const baseRecommendations = filteredItems.length > 0 ? filteredItems : latestItems
  const recommendations = personalizedRecommendations?.length ? personalizedRecommendations : baseRecommendations

  const aiHintsByItem = useMemo(() => {
    if (!aiModeEnabled) return {}
    const bucket = {}
    const byCategory = new Map()
    const items = itemsCtx.items || []

    items.forEach((entry) => {
      if (!entry?.category) return
      const price = Number(String(entry.price || '').replace(/[^\d.]/g, ''))
      if (!Number.isFinite(price) || price <= 0) return
      if (!byCategory.has(entry.category)) byCategory.set(entry.category, [])
      byCategory.get(entry.category).push(price)
    })

    const medians = new Map()
    byCategory.forEach((prices, category) => {
      const sorted = [...prices].sort((a, b) => a - b)
      medians.set(category, sorted[Math.floor(sorted.length / 2)] || null)
    })

    items.forEach((entry) => {
      const price = Number(String(entry.price || '').replace(/[^\d.]/g, ''))
      const median = medians.get(entry.category)
      if (!Number.isFinite(price) || !Number.isFinite(median) || median <= 0) return
      const ratio = price / median
      const dealTag = ratio < 0.88 ? 'underpriced' : ratio > 1.12 ? 'overpriced' : 'fair'
      const trustScore = Math.max(
        30,
        Math.min(
          96,
          45 + Math.min((entry.description || '').length, 120) / 3 + (entry.userName ? 10 : 0),
        ),
      )
      bucket[entry.id] = { dealTag, trustScore: Math.round(trustScore) }
    })

    return bucket
  }, [aiModeEnabled, itemsCtx.items])

  const recentItems = useMemo(() => {
    const items = itemsCtx.items || []
    const byId = new Map(items.map((item) => [item.id, item]))
    return recentIds.map((id) => byId.get(id)).filter(Boolean)
  }, [itemsCtx.items, recentIds])

  const clearRecentlyViewed = () => {
    setRecentIds([])
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!aiModeEnabled || !user?.uid) {
        setAdaptiveProfile(null)
        return
      }
      const profile = await getAdaptiveProfile(user.uid)
      if (!cancelled && profile) {
        setAdaptiveProfile(profile)
      }
    }
    run().catch((error) => console.warn('Adaptive profile fetch failed:', error))
    return () => {
      cancelled = true
    }
  }, [aiModeEnabled, user?.uid, getAdaptiveProfile])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!aiModeEnabled || !user?.uid || baseRecommendations.length === 0) {
        setPersonalizedRecommendations(null)
        return
      }
      const payloadListings = baseRecommendations.slice(0, 120).map((item) => ({
        id: item.id,
        title: item.title,
        category: item.category,
        price: item.price,
        description: item.description,
        imageUrl: item.imageUrl,
        createAt: item.createAt,
        createdAt: item.createdAt,
      }))
      const ranked = await rankListingsForProfile({
        userId: user.uid,
        listings: payloadListings,
      })
      if (cancelled) return
      const rankedList = Array.isArray(ranked?.rankedListings) ? ranked.rankedListings : []
      if (rankedList.length === 0) {
        setPersonalizedRecommendations(null)
      } else {
        const byId = new Map(baseRecommendations.map((entry) => [entry.id, entry]))
        const merged = rankedList.map((entry) => ({ ...byId.get(entry.id), personalizationScore: entry.personalizationScore })).filter((entry) => entry?.id)
        setPersonalizedRecommendations(merged)
      }
      if (ranked?.profile) setAdaptiveProfile(ranked.profile)
    }
    run().catch((error) => console.warn('Adaptive ranking failed:', error))
    return () => {
      cancelled = true
    }
  }, [aiModeEnabled, user?.uid, baseRecommendations, rankListingsForProfile])


  return (
    <div>
      <Navbar
        toggleModal={toggleModal}
        toggleModalSell={toggleModalSell}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
     <Login  toggleModal={toggleModal}  status={openModal}/>
     <Sell setItems={(itemsCtx).setItems} toggleModalSell={toggleModalSell} status={openModalSell}  />

     <section className="pt-32 pb-10 px-5 sm:px-12 md:px-20 lg:px-32">
      <div className="xchange-hero grid gap-6 md:grid-cols-[1.2fr_0.8fr] items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Xchange Marketplace</p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold leading-tight text-slate-900">
            Buy, sell, and swap with a smarter vibe.
          </h1>
          <p className="mt-4 text-slate-600 max-w-xl">
            Discover curated listings, filter by what matters, and save your favorites. Xchange keeps it fast,
            clean, and all about the good deals.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={toggleModalSell} className="xchange-btn">
              List an item
            </button>
            <button onClick={toggleAIMode} className={`xchange-btn ${aiModeEnabled ? '' : 'ghost'}`}>
              Go AI Mode
            </button>
            <a href="#listings" className="xchange-btn ghost">
              Explore listings
            </a>
          </div>
          {aiModeEnabled ? (
            <p className="mt-4 text-sm text-cyan-700 font-semibold">
              AI Mode is active: chat suggestions, pricing scenarios, and trust signals are now running.
            </p>
          ) : null}
          {aiModeEnabled && adaptiveProfile ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="ai-mini-chip fair">Style: {adaptiveProfile.negotiationStyle || 'balanced'}</span>
              <span className="ai-mini-chip trust">Speed: {adaptiveProfile.responseSpeed || 'normal'}</span>
              <span className="ai-mini-chip trust">Budget: {adaptiveProfile?.pricePreferences?.budgetBand || 'balanced'}</span>
              {(adaptiveProfile?.topCategories || []).slice(0, 2).map((category) => (
                <span key={category} className="ai-mini-chip underpriced">Prefers {category}</span>
              ))}
            </div>
          ) : null}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="stat-card">
              <p className="stat-title">Active listings</p>
              <p className="stat-value">{activeCount}</p>
            </div>
            <div className="stat-card">
              <p className="stat-title">Categories</p>
              <p className="stat-value">{Math.max((categories.length || 1) - 1, 0)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-title">Favorites</p>
              <p className="stat-value">{favoriteIds.length}</p>
            </div>
            <div className="stat-card">
              <p className="stat-title">New today</p>
              <p className="stat-value">{newTodayCount}</p>
            </div>
          </div>
        </div>
        <div className="hero-panel">
          <div className="hero-card">
            <div className="hero-glow" />
            <h3 className="text-xl font-semibold text-slate-900">Smart filters</h3>
            <p className="text-sm text-slate-600 mt-2">
              Narrow listings by category, price, and freshness. Keep only the stuff you actually want to see.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.slice(0, 5).map((cat) => (
                <span key={cat} className="chip">
                  {cat}
                </span>
              ))}
            </div>
          </div>
          <div className="hero-card">
            <h3 className="text-xl font-semibold text-slate-900">Instant saves</h3>
            <p className="text-sm text-slate-600 mt-2">
              Tap the heart to keep a shortlist. Your favorites stay local and ready for later.
            </p>
            <div className="mt-4 flex items-center gap-3 text-sm text-slate-500">
              <span className="pulse-dot" />
              Updates instantly, no reload.
            </div>
          </div>
        </div>
      </div>
     </section>

     <section className="px-5 sm:px-12 md:px-20 lg:px-32">
      <div className="filter-bar" id="listings">
        <div className="filter-controls">
          <div className="control">
            <label>Sort</label>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
              <option value="latest">Latest</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="alpha">A to Z</option>
            </select>
          </div>
          <div className="control">
            <label>Min price</label>
            <input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="0" />
          </div>
          <div className="control">
            <label>Max price</label>
            <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="99999" />
          </div>
          <button onClick={() => setFavModal(true)} className="favorite-toggle">
            View favorites
          </button>
        </div>
      </div>
     </section>

     {recentItems.length > 0 && (
        <Card
          items={recentItems}
          title="Recently viewed"
          subtitle="Jump back to what caught your eye."
          headerAction={
            <button className="favorite-toggle" onClick={clearRecentlyViewed}>
              Clear
            </button>
          }
          viewMode="grid"
          favorites={favoriteSet}
          onToggleFavorite={toggleFavorite}
          onViewItem={trackRecent}
          compact
          aiMode={aiModeEnabled}
          aiHintsByItem={aiHintsByItem}
        />
     )}

      <Card
        items={recommendations}
        title="Fresh recommendations"
        subtitle={filteredItems.length ? "Handpicked by your filters and favorites." : "Latest listings across all categories."}
        viewMode={viewMode}
        favorites={favoriteSet}
        onToggleFavorite={toggleFavorite}
        onViewItem={trackRecent}
        canDelete={(item) => user && item.userId === user.uid}
        onDelete={async (item) => {
          try {
            await itemsCtx.deleteItem(item.id)
          } catch (err) {
            console.error(err)
            alert('Failed to delete. Check your connection and try again.')
          }
        }}
        emptyMessage="No listings match your filters yet. Try loosening the price range or search."
        aiMode={aiModeEnabled}
        aiHintsByItem={aiHintsByItem}
      />

      {favModal && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[80vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Favorites</p>
                <p className="text-xl font-bold text-slate-900">{favoriteItems.length} item{favoriteItems.length === 1 ? '' : 's'}</p>
              </div>
              <button className="favorite-toggle ghost" onClick={() => setFavModal(false)}>Close</button>
            </div>
            <div className="p-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 overflow-auto" style={{ maxHeight: '70vh' }}>
              {favoriteItems.length === 0 ? (
                <p className="text-slate-500">No favorites yet.</p>
              ) : favoriteItems.map((it) => (
                <Link key={it.id} to={`/details/${it.id}`} state={{ item: it }} className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition">
                  <div className="h-32 bg-slate-100 flex items-center justify-center overflow-hidden">
                    <img src={it.imageUrl || (Array.isArray(it.images) ? it.images[0] : '') || 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80'} alt={it.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-3 text-left">
                    <p className="text-sm text-slate-500 uppercase tracking-wide">{it.category}</p>
                    <p className="font-semibold text-slate-900 line-clamp-2">{it.title}</p>
                    <p className="text-slate-700 font-bold mt-1">Rs {String(it.price).includes('/-') ? it.price : `${it.price}/-`}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Home
