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

      <div className={`grid gap-4 pt-5 ${viewMode === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
        {items.map((item) => (
          <Link
            to={`/details/${item.id || ''}`}
            state={{ item }}
            key={item.id}
            onClick={() => onViewItem?.(item)}
            className="hover-card"
            style={{ borderWidth: '1px', borderColor: 'lightgrey' }}
          >
            <div
              key={item.id}
              style={{ borderWidth: '1px', borderColor: 'lightgray' }}
              className={`relative w-full ${viewMode === 'list' ? 'h-auto' : 'h-72'} rounded-md border-solid bg-gray-50 overflow-hidden cursor-pointer`}
            >
              <div className={`w-full flex justify-center p-2 overflow-hidden ${viewMode === 'list' ? 'md:w-1/3 md:h-full md:absolute md:left-0 md:top-0' : ''}`}>
                <img
                  className={`${viewMode === 'list' ? 'h-36 md:h-full md:object-cover w-full' : 'h-36 object-contain'}`}
                  src={item.imageUrl || 'https://via.placeholder.com/150'}
                  alt={item.title}
                />
              </div>

              <div className={`details p-1 pl-4 pr-4 ${viewMode === 'list' ? 'md:pl-[36%] md:py-6' : ''}`}>
                <h1 className="font-bold text-xl text-slate-900">Rs {item.price}</h1>
                <p className="text-sm pt-2 text-slate-500">{item.category}</p>
                <p className="pt-2 font-semibold text-slate-800">{item.title}</p>
                <p className="pt-1 text-xs text-slate-500 line-clamp-2">{item.description}</p>

                <button
                  className={`absolute flex justify-center items-center p-2 bg-white rounded-full top-3 right-3 cursor-pointer shadow-sm ${favorites.has(item.id) ? 'ring-2 ring-cyan-300' : ''}`}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onToggleFavorite?.(item)
                  }}
                  aria-label="Save item"
                >
                  <img
                    className={`w-5 ${favorites.has(item.id) ? 'scale-110' : ''}`}
                    src={favorites.has(item.id) ? FavoriteFilled : Favorite}
                    alt=""
                  />
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default Card
