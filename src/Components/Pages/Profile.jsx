import { useEffect, useMemo, useState } from 'react'
import Navbar from '../Navbar/Navbar'
import Login from '../Modal/Login'
import Sell from '../Modal/Sell'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth, fireStore } from '../Firebase/Firebase'
import { updateProfile } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { ItemsContext } from '../Context/Item'
import { collection, onSnapshot, query, where } from 'firebase/firestore'

const STORAGE_KEY = 'xchange_profile_extra'

const Profile = () => {
  const [user] = useAuthState(auth)
  const navigate = useNavigate()
  const [openModal, setModal] = useState(false)
  const [openModalSell, setModalSell] = useState(false)
  const [status, setStatus] = useState('')
  const itemsCtx = ItemsContext()
  const [offersMade, setOffersMade] = useState([])

  const toggleModal = () => setModal((prev) => !prev)
  const toggleModalSell = () => setModalSell((prev) => !prev)

  const stored = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY) || '{}'
    try { return JSON.parse(raw) } catch { return {} }
  }, [])

  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [location, setLocation] = useState(stored[user?.uid || '']?.location || '')
  const [bio, setBio] = useState(stored[user?.uid || '']?.bio || '')
  const [phone, setPhone] = useState(stored[user?.uid || '']?.phone || '')

  useEffect(() => {
    setDisplayName(user?.displayName || '')
    const latestRaw = localStorage.getItem(STORAGE_KEY) || '{}'
    let latest = {}
    try { latest = JSON.parse(latestRaw) } catch { latest = {} }
    const extras = latest[user?.uid || ''] || {}
    setLocation(extras.location || '')
    setBio(extras.bio || '')
    setPhone(extras.phone || '')
  }, [user?.displayName, user?.uid])

  useEffect(() => {
    if (!user?.uid) { setOffersMade([]); return }
    const q = query(collection(fireStore, 'offers'), where('buyerId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      setOffersMade(list)
    })
    return () => unsub()
  }, [user?.uid])

  const persistExtras = (payload) => {
    const latestRaw = localStorage.getItem(STORAGE_KEY) || '{}'
    let latest = {}
    try { latest = JSON.parse(latestRaw) } catch { latest = {} }
    const next = { ...latest, [user.uid]: payload }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!user) {
      setStatus('Please sign in to update your profile.')
      setModal(true)
      return
    }
    setStatus('Saving...')
    try {
      if (displayName && displayName !== user.displayName) {
        await updateProfile(user, { displayName })
      }
      persistExtras({ location, bio, phone })
      setStatus('Profile updated.')
    } catch (err) {
      console.error(err)
      setStatus('Could not update profile. Try again.')
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
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Profile</p>
            <h1 className="mt-4 text-4xl font-extrabold text-slate-900">Sign in to edit your profile</h1>
            <p className="mt-3 text-slate-600 max-w-xl">
              Access profile settings, update your name, and keep your contact details handy for buyers.
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

  const myListings = useMemo(() => {
    const items = itemsCtx.items || []
    const uid = user?.uid
    if (!uid) return []
    return items.filter((it) => it.userId === uid)
  }, [itemsCtx.items, user?.uid])

  return (
    <div>
      <Navbar toggleModal={toggleModal} toggleModalSell={toggleModalSell} />
      <Login toggleModal={toggleModal} status={openModal} />
      <Sell setItems={(itemsCtx).setItems} toggleModalSell={toggleModalSell} status={openModalSell} />

      <section className="pt-32 pb-12 px-5 sm:px-12 md:px-20 lg:px-32">
        <div className="grid gap-6 md:grid-cols-[1fr_0.7fr] items-start">
          <div className="xchange-hero text-left">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Profile</p>
            <h1 className="mt-4 text-4xl font-extrabold text-slate-900">Account settings</h1>
            <p className="mt-3 text-slate-600 max-w-2xl">
              Update your display name and keep optional contact details ready for smoother handoffs with buyers.
            </p>
            <form className="mt-6 grid gap-4" onSubmit={handleSave}>
              <label className="control">
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </label>
              <label className="control">
                Location
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City / area"
                />
              </label>
              <label className="control">
                Phone (optional)
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Contact number"
                />
              </label>
              <label className="control">
                Bio
                <textarea
                  className="min-h-[100px] p-3 rounded-xl border border-slate-200 text-sm text-slate-800"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="What are you trading or looking for?"
                />
              </label>
              <div className="flex items-center gap-3">
                <button type="submit" className="xchange-btn">Save changes</button>
                {status && <span className="text-sm text-slate-600">{status}</span>}
              </div>
            </form>
          </div>

          <div className="hero-panel">
            <div className="hero-card">
              <h3 className="text-xl font-semibold text-slate-900">Profile snapshot</h3>
              <div className="mt-4 flex items-center gap-4">
                <div className="avatar-circle text-lg">{(displayName || user.email || 'U').charAt(0).toUpperCase()}</div>
                <div className="text-left">
                  <p className="summary-name">{displayName || 'Guest'}</p>
                  <p className="summary-email">{user.email}</p>
                  {location && <p className="text-sm text-slate-600 mt-1">{location}</p>}
                </div>
              </div>
              {bio && <p className="mt-3 text-slate-700 text-sm">{bio}</p>}
              {phone && <p className="mt-2 text-slate-600 text-sm">Contact: {phone}</p>}
            </div>
            <div className="hero-card">
              <h3 className="text-xl font-semibold text-slate-900">Tips for buyers</h3>
              <ul className="mt-3 list-disc list-inside text-slate-600 text-sm space-y-1">
                <li>Keep messages inside Xchange until you confirm a deal.</li>
                <li>Share pickup location only after initial agreement.</li>
                <li>Mark favorites to revisit listings faster.</li>
              </ul>
            </div>
            <div className="hero-card">
              <h3 className="text-xl font-semibold text-slate-900">Offers you made</h3>
              {offersMade.length === 0 ? (
                <p className="text-sm text-slate-600 mt-2">No offers yet.</p>
              ) : (
                <div className="mt-3 space-y-3 max-h-64 overflow-y-auto pr-1">
                  {offersMade.map((offer) => (
                    <div key={offer.id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{offer.itemTitle || 'Listing'}</p>
                        <p className="text-xs text-slate-500 truncate">Rs {offer.amount} • {offer.status}</p>
                      </div>
                      {offer.itemImage ? (
                        <img src={offer.itemImage} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="hero-card">
              <h3 className="text-xl font-semibold text-slate-900">My listings</h3>
              {myListings.length === 0 ? (
                <p className="text-sm text-slate-600 mt-2">You have not listed anything yet.</p>
              ) : (
                <div className="mt-3 space-y-3 max-h-64 overflow-y-auto pr-1">
                  {myListings.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => navigate(`/details/${it.id}`, { state: { item: it } })}
                      className="w-full text-left flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2 hover:border-sky-300 hover:shadow-sm transition"
                    >
                      { (it.images?.[0] || it.imageUrl) ? <img src={it.images?.[0] || it.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200" /> : null}
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{it.title || 'Listing'}</p>
                        <p className="text-xs text-slate-500 truncate">{it.category || 'Uncategorized'} • Rs {it.price}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Profile
