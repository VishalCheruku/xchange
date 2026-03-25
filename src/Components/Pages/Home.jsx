import React, { useEffect, useMemo, useState, useDeferredValue } from 'react'
import Navbar from '../Navbar/Navbar'
import Login from '../Modal/Login'
import Sell from '../Modal/Sell'
import Card from '../Card/Card'
import { ItemsContext } from '../Context/Item'
import { auth } from '../Firebase/Firebase'
import { useAuthState } from 'react-firebase-hooks/auth'


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
  const [user] = useAuthState(auth)

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

  const recommendations = filteredItems.length > 0 ? filteredItems : latestItems

  const recentItems = useMemo(() => {
    const items = itemsCtx.items || []
    const byId = new Map(items.map((item) => [item.id, item]))
    return recentIds.map((id) => byId.get(id)).filter(Boolean)
  }, [itemsCtx.items, recentIds])

  const clearRecentlyViewed = () => {
    setRecentIds([])
  }


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
            <a href="#listings" className="xchange-btn ghost">
              Explore listings
            </a>
          </div>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="stat-card">
              <p className="stat-title">Active listings</p>
              <p className="stat-value">{filteredItems.length}</p>
            </div>
            <div className="stat-card">
              <p className="stat-title">Categories</p>
              <p className="stat-value">{Math.max(categories.length - 1, 6)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-title">Favorites</p>
              <p className="stat-value">{favoriteIds.length}</p>
            </div>
            <div className="stat-card">
              <p className="stat-title">New today</p>
              <p className="stat-value">{filteredItems.filter((item) => getDateValue(item) > Date.now() - 86400000).length}</p>
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
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`chip ${selectedCategory === cat ? 'chip-active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>
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
          <div className="control">
            <label>View</label>
            <div className="view-toggle">
              <button onClick={() => setViewMode('grid')} className={viewMode === 'grid' ? 'active' : ''}>Grid</button>
              <button onClick={() => setViewMode('list')} className={viewMode === 'list' ? 'active' : ''}>List</button>
            </div>
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
                <div key={it.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition">
                  <div className="h-32 bg-slate-100 flex items-center justify-center overflow-hidden">
                    <img src={it.imageUrl || 'https://via.placeholder.com/150'} alt={it.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-3 text-left">
                    <p className="text-sm text-slate-500 uppercase tracking-wide">{it.category}</p>
                    <p className="font-semibold text-slate-900 line-clamp-2">{it.title}</p>
                    <p className="text-slate-700 font-bold mt-1">Rs {it.price}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Home
