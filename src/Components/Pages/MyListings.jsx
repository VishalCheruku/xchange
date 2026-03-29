import { useEffect, useMemo, useState } from 'react'
import Navbar from '../Navbar/Navbar'
import Login from '../Modal/Login'
import Sell from '../Modal/Sell'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth, fireStore } from '../Firebase/Firebase'
import { useNavigate } from 'react-router-dom'
import { ItemsContext } from '../Context/Item'
import { deleteDoc, doc } from 'firebase/firestore'

const MyListings = () => {
  const [user] = useAuthState(auth)
  const navigate = useNavigate()
  const [openModal, setModal] = useState(false)
  const [openModalSell, setModalSell] = useState(false)
  const [status, setStatus] = useState('')
  const itemsCtx = ItemsContext()
  const [deletingId, setDeletingId] = useState(null)

  const toggleModal = () => setModal((prev) => !prev)
  const toggleModalSell = () => setModalSell((prev) => !prev)

  const myListings = useMemo(() => {
    const items = itemsCtx.items || []
    const uid = user?.uid
    if (!uid) return []
    return items.filter((it) => it.userId === uid)
  }, [itemsCtx.items, user?.uid])

  const handleDeleteListing = async (itemId) => {
    if (!itemId) return
    if (!window.confirm('Are you sure you want to delete this listing?')) return
    
    try {
      setDeletingId(itemId)
      // Delete from Firebase Firestore
      await deleteDoc(doc(fireStore, 'items', itemId))
      setStatus('Listing deleted successfully.')
      setTimeout(() => setStatus(''), 3000)
    } catch (err) {
      console.error(err)
      setStatus('Failed to delete listing. Try again.')
      setTimeout(() => setStatus(''), 3000)
    } finally {
      setDeletingId(null)
    }
  }

  if (!user) {
    return (
      <div>
        <Navbar toggleModal={toggleModal} toggleModalSell={toggleModalSell} />
        <Login toggleModal={toggleModal} status={openModal} />
        <Sell setItems={(itemsCtx).setItems} toggleModalSell={toggleModalSell} status={openModalSell} />
        <section className="pt-32 pb-12 px-5 sm:px-12 md:px-20 lg:px-32">
          <div className="xchange-hero text-left">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">My Listings</p>
            <h1 className="mt-4 text-4xl font-extrabold text-slate-900">Sign in to view your listings</h1>
            <p className="mt-3 text-slate-600 max-w-xl">
              Access your active listings and manage your items for sale.
            </p>
            <div className="mt-6 flex gap-3">
              <button className="xchange-btn" onClick={toggleModal}>Sign in</button>
              <button className="xchange-btn ghost" onClick={() => navigate('/')}>Back to home</button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div>
      <Navbar toggleModal={toggleModal} toggleModalSell={toggleModalSell} />
      <Login toggleModal={toggleModal} status={openModal} />
      <Sell setItems={(itemsCtx).setItems} toggleModalSell={toggleModalSell} status={openModalSell} />

      <section className="pt-32 pb-12 px-5 sm:px-12 md:px-20 lg:px-32">
        <div className="xchange-hero text-left mb-8">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Your Items</p>
          <h1 className="mt-4 text-4xl font-extrabold text-slate-900">My Listings</h1>
          <p className="mt-3 text-slate-600 max-w-2xl">
            Manage and view all your active listings. Click on any item to see details.
          </p>
          <div className="flex items-center gap-3 mt-6">
            <button className="xchange-btn" onClick={toggleModalSell}>Add new listing</button>
            {status && <span className="text-sm text-slate-600">{status}</span>}
          </div>
        </div>

        {myListings.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600 text-lg mb-4">You haven't listed anything yet.</p>
            <button className="xchange-btn" onClick={toggleModalSell}>Create your first listing</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {myListings.map((item) => (
              <div
                key={item.id}
                className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-lg transition bg-white"
              >
                {/* Image Section */}
                <div className="relative w-full h-48 bg-slate-100 overflow-hidden">
                  {(item.images?.[0] || item.imageUrl) ? (
                    <img
                      src={item.images?.[0] || item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition"
                      onClick={() => navigate(`/details/${item.id}`, { state: { item } })}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full bg-slate-200">
                      <span className="text-slate-500">No image</span>
                    </div>
                  )}
                  <span className="absolute top-3 right-3 bg-sky-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Rs {item.price}
                  </span>
                </div>

                {/* Content Section */}
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 text-lg mb-2 truncate">{item.title || 'Untitled'}</h3>
                  <p className="text-sm text-slate-600 mb-3">
                    <span className="font-medium">{item.category || 'Uncategorized'}</span>
                  </p>
                  
                  {item.description && (
                    <p className="text-sm text-slate-700 mb-3 line-clamp-2">
                      {item.description}
                    </p>
                  )}

                  {item.location && (
                    <p className="text-xs text-slate-500 mb-4">
                      📍 {item.location}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/details/${item.id}`, { state: { item } })}
                      className="flex-1 px-3 py-2 text-sm font-medium text-sky-600 border border-sky-300 rounded-md hover:bg-sky-50 transition"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDeleteListing(item.id)}
                      disabled={deletingId === item.id}
                      className="px-3 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {deletingId === item.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default MyListings
