import Navbar from "../Navbar/Navbar"
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState, useRef } from "react";
import { ItemsContext } from '../Context/Item';
import Login from "../Modal/Login";
import Sell from "../Modal/Sell";
import Card from "../Card/Card";
import StarRating from "../UI/StarRating";
import { auth, fireStore } from "../Firebase/Firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where, setDoc, serverTimestamp } from "firebase/firestore";
import ChatModal from "../Chat/ChatModal";
import { useAIMode } from "../Context/AIMode";
import DealInsightsPanel from "../AI/DealInsightsPanel";
import TrustBanner from "../AI/TrustBanner";
import { buildUpiQrUrl, DEFAULT_UPI_QR_URL } from "../../utils/payment";

const Details = () => {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const locationItem = (location.state || {}).item;
  const [item, setItem] = useState(locationItem || null);

  const [openModal, setModal] = useState(false);
  const [openModalSell, setModalSell] = useState(false);
  const [saved, setSaved] = useState(false)
  const [offers, setOffers] = useState([])
  const [offerValue, setOfferValue] = useState('')
  const [reviews, setReviews] = useState([])
  const [reviewText, setReviewText] = useState('')
  const [rating, setRating] = useState(5)
  const [showReviews, setShowReviews] = useState(true)
  const [openChat, setOpenChat] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [currentTitle, setCurrentTitle] = useState(item?.title || '')
  const [currentCategory, setCurrentCategory] = useState(item?.category || '')
  const [currentPrice, setCurrentPrice] = useState(item?.price || '')
  const [currentDescription, setCurrentDescription] = useState(item?.description || '')
  const [editTitle, setEditTitle] = useState(item?.title || '')
  const [editCategory, setEditCategory] = useState(item?.category || '')
  const [editPrice, setEditPrice] = useState(item?.price || '')
  const [editDescription, setEditDescription] = useState(item?.description || '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const itemsCtx= ItemsContext();
  const [user] = useAuthState(auth)
  const { aiModeEnabled, analyzeMarketplaceContext, trackAdaptiveInteraction } = useAIMode()
  const isOwner = user && item?.userId && user.uid === item.userId
  const offerSectionRef = useRef(null)
  const [notFound, setNotFound] = useState(false)
  const [aiInsights, setAIInsights] = useState(null)
  const [aiLoading, setAILoading] = useState(false)
  const [sellerPayment, setSellerPayment] = useState(null)
  const [openPayment, setOpenPayment] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const conversationId = item && user ? `${item.id}_${[item.userId, user.uid].sort().join('_')}` : null
  const gallery = useMemo(() => {
    if (!item) return []
    if (Array.isArray(item.images) && item.images.length) return item.images
    if (Array.isArray(item.imageUrls) && item.imageUrls.length) return item.imageUrls
    if (item.imageUrl) return [item.imageUrl]
    return []
  }, [item])
  const [activeImage, setActiveImage] = useState(0)
  const [uploadingGalleryImages, setUploadingGalleryImages] = useState(false)
  const MAX_IMAGES = 6
  const MAX_FILE_MB = 8
  const MAX_DIMENSION = 1600
  const JPEG_QUALITY = 0.78

  useEffect(() => {
    setActiveImage(0)
  }, [item?.id])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [item?.id])

  const priceStats = useMemo(() => {
    const items = itemsCtx.items || []
    const catItems = items.filter((it) => it.category === item?.category)
    const nums = catItems.map((it) => Number(String(it.price || '').replace(/[^\d.]/g, ''))).filter((n) => Number.isFinite(n))
    if (nums.length === 0) return null
    const sorted = nums.sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const p25 = sorted[Math.floor(sorted.length * 0.25)]
    const p75 = sorted[Math.floor(sorted.length * 0.75)]
    return { median, p25, p75 }
  }, [itemsCtx.items, item?.category])

  const bundleItems = useMemo(() => {
    const items = itemsCtx.items || []
    if (!item?.userId) return []
    return items.filter((it) => it.userId === item.userId && it.id !== item.id).slice(0, 3)
  }, [itemsCtx.items, item])

  const sellerStats = useMemo(() => {
    const items = itemsCtx.items || []
    const sellerItems = items.filter((it) => it.userId === item?.userId)
    const recent = sellerItems.filter((it) => {
      const ts = new Date(it.createAt || it.createdAt || '').getTime()
      return Date.now() - ts < 7 * 24 * 60 * 60 * 1000
    })
    return {
      total: sellerItems.length,
      recent: recent.length,
      name: item?.userName || 'Seller'
    }
  }, [itemsCtx.items, item])

  const toggleModal = () => setModal(!openModal);
  const toggleModalSell = () => setModalSell(!openModalSell);

  // hydrate item from params or location
  useEffect(() => {
    if (locationItem) {
      setItem(locationItem)
      setNotFound(false)
      return
    }
    if (params?.id && itemsCtx.items) {
      const found = (itemsCtx.items || []).find((it) => String(it.id) === String(params.id))
      if (found) {
        setItem(found)
        setNotFound(false)
      } else if ((itemsCtx.items || []).length > 0) {
        setNotFound(true)
      }
    }
  }, [locationItem, params?.id, itemsCtx.items])

  useEffect(() => {
    if (!item?.id) return
    const stored = JSON.parse(localStorage.getItem('xchange_favorites') || '[]')
    setSaved(Array.isArray(stored) ? stored.includes(item.id) : false)
  }, [item?.id])

  useEffect(() => {
    setCurrentTitle(item?.title || '')
    setCurrentCategory(item?.category || '')
    setCurrentPrice(item?.price || '')
    setCurrentDescription(item?.description || '')
    setEditTitle(item?.title || '')
    setEditCategory(item?.category || '')
    setEditPrice(item?.price || '')
    setEditDescription(item?.description || '')
  }, [item])

  useEffect(() => {
    if (!item?.id) return
    const offersRef = collection(fireStore, 'offers')
    const q = query(offersRef, where('itemId', '==', item.id))
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      setOffers(list)
    })
    return () => unsub()
  }, [item?.id])

  useEffect(() => {
    setReviews([])
  }, [item?.id])

  useEffect(() => {
    if (!item?.id) return
    const reviewsRef = collection(fireStore, 'reviews')
    const q = query(reviewsRef, where('itemId', '==', item.id))
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      setReviews(list)
    })
    return () => unsub()
  }, [item?.id])

  useEffect(() => {
    if (!item?.userId) {
      setSellerPayment(null)
      return
    }
    const sellerProfileRef = doc(fireStore, 'userProfiles', item.userId)
    const unsub = onSnapshot(sellerProfileRef, (snap) => {
      const payment = snap.data()?.payment || null
      if (payment?.upiId) {
        const qrUrl = payment.qrUrl || buildUpiQrUrl(payment.upiId, item?.userName || 'Seller') || DEFAULT_UPI_QR_URL
        setSellerPayment({ upiId: payment.upiId, qrUrl })
        return
      }
      setSellerPayment(null)
    })
    return () => unsub()
  }, [item?.userId, item?.userName])

  useEffect(() => {
    if (sellerPayment?.upiId && sellerPayment?.qrUrl) return
    setOpenPayment(false)
  }, [sellerPayment])

  useEffect(() => {
    if (!copyStatus) return
    const timeout = setTimeout(() => setCopyStatus(''), 2500)
    return () => clearTimeout(timeout)
  }, [copyStatus])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!aiModeEnabled || !item?.id) {
        setAIInsights(null)
        return
      }
      setAILoading(true)
      const comparablePrices = (itemsCtx.items || [])
        .filter((entry) => entry.category === item.category && entry.id !== item.id)
        .map((entry) => Number(entry.price))
        .filter((n) => Number.isFinite(n))
      const incomingOffer = offers.length > 0 ? { amount: offers[0]?.amount } : { amount: Number(offerValue || 0) || null }

      const result = await analyzeMarketplaceContext({
        userId: user?.uid || 'anonymous',
        conversationId,
        message: offers[0] ? `Offer: Rs ${offers[0].amount}` : '',
        listing: {
          id: item.id,
          title: item.title,
          category: item.category,
          price: Number(item.price),
          description: item.description,
          imageUrl: item.imageUrl,
          images: Array.isArray(item.images) ? item.images : [],
          videoUrl: item.videoUrl || null,
        },
        comparablePrices,
        offers: offers.map((offer) => ({ amount: Number(offer.amount), status: offer.status })),
        incomingOffer,
        behavior: {
          responseConsistency: 0.7,
          pastReports: 0,
        },
        profile: {
          completeness: item?.userName ? 0.8 : 0.55,
        },
      })
      if (cancelled) return
      setAIInsights(result)
      setAILoading(false)
    }

    run().catch((error) => {
      console.warn('AI insights unavailable in details page:', error)
      if (!cancelled) setAILoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [aiModeEnabled, analyzeMarketplaceContext, item?.id, item?.category, item?.description, item?.price, item?.title, item?.userName, offers, offerValue, itemsCtx.items, user?.uid, conversationId])

  const handleSave = () => {
    const currentId = item?.id
    if (!currentId) return
    const stored = JSON.parse(localStorage.getItem('xchange_favorites') || '[]')
    const list = Array.isArray(stored) ? stored : []
    let next = list
    if (list.includes(currentId)) {
      next = list.filter((id) => id !== currentId)
      setSaved(false)
    } else {
      next = [currentId, ...list].slice(0, 50)
      setSaved(true)
    }
    localStorage.setItem('xchange_favorites', JSON.stringify(next))
  }

  const similarItems = useMemo(() => {
    const items = itemsCtx.items || []
    if (!item?.id) return []
    return items
      .filter((entry) => entry.id !== item.id && entry.category === (currentCategory || item.category))
      .slice(0, 4)
  }, [itemsCtx.items, item?.id, item?.category, currentCategory])

  const sendOffer = async () => {
    if (!user) { toggleModal(); return }
    if (user.uid === item?.userId) { alert('You cannot make an offer on your own listing.'); return }
    const amount = Number(offerValue)
    if (!Number.isFinite(amount) || amount <= 0) return
    try {
      const buyerName = user.displayName || user.email || 'Buyer'
      const itemTitle = item.title || 'Listing'
      const itemImage = item.imageUrl || (Array.isArray(item.images) ? item.images[0] : '')
      const offerRef = await addDoc(collection(fireStore, 'offers'), {
        itemId: item.id,
        sellerId: item.userId,
        buyerId: user.uid,
        buyerName,
        itemTitle,
        itemImage,
        amount,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      // optimistic UI
      setOffers((prev) => [{ id: offerRef.id, itemId: item.id, sellerId: item.userId, buyerId: user.uid, buyerName, itemTitle, itemImage, amount, status: 'pending', createdAt: new Date() }, ...(prev || [])])
      await addDoc(collection(fireStore, 'notifications'), {
        userId: item.userId,
        type: 'offer',
        itemId: item.id,
        itemTitle,
        itemImage,
        sellerId: item.userId,
        buyerId: user.uid,
        buyerName,
        offerId: offerRef.id,
        amount,
        status: 'pending',
        unread: true,
        read: false,
        title: `New offer on ${itemTitle}`,
        body: `${buyerName} offered Rs ${amount}`,
        createdAt: serverTimestamp(),
      })
      setOfferValue('')
      if (aiModeEnabled && user?.uid) {
        trackAdaptiveInteraction({
          userId: user.uid,
          interactionType: 'offer',
          listing: {
            id: item.id,
            category: item.category,
            price: item.price,
          },
          transaction: {
            status: 'pending',
            category: item.category,
            price: amount,
            suspicious: false,
          },
        }).catch(() => {})
      }
      alert('Offer sent to the seller.')
    } catch (err) {
      console.error(err)
      alert('Failed to send offer. Please try again.')
    }
  }

  const updateOfferStatus = async (offerId, nextStatus) => {
    try {
      await updateDoc(doc(fireStore, 'offers', offerId), { status: nextStatus })
      const offer = offers.find((o) => o.id === offerId)
      if (offer) {
        setOffers((prev) => prev.map((o) => o.id === offerId ? { ...o, status: nextStatus } : o))
        await addDoc(collection(fireStore, 'notifications'), {
          type: 'offer-status',
          offerId,
          itemId: item.id,
          buyerId: offer.buyerId,
          userId: offer.buyerId,
          sellerId: item.userId,
          title: `Your offer was ${nextStatus}`,
          body: `${item.title || 'Listing'} · Rs ${offer.amount}`,
          status: nextStatus,
          createdAt: serverTimestamp(),
          unread: true,
          read: false,
        })
        if (aiModeEnabled && user?.uid) {
          trackAdaptiveInteraction({
            userId: user.uid,
            interactionType: 'offer',
            listing: {
              id: item.id,
              category: item.category,
              price: item.price,
            },
            transaction: {
              status: nextStatus,
              category: item.category,
              price: offer.amount,
              suspicious: false,
            },
          }).catch(() => {})
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const submitReview = async () => {
    if (!user) { toggleModal(); return }
    if (!reviewText.trim()) return
    try {
      const payload = {
        itemId: item.id,
        itemRef: `products/${item.id}`,
        itemTitle: item.title,
        sellerId: item.userId,
        sellerName: item.userName || 'Seller',
        reviewerId: user.uid,
        reviewerName: user.displayName || user.email || 'User',
        rating,
        text: reviewText.trim(),
        createdAt: serverTimestamp(),
      }
      const docRef = await addDoc(collection(fireStore, 'reviews'), payload)
      setReviews((prev) => [{ id: docRef.id, ...payload }, ...(prev || [])])
      setReviewText('')
      setRating(5)
      alert('Review posted.')
    } catch (err) {
      console.error(err)
      alert('Failed to post review. Please try again.')
    }
  }

  const avgRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length).toFixed(1)
    : null

  const parsedPrice = useMemo(() => Number(String(item?.price || '').replace(/[^\d.]/g, '')), [item?.price])

  const scoreOfferClient = (amount) => {
    const offer = Number(amount)
    const listPrice = Number(item?.price)
    if (!Number.isFinite(offer) || !Number.isFinite(listPrice) || listPrice <= 0) return null
    const ratio = offer / listPrice
    const score = Math.max(0, Math.min(100, Math.round((1 - Math.abs(1 - ratio)) * 100)))
    return score
  }

  const formatDate = (value) => {
    if (!value) return ''
    if (value.toDate) return value.toDate().toLocaleString()
    const asDate = new Date(value)
    return Number.isFinite(asDate.getTime()) ? asDate.toLocaleString() : ''
  }

  const readImageAsDataUrl = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const resizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()

      reader.onload = () => {
        img.src = reader.result
      }
      reader.onerror = reject

      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
        const targetW = Math.round(img.width * scale)
        const targetH = Math.round(img.height * scale)

        const canvas = document.createElement('canvas')
        canvas.width = targetW
        canvas.height = targetH
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas not supported'))
          return
        }
        ctx.drawImage(img, 0, 0, targetW, targetH)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Image compression failed'))
              return
            }
            resolve(blob)
          },
          'image/jpeg',
          JPEG_QUALITY
        )
      }
      img.onerror = reject

      reader.readAsDataURL(file)
    })
  }

  const handleAddGalleryImages = async (event) => {
    if (!isOwner || !item?.id) return
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (selected.length === 0) return

    const remainingSlots = Math.max(0, MAX_IMAGES - gallery.length)
    if (remainingSlots === 0) {
      alert(`You can upload a maximum of ${MAX_IMAGES} images.`)
      return
    }

    const filesToProcess = selected.slice(0, remainingSlots)
    const skipped = []
    if (selected.length > filesToProcess.length) {
      skipped.push(`Only ${remainingSlots} more image(s) can be added.`)
    }

    setUploadingGalleryImages(true)
    try {
      const newImageUrls = []

      for (const file of filesToProcess) {
        if (!file.type.startsWith('image/')) {
          skipped.push(`${file.name}: invalid image file`)
          continue
        }
        const sizeMb = file.size / (1024 * 1024)
        if (sizeMb > MAX_FILE_MB) {
          skipped.push(`${file.name}: file must be under ${MAX_FILE_MB}MB`)
          continue
        }

        try {
          let imageUrl = ''
          if (file.type === 'image/svg+xml' || file.size <= 150 * 1024) {
            imageUrl = await readImageAsDataUrl(file)
          } else {
            const optimizedBlob = await resizeImage(file)
            imageUrl = await readImageAsDataUrl(optimizedBlob)
          }
          newImageUrls.push(imageUrl)
        } catch (error) {
          console.error('Failed to process image:', error)
          skipped.push(`${file.name}: could not process file`)
        }
      }

      if (newImageUrls.length === 0) {
        if (skipped.length > 0) alert(skipped.join('\n'))
        return
      }

      const nextImages = [...gallery, ...newImageUrls].slice(0, MAX_IMAGES)
      const payload = {
        images: nextImages,
        imageUrl: nextImages[0] || item?.imageUrl || '',
      }

      await setDoc(doc(fireStore, 'products', item.id), payload, { merge: true })
      setItem((prev) => (prev ? { ...prev, ...payload } : prev))
      itemsCtx.setItems((prev) => (prev || []).map((it) => it.id === item.id ? { ...it, ...payload } : it))
      setActiveImage((prev) => (prev === -1 ? 0 : Math.min(prev, Math.max(nextImages.length - 1, 0))))

      if (skipped.length > 0) {
        alert(`Added ${newImageUrls.length} image(s).\n${skipped.join('\n')}`)
      }
    } catch (err) {
      console.error(err)
      alert('Failed to add more photos. Please try again.')
    } finally {
      setUploadingGalleryImages(false)
    }
  }

  const saveEdits = async () => {
    if (!isOwner || !item?.id) return
    const payload = {
      title: editTitle,
      category: editCategory,
      price: editPrice,
      description: editDescription,
    }
    try {
      await setDoc(doc(fireStore, 'products', item.id), payload, { merge: true })
      itemsCtx.setItems((prev) => (prev || []).map((it) => it.id === item.id ? { ...it, ...payload } : it))
      setCurrentTitle(editTitle)
      setCurrentCategory(editCategory)
      setCurrentPrice(editPrice)
      setCurrentDescription(editDescription)
      setIsEditing(false)
      alert('Saved changes to Firebase.')
    } catch (err) {
      console.error(err)
      alert('Failed to save changes: ' + (err?.message || 'Unknown error'))
    }
  }

  const paymentReady = Boolean(sellerPayment?.upiId)

  const handleOpenPayment = () => {
    if (!user) {
      toggleModal()
      return
    }
    if (!paymentReady || isOwner) return
    setCopyStatus('')
    setOpenPayment(true)
  }

  const copyUpiId = async () => {
    if (!sellerPayment?.upiId) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(sellerPayment.upiId)
      } else {
        const tempInput = document.createElement('textarea')
        tempInput.value = sellerPayment.upiId
        tempInput.setAttribute('readonly', '')
        tempInput.style.position = 'absolute'
        tempInput.style.left = '-9999px'
        document.body.appendChild(tempInput)
        tempInput.select()
        document.execCommand('copy')
        document.body.removeChild(tempInput)
      }
      setCopyStatus('UPI ID copied.')
    } catch (err) {
      console.error(err)
      setCopyStatus('Could not copy UPI ID. Please copy it manually.')
    }
  }

  if (!item && !notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        Loading listing…
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-700 gap-3">
        <p className="text-xl font-semibold">Listing not found.</p>
        <button className="xchange-btn" onClick={() => navigate('/')}>Back to home</button>
      </div>
    )
  }

  return (
      <div>
          <Navbar toggleModalSell={toggleModalSell} toggleModal={toggleModal} />
          <Login toggleModal={toggleModal} status={openModal} />

          <div className="grid gap-0 sm:gap-5 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 p-10 px-5 sm:px-15 md:px-30 lg:px-40">
              <div className="w-full">
                <div className="border-2 w-full rounded-lg flex justify-center overflow-hidden h-96 bg-white/80">
                    {item?.videoUrl && activeImage === -1 ? (
                      <video className="w-full h-full object-contain bg-black" src={item.videoUrl} controls poster={gallery[0]} />
                    ) : (
                      <img className="object-contain w-full h-full bg-white" src={gallery[activeImage] || item?.imageUrl || 'https://via.placeholder.com/400'} alt={item?.title} />
                    )}
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {item?.videoUrl ? (
                    <button
                      onClick={() => setActiveImage(-1)}
                      className={`h-16 w-24 flex-shrink-0 border rounded-lg overflow-hidden ${activeImage === -1 ? 'ring-2 ring-sky-400' : ''}`}
                    >
                      <video className="h-full w-full object-cover" src={item.videoUrl} />
                    </button>
                  ) : null}
                  {gallery.map((src, idx) => (
                    <button
                      key={`${src}_${idx}`}
                      onClick={() => setActiveImage(idx)}
                      className={`h-16 w-24 flex-shrink-0 border rounded-lg overflow-hidden ${activeImage === idx ? 'ring-2 ring-sky-400' : ''}`}
                    >
                      <img className="h-full w-full object-cover" src={src} alt={`thumb-${idx}`} />
                    </button>
                  ))}
                  {isOwner ? (
                    <label
                      className={`h-16 w-24 flex-shrink-0 border-2 border-dashed rounded-lg flex items-center justify-center px-1 text-center ${gallery.length >= MAX_IMAGES || uploadingGalleryImages ? 'border-slate-300 text-slate-400 cursor-not-allowed' : 'border-sky-300 text-sky-700 cursor-pointer hover:bg-sky-50 hover:border-sky-500 transition'}`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleAddGalleryImages}
                        disabled={gallery.length >= MAX_IMAGES || uploadingGalleryImages}
                        className="hidden"
                      />
                      <span className="text-[11px] font-semibold leading-tight whitespace-pre-line">
                        {uploadingGalleryImages ? 'Uploading...' : gallery.length >= MAX_IMAGES ? `Limit ${MAX_IMAGES}` : `+ Add photos\n${gallery.length}/${MAX_IMAGES}`}
                      </span>
                    </label>
                  ) : null}
                </div>
                {isOwner ? (
                  <p className="text-xs text-slate-500 mt-1">You can keep 1 photo or add up to 6 total. Extra photos are optional.</p>
                ) : null}
              </div>
              <div className="flex flex-col relative w-full">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="p-1 pl-0 text-2xl font-bold text-slate-900">Rs {String(isEditing ? editPrice : currentPrice).includes('/-') ? (isEditing ? editPrice : currentPrice) : `${isEditing ? editPrice : currentPrice}/-`}</p>
                      <p className="p-1 pl-0 text-base text-slate-500">{isEditing ? editCategory : currentCategory}</p>
                      <p className="p-1 pl-0 text-xl font-bold text-slate-900">{isEditing ? editTitle : currentTitle}</p>
                      {priceStats ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 bg-slate-100 rounded-xl px-3 py-2 w-fit shadow-inner">
                          <span className="font-semibold text-slate-800">Price guidance:</span>
                          <span>median Rs {priceStats.median}</span>
                          <span className="text-emerald-700">fair band Rs {priceStats.p25}–{priceStats.p75}</span>
                          {Number(currentPrice) < priceStats.p25 ? <span className="text-amber-600">Low — possible bargain</span> : null}
                          {Number(currentPrice) > priceStats.p75 ? <span className="text-amber-600">High — consider negotiating</span> : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleSave} className={`favorite-toggle ${saved ? 'active' : ''}`}>
                        {saved ? 'Favourited' : 'Favourite'}
                      </button>
                      {isOwner ? (
                        <button
                          onClick={() => setIsEditing((prev) => !prev)}
                          className="favorite-toggle"
                        >
                          {isEditing ? 'Cancel edit' : 'Edit'}
                        </button>
                      ) : null}
                      {isOwner ? (
                        <button
                          onClick={() => setConfirmDelete(true)}
                          className="favorite-toggle danger"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {isEditing ? (
                    <div className="space-y-2 mt-2 w-full">
                      <input value={editTitle} onChange={(e)=>setEditTitle(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2" placeholder="Title"/>
                      <input value={editCategory} onChange={(e)=>setEditCategory(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2" placeholder="Category"/>
                      <input value={editPrice} onChange={(e)=>setEditPrice(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2" placeholder="Price"/>
                      <textarea value={editDescription} onChange={(e)=>setEditDescription(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2" placeholder="Description"/>
                      <div className="flex gap-2">
                        <button className="xchange-btn" onClick={saveEdits}>Save changes</button>
                        <button className="xchange-btn ghost" onClick={()=>setIsEditing(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <p className="p-1 pl-0 sm:pb-0 break-words text-ellipsis overflow-hidden w-full text-slate-600">
                        {currentDescription}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="xchange-btn" onClick={() => {
                      if (!user) { toggleModal(); return }
                      setOpenChat(true)
                    }}>Message seller</button>
                    <button className="xchange-btn ghost" onClick={() => offerSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}>Make offer</button>
                    {!isOwner ? (
                      <button
                        className={`xchange-btn ghost ${!paymentReady ? 'opacity-60 cursor-not-allowed hover:translate-y-0' : ''}`}
                        onClick={handleOpenPayment}
                        disabled={!paymentReady}
                      >
                        Payment
                      </button>
                    ) : null}
                  </div>
                  {!isOwner && !paymentReady ? (
                    <p className="mt-2 text-xs text-slate-500">Seller has not added payment details yet.</p>
                  ) : null}
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="detail-card">
                      <p className="detail-title">Seller</p>
                      <p className="detail-value">{item?.userName || 'Anonymous'}</p>
                    </div>
                    <div className="detail-card">
                      <p className="detail-title">Listed on</p>
                      <p className="detail-value">{item?.createAt || item?.createdAt || 'Recently'}</p>
                    </div>
                    <div className="detail-card">
                      <p className="detail-title">Rating</p>
                      <p className="detail-value">{avgRating ? `${avgRating}★ (${reviews.length})` : 'No reviews yet'}</p>
                    </div>
                    <div className="detail-card">
                      <p className="detail-title">Category</p>
                      <p className="detail-value">{currentCategory}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">{sellerStats.recent || 0} swaps this week</span>
                    <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-700">{sellerStats.total} listings live</span>
                    {reviews.length > 0 ? <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700">{reviews.length} recent reviews</span> : null}
                  </div>
                  {aiModeEnabled ? (
                    <div className="mt-4 space-y-3">
                      {aiLoading ? <p className="text-sm text-slate-500">Analyzing deal and trust signals...</p> : null}
                      <DealInsightsPanel insight={aiInsights?.deal} />
                      <TrustBanner insight={aiInsights?.trust} />
                      {aiInsights?.systemGoal?.priorityActions?.[0]?.action ? (
                        <p className="text-sm text-slate-600">
                          AI Priority: {aiInsights.systemGoal.priorityActions[0].action}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-6 safety-card">
                    <p className="font-semibold">Safety tips</p>
                    <ul className="text-sm text-slate-600 list-disc list-inside">
                      <li>Meet in a well-lit public place.</li>
                      <li>Inspect items before paying.</li>
                      <li>Use cashless payments when possible.</li>
                    </ul>
                    <div className="mt-3 text-sm text-slate-600 space-y-2">
                      <p className="font-semibold text-slate-800">Suggested safe meetup spots</p>
                      <div className="flex flex-wrap gap-2">
                        <a className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200" href="https://www.google.com/maps/search/police+station+near+me" target="_blank" rel="noreferrer">Nearest police station</a>
                        <a className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200" href="https://www.google.com/maps/search/mall+entrance+near+me" target="_blank" rel="noreferrer">Mall entrance</a>
                        <a className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200" href="https://www.google.com/maps/search/cafe+near+me" target="_blank" rel="noreferrer">Busy café</a>
                      </div>
                    </div>
                  </div>
              </div>
          </div>

          <div className="mt-8 px-5 sm:px-12 md:px-20 lg:px-32 grid gap-8 lg:grid-cols-[1fr_0.7fr]" ref={offerSectionRef}>
            <div className="stat-card">
              <div className="flex items-center justify-between">
                <p className="section-title text-xl">Make an offer</p>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Negotiate</span>
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  value={offerValue}
                  onChange={(e) => setOfferValue(e.target.value)}
                  placeholder="Enter your price"
                  className="flex-1 rounded-lg border border-slate-200 p-3 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
                <button className="xchange-btn w-full sm:w-auto" onClick={sendOffer}>Send offer</button>
              </div>
              {aiModeEnabled ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button className="chip" onClick={() => setOfferValue(String(Math.max(1, Math.round(parsedPrice * 0.92) || '')))}>Offer 8% less</button>
                  <button className="chip" onClick={() => setOfferValue(String(Math.round(parsedPrice * 0.97) || ''))}>Counter -3%</button>
                  <button className="chip" onClick={() => setOfferValue(String(Math.round(parsedPrice) || ''))}>Match price</button>
                  <button className="chip" onClick={() => setOfferValue('')}>Clear</button>
                  <button className="chip" onClick={() => setOfferValue(String(Math.round(parsedPrice * 1.05) || ''))}>Sweeten (+5%)</button>
                </div>
              ) : null}
              <div className="mt-4 space-y-3">
                {offers.length === 0 ? (
                  <p className="text-sm text-slate-500">No offers yet. Be the first.</p>
                ) : offers.map((offer) => (
                  <div key={offer.id} className="detail-card flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">Rs {offer.amount}</p>
                      <p className="text-xs text-slate-500">By {offer.buyerName}</p>
                      {aiModeEnabled ? (
                        <p className="text-xs text-slate-500 mt-1">
                          Offer quality {scoreOfferClient(offer.amount) ?? '--'}/100
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${offer.status === 'pending' ? 'bg-amber-100 text-amber-700' : offer.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {offer.status}
                      </span>
                      {user?.uid === item?.userId && offer.status === 'pending' ? (
                        <>
                          <button className="favorite-toggle" onClick={() => updateOfferStatus(offer.id, 'accepted')}>Accept</button>
                          <button className="favorite-toggle ghost" onClick={() => updateOfferStatus(offer.id, 'rejected')}>Reject</button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="section-title text-xl">Reviews</p>
                  {avgRating ? (
                    <div className="flex items-center gap-2">
                      <StarRating rating={Math.round(avgRating)} readOnly={true} size="sm" />
                      <p className="text-sm text-slate-600 font-semibold">{avgRating}</p>
                    </div>
                  ) : null}
                </div>
                <button
                  className="text-xs px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 transition"
                  onClick={() => setShowReviews((v) => !v)}
                >
                  {showReviews ? 'Hide' : 'View'} reviews ({reviews.length})
                </button>
              </div>
              <div className="mt-3">
                <div className="flex items-center gap-4">
                  <StarRating rating={rating} onRatingChange={setRating} size="lg" />
                  <span className="text-sm text-slate-600">
                    {rating === 5 && 'Excellent!'}
                    {rating === 4 && 'Good'}
                    {rating === 3 && 'Average'}
                    {rating === 2 && 'Poor'}
                    {rating === 1 && 'Terrible'}
                  </span>
                </div>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Share your experience with this seller"
                  className="mt-3 w-full min-h-[90px] rounded-lg border border-slate-200 p-3 text-sm focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
                <div className="mt-2 flex justify-end">
                  <button className="xchange-btn" onClick={submitReview}>Post review</button>
                </div>
              </div>
              <div className={`mt-4 space-y-3 pr-1 review-collapse ${showReviews ? 'open' : ''}`}>
                {reviews.length === 0 ? (
                  <p className="text-sm text-slate-500">No reviews yet.</p>
                ) : reviews.map((rev) => (
                  <div key={rev.id} className="detail-card review-card-animated shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-semibold">
                          {String(rev.reviewerName || 'U').slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 leading-tight">{rev.reviewerName}</p>
                          <p className="text-[11px] text-slate-500">{formatDate(rev.createdAt)}</p>
                        </div>
                      </div>
                      <StarRating rating={rev.rating || 5} readOnly={true} size="sm" />
                    </div>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">{rev.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {similarItems.length > 0 ? (
            <Card
              items={similarItems}
              title="Similar listings"
              subtitle="More picks from the same category."
              viewMode="grid"
              compact
            />
          ) : null}

          {bundleItems.length > 0 ? (
            <Card
              items={bundleItems}
              title="Bundle from this seller"
              subtitle="Add these to save time at pickup."
              viewMode="grid"
              compact
            />
          ) : null}
          {bundleItems.length >= 2 ? (
            <div className="mt-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl px-4 py-3 text-sm flex flex-wrap gap-2 items-center">
              <span className="font-semibold">Bundle & save:</span>
              <span>Grab these together and offer ~8% less than combined price for a quick yes.</span>
            </div>
          ) : null}

          {confirmDelete ? (
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl text-slate-900">
                <p className="text-lg font-semibold">Delete this item?</p>
                <p className="text-sm text-slate-600 mt-2">This will remove it from Xchange for everyone.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button className="favorite-toggle ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button
                    className="favorite-toggle danger"
                    disabled={deleting}
                    onClick={async () => {
                      if (deleting) return
                      setDeleting(true)
                      try {
                        await itemsCtx.deleteItem(item.id)
                        setConfirmDelete(false)
                        navigate('/')
                      } catch (err) {
                        console.error(err)
                        alert('Failed to delete. Please try again.')
                      } finally {
                        setDeleting(false)
                      }
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {openPayment && sellerPayment ? (
            <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Payment</p>
                    <p className="text-lg font-semibold text-slate-900">Scan to Pay</p>
                  </div>
                  <button className="text-slate-500 hover:text-slate-900 text-xl" onClick={() => setOpenPayment(false)}>x</button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-center">
                    <img
                      src={sellerPayment.qrUrl}
                      alt="Seller UPI QR"
                      className="w-72 h-72 sm:w-80 sm:h-80 object-contain rounded-lg border border-slate-200 bg-white"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">UPI ID</p>
                    <p className="text-slate-900 font-semibold mt-1 break-all">{sellerPayment.upiId}</p>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button className="favorite-toggle" onClick={copyUpiId}>Copy UPI ID</button>
                    <button className="favorite-toggle ghost" onClick={() => setOpenPayment(false)}>Close</button>
                  </div>
                  {copyStatus ? <p className="text-sm text-slate-600">{copyStatus}</p> : null}
                </div>
              </div>
            </div>
          ) : null}

          <ChatModal open={openChat} onClose={() => setOpenChat(false)} item={item} user={user} conversationId={conversationId} />
          <Sell setItems={(itemsCtx ).setItems} toggleModalSell={toggleModalSell} status={openModalSell} />
      </div>
  );
};

export default Details
