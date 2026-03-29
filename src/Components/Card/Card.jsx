import React from 'react'
import { Link } from 'react-router-dom'
import Favorite from '../../assets/favorite.svg'
import FavoriteFilled from '../../assets/favorite-filled.svg'

const Card = ({
  items = [],
  title = 'Fresh recommendations',
  subtitle = '',
  headerAction,
  viewMode = 'grid',
  favorites = new Set(),
  onToggleFavorite,
  onViewItem,
  emptyMessage = 'No listings yet.',
  compact = false,
  aiMode = false,
  aiHintsByItem = {},
}) => {
  return (
    <div className={`py-10 px-4 sm:px-8 md:px-12 lg:px-20 ${compact ? '' : 'min-h-screen'}`}>
      {title ? (
        <div className="section-header">
          <div>
            <h1 className="section-title">{title}</h1>
            {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
          </div>
          {headerAction ? <div>{headerAction}</div> : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="empty-state">
          <p>{emptyMessage}</p>
        </div>
      ) : null}

      <div className={`grid gap-5 pt-5 ${viewMode === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
        {items.map((item) => {
          const cover =
            (Array.isArray(item.images) ? item.images[0] : item.imageUrl) ||
            (Array.isArray(item.imageUrls) ? item.imageUrls[0] : '') ||
            'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80'
          const displayPrice = (() => {
            const p = String(item.price ?? '')
            return p.includes('/-') ? p : `${p}/-`
          })()
          const date = item.createAt || item.createdAt || ''
          return (
            <Link
              to={`/details/${item.id || ''}`}
              state={{ item }}
              key={item.id}
              onClick={() => onViewItem?.(item)}
              className="product-card hover-card"
            >
              <div className="product-media">
                <img src={cover} alt={item.title} loading="lazy" />
                <div className="product-glow" />
                <div className="product-chip">{item.category || 'Listing'}</div>
                <div className="product-price">Rs {displayPrice}</div>
                <button
                  className={`favorite-btn ${favorites.has(item.id) ? 'active' : ''}`}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onToggleFavorite?.(item)
                  }}
                  aria-label="Save item"
                >
                  <img className="w-4 h-4" src={favorites.has(item.id) ? FavoriteFilled : Favorite} alt="" />
                </button>
              </div>
              <div className="product-body">
                <p className="product-title line-clamp-1">{item.title}</p>
                <p className="product-desc line-clamp-2">{item.description}</p>
                <div className="product-meta">
                  <span className="product-author">{item.userName || 'Seller'}</span>
                  <span className="dot">•</span>
                  <span className="product-date">{date}</span>
                </div>
                {aiMode && aiHintsByItem?.[item.id] ? (
                  <div className="product-hints">
                    <span className={`ai-mini-chip ${aiHintsByItem[item.id].dealTag}`}>
                      {aiHintsByItem[item.id].dealTag}
                    </span>
                    <span className="ai-mini-chip trust">Trust {aiHintsByItem[item.id].trustScore}</span>
                  </div>
                ) : null}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default Card
