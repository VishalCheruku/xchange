import { useEffect, useMemo, useRef, useState } from "react"
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore"
import { getDownloadURL, ref, uploadBytes } from "firebase/storage"
import { fireStore, storage } from "../Firebase/Firebase"
import { useAIMode } from "../Context/AIMode"
import { deriveAIVisibility, useAISuggestionGuard } from "../../hooks/useAIModeBehavior"

/* ─── tiny helpers ─────────────────────────────────────────────────── */
const fmt = (ts) => {
  if (!ts?.toDate) return ""
  const d = ts.toDate()
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

const groupByDate = (msgs) => {
  const groups = []
  let lastLabel = null
  msgs.forEach((m) => {
    const d = m.createdAt?.toDate?.()
    const label = d
      ? (() => {
          const now = new Date()
          const diff = Math.floor((now - d) / 86400000)
          if (diff === 0) return "Today"
          if (diff === 1) return "Yesterday"
          return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
        })()
      : null
    if (label && label !== lastLabel) {
      groups.push({ type: "divider", label })
      lastLabel = label
    }
    groups.push({ type: "msg", data: m })
  })
  return groups
}

/* ─── emojis ─────────────────────────────────────────────────────── */
const EMOJIS = ["😀","😂","😍","🥰","😎","🤩","😅","😢","🙏","👍","🔥","🎉","💯","🚀","💡","✅","❤️","💰","📷","🤝","👋","😤","🤔","💪"]

/* ─── quick chips ─────────────────────────────────────────────────── */
const QUICK = [
  { label: "Still available?", text: "Is it still available?" },
  { label: "Pick up today", text: "I can pick up today!" },
  { label: "Cash on delivery?", text: "Can we do cash on delivery?" },
  { label: "Quick call?", text: "Can you do a quick call?" },
]

const ACTION_CHIPS = [
  { label: "🔒 Hold 1h", text: "Please hold this item for 1 hour while I confirm.", color: "#d97706" },
  { label: "🚗 ETA 20m", text: "Sharing ETA: I'll be there in ~20 minutes.", color: "#059669" },
  { label: "📍 Safe spot", href: "https://www.google.com/maps/search/safe+public+meeting+spot+near+me" },
]

/* ══════════════════════════════════════════════════════════════════ */
const toPercent = (value) => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : "--")

const extractOfferFromText = (text = "") => {
  const lowered = String(text || "").toLowerCase()
  if (!/(offer|price|rs|₹|final)/i.test(lowered)) return null
  const match = lowered.match(/(\d{2,7}(?:\.\d+)?)/)
  if (!match) return null
  const amount = Number(match[1])
  return Number.isFinite(amount) ? amount : null
}

const ChatModal = ({ open, onClose, item, user, conversationId: conversationIdProp }) => {
  const [text, setText] = useState("")
  const [messages, setMessages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [showEmojis, setShowEmojis] = useState(false)
  const [showQuick, setShowQuick] = useState(false)
  const [typingPeers, setTypingPeers] = useState([])
  const [convMeta, setConvMeta] = useState(null)
  const [imgPreview, setImgPreview] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [pendingPreview, setPendingPreview] = useState(null)
  const [aiChatInsight, setAIChatInsight] = useState(null)
  const [aiError, setAIError] = useState(null)
  const [lastAnalyzedMessageId, setLastAnalyzedMessageId] = useState(null)
  const {
    aiModeEnabled,
    toneGuardEnabled,
    setToneGuardEnabled,
    requestRealtimeInsight,
    trackAdaptiveInteraction,
  } = useAIMode()
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const emojiRef = useRef(null)

  const sellerId = item?.userId || convMeta?.sellerId || (convMeta?.participants || []).find((p) => p !== user?.uid) || null
  const participantKey = sellerId && user ? [sellerId, user.uid].sort().join("_") : null
  const conversationId = conversationIdProp || (item && user && participantKey ? `${item.id}_${participantKey}` : null)

  // ✅ Resolve the other person's display name for the header
  const otherPersonId = sellerId !== user?.uid ? sellerId : (convMeta?.participants || []).find((p) => p !== user?.uid)
  const otherPersonName = useMemo(() => {
    if (convMeta?.participantsNames && otherPersonId) {
      return convMeta.participantsNames[otherPersonId] || null
    }
    return null
  }, [convMeta, otherPersonId])
  const headerName = otherPersonName || item?.userName || convMeta?.otherName || convMeta?.itemOwnerName || "Seller"

  const aiQuickSuggestionsRaw = useMemo(() => aiChatInsight?.conversation?.suggestions?.nextReplies || [], [aiChatInsight])
  const aiQuickSuggestions = useAISuggestionGuard({
    suggestions: aiQuickSuggestionsRaw,
    scopeKey: conversationId || "global",
    cooldownMs: 90000,
    maxSuggestions: 2,
  })
  const aiVisibility = useMemo(
    () => deriveAIVisibility({ aiModeEnabled, insight: aiChatInsight }),
    [aiModeEnabled, aiChatInsight],
  )

  const applyLocalToneGuard = (rawText) => {
    if (!toneGuardEnabled) return rawText
    const harsh = /\b(stupid|idiot|nonsense|shut up)\b/gi
    if (!harsh.test(rawText)) return rawText
    const cleaned = rawText.replace(harsh, "").replace(/\s{2,}/g, " ").trim()
    return `Please clarify this for me. ${cleaned}`.trim()
  }

  /* close emoji on outside click */
  useEffect(() => {
    if (!showEmojis) return
    const h = (e) => { if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmojis(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showEmojis])

  useEffect(() => { setMessages([]) }, [conversationId])

  useEffect(() => {
    if (!aiModeEnabled || !open || !conversationId || !user?.uid || !item?.id) return
    trackAdaptiveInteraction({
      userId: user.uid,
      interactionType: 'open_chat',
      listing: {
        id: item.id,
        category: item.category,
        price: item.price,
      },
    }).catch(() => {})
  }, [aiModeEnabled, open, conversationId, user?.uid, item?.id, item?.category, item?.price, trackAdaptiveInteraction])

  /* create conversation meta */
  useEffect(() => {
    if (!conversationId || !user || !item) return
    const convRef = doc(fireStore, "conversations", conversationId)
    const sellerName = item.userName || "Seller"
    const buyerName = user.displayName || user.email || "Buyer"
    setDoc(convRef, {
      id: conversationId,
      itemId: item.id,
      itemTitle: item.title || "",
      itemImage: item.imageUrl || (Array.isArray(item.images) ? item.images[0] : ""),
      itemOwnerName: sellerName,
      sellerId: sellerId || item.userId,
      buyerId: user.uid,
      participants: sellerId ? [sellerId, user.uid] : [item.userId, user.uid].filter(Boolean),
      participantsNames: {
        [sellerId || item.userId]: sellerName,
        [user.uid]: buyerName,
      },
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      lastSenderName: buyerName,
      otherName: sellerName,
    }, { merge: true }).catch(console.error)
  }, [conversationId, user, item, sellerId])

  /* messages listener */
  useEffect(() => {
    if (!open || !conversationId) return
    const q = query(collection(fireStore, "messages"), where("conversationId", "==", conversationId))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || 0
            const tb = b.createdAt?.toMillis?.() || 0
            return ta - tb
          })
        setMessages(list)
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80)
      },
      console.error
    )
    return () => unsub()
  }, [open, conversationId])

  /* mark read */
  useEffect(() => {
    if (!open || !conversationId || !user || messages.length === 0) return
    updateDoc(doc(fireStore, "conversations", conversationId), { [`lastRead.${user.uid}`]: serverTimestamp() }).catch(() => {})
  }, [messages.length, open, conversationId, user])

  useEffect(() => {
    if (!aiModeEnabled || !open || !conversationId || !user || messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg?.id || lastMsg.id === lastAnalyzedMessageId) return
    setLastAnalyzedMessageId(lastMsg.id)
    setAIError(null)
    const chatHistory = messages.slice(-12).map((entry) => ({
      senderId: entry.senderId,
      text: entry.text || (entry.imageUrl ? "Image shared" : ""),
      createdAtMs: entry.createdAt?.toMillis?.() || null,
    }))
    const chatOffers = chatHistory
      .map((entry) => extractOfferFromText(entry.text))
      .filter((amount) => Number.isFinite(amount))
      .map((amount) => ({ amount }))
    const latestMessage = lastMsg.text || (lastMsg.imageUrl ? "Image shared" : "")
    const incomingOfferAmount = extractOfferFromText(latestMessage)
    const responseConsistency = chatHistory.length >= 8 ? 0.78 : chatHistory.length >= 4 ? 0.66 : 0.55

    requestRealtimeInsight(
      {
        userId: user.uid,
        conversationId,
        message: latestMessage,
        latestMessage,
        history: chatHistory,
        chatHistory,
        listing: {
          id: item?.id,
          title: item?.title,
          category: item?.category,
          price: Number(item?.price),
          description: item?.description,
          imageUrl: item?.imageUrl,
          images: Array.isArray(item?.images) ? item.images : [],
          videoUrl: item?.videoUrl || null,
        },
        comparablePrices: [],
        offers: chatOffers,
        incomingOffer: Number.isFinite(incomingOfferAmount) ? { amount: incomingOfferAmount } : null,
        profile: { completeness: item?.userName ? 0.8 : 0.6 },
        behavior: { responseConsistency, pastReports: 0 },
      },
      (result, error) => {
        if (error) { setAIError(error); return }
        setAIChatInsight(result || null)
      },
    )
  }, [aiModeEnabled, open, conversationId, user, messages, lastAnalyzedMessageId, requestRealtimeInsight, item?.id, item?.title, item?.category, item?.price, item?.description])

  /* typing + conv meta */
  useEffect(() => {
    if (!conversationId || !user) return
    const unsub = onSnapshot(doc(fireStore, "conversations", conversationId), (snap) => {
      const data = snap.data() || {}
      const typing = data.typing || {}
      setTypingPeers(Object.entries(typing).filter(([uid, val]) => uid !== user.uid && val).map(([uid]) => uid))
      setConvMeta(data)
    })
    return () => unsub()
  }, [conversationId, user])

  /* ensure my name is stored */
  useEffect(() => {
    if (!conversationId || !user) return
    const myName = user.displayName || user.email || "User"
    updateDoc(doc(fireStore, "conversations", conversationId), {
      [`participantsNames.${user.uid}`]: myName,
      lastSenderName: convMeta?.lastSenderName || myName,
    }).catch(() => {})
  }, [conversationId, user, convMeta?.lastSenderName])

  /* cleanup typing on unmount */
  useEffect(() => {
    return () => {
      if (!conversationId || !user) return
      updateDoc(doc(fireStore, "conversations", conversationId), { [`typing.${user.uid}`]: false }).catch(() => {})
    }
  }, [conversationId, user])

  /* ── send ── */
  const sendMessage = async ({ imageUrl, overrideText } = {}) => {
    const rawText = (overrideText ?? text).trim()
    const bodyText = imageUrl ? rawText : applyLocalToneGuard(rawText)
    if (!user || (!bodyText && !imageUrl) || !conversationId) return
    const otherParticipant = (convMeta?.participants || []).find((p) => p !== user.uid) || (sellerId !== user.uid ? sellerId : null)
    const buyerIdResolved = sellerId && otherParticipant ? (user.uid === sellerId ? otherParticipant : user.uid) : (convMeta?.buyerId || user.uid)
    const recipientId = otherParticipant && otherParticipant !== user.uid ? otherParticipant : null
    try {
      await addDoc(collection(fireStore, "messages"), {
        conversationId, itemId: item.id,
        sellerId: sellerId || item.userId, buyerId: buyerIdResolved,
        participants: sellerId ? [sellerId, user.uid] : [item.userId, user.uid].filter(Boolean),
        senderId: user.uid, senderName: user.displayName || user.email || "User",
        text: bodyText || "", imageUrl: imageUrl || "",
        createdAt: serverTimestamp(),
      })
      setText("")
      const preview = bodyText || (imageUrl ? "📷 Photo" : "")
      await setDoc(doc(fireStore, "conversations", conversationId), {
        lastUpdated: serverTimestamp(), lastMessage: preview,
        lastMessageType: imageUrl ? "image" : "text",
        lastSenderId: user.uid,
        lastSenderName: user.displayName || user.email || "User",
        [`participantsNames.${user.uid}`]: user.displayName || user.email || "User",
        [`lastRead.${user.uid}`]: serverTimestamp(),
      }, { merge: true })
      if (recipientId) {
        await addDoc(collection(fireStore, "notifications"), {
          userId: recipientId, title: "New message",
          body: bodyText || "Photo", conversationId, read: false, createdAt: serverTimestamp(),
        })
      }
    } catch (err) { console.error(err) }
  }

  /* ── image handling ── */
  const handleImageFile = (file) => {
    if (!file) return
    setPendingFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setPendingPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const sendStagedImage = async () => {
    if (!pendingFile || !conversationId) return
    try {
      setUploading(true)
      const imgRef = ref(storage, `chatMedia/${conversationId}/${Date.now()}_${pendingFile.name}`)
      const snap = await uploadBytes(imgRef, pendingFile)
      const url = await getDownloadURL(snap.ref)
      await sendMessage({ imageUrl: url })
    } catch (err) { console.error("upload failed", err) }
    finally { setUploading(false); setPendingFile(null); setPendingPreview(null) }
  }

  const setTyping = (val) => {
    if (!conversationId || !user) return
    const myName = user.displayName || user.email || "User"
    updateDoc(doc(fireStore, "conversations", conversationId), {
      [`typing.${user.uid}`]: val,
      [`participantsNames.${user.uid}`]: myName,
      lastSenderName: convMeta?.lastSenderName || myName,
    }).catch(() => {})
  }

  if (!open || !conversationId) return null

  const grouped = groupByDate(messages)
  const itemThumb = item?.imageUrl || (Array.isArray(item?.images) ? item?.images[0] : null)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        .cm-root { font-family: 'Plus Jakarta Sans', sans-serif; }
        .cm-scroll::-webkit-scrollbar { width: 4px }
        .cm-scroll::-webkit-scrollbar-track { background: transparent }
        .cm-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 8px }
        .cm-bubble { animation: cm-pop .18s cubic-bezier(.34,1.56,.64,1) both }
        @keyframes cm-pop { from { opacity:0; transform: scale(.92) translateY(6px) } to { opacity:1; transform: none } }
        .cm-typing span { display:inline-block; width:6px; height:6px; border-radius:50%; background:#94a3b8; animation: cm-dot 1.2s infinite ease-in-out }
        .cm-typing span:nth-child(2) { animation-delay:.2s }
        .cm-typing span:nth-child(3) { animation-delay:.4s }
        @keyframes cm-dot { 0%,60%,100% { transform:translateY(0) } 30% { transform:translateY(-5px) } }
        .cm-chip { transition: all .15s; border: 1px solid rgba(255,255,255,.08) }
        .cm-chip:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.18); transform: translateY(-1px) }
        .cm-send-btn { transition: all .15s }
        .cm-send-btn:not(:disabled):hover { transform: scale(1.05) }
        .cm-send-btn:not(:disabled):active { transform: scale(.97) }
        .cm-modal-enter { animation: cm-modal-in .22s cubic-bezier(.34,1.3,.64,1) both }
        @keyframes cm-modal-in { from { opacity:0; transform:scale(.96) translateY(12px) } to { opacity:1; transform:none } }
        .cm-img-msg { cursor: zoom-in }
        .cm-img-msg:hover { opacity: .92 }
        .cm-close-btn { transition: all .15s }
        .cm-close-btn:hover { background: rgba(255,255,255,.12); transform: scale(1.08) }
      `}</style>

      {/* ── Overlay ── */}
      <div
        className="cm-root"
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(2,6,18,0.85)",
          backdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        {/* ── Modal Shell ── */}
        <div
          className="cm-modal-enter"
          style={{
            width: "100%", maxWidth: "780px", height: "82vh",
            background: "linear-gradient(165deg, #0d1629 0%, #0a1020 60%, #0d1629 100%)",
            borderRadius: "24px",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 32px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04) inset",
            display: "grid",
            gridTemplateRows: "auto 1fr auto",
            overflow: "hidden",
          }}
        >

          {/* ══ HEADER ══ */}
          <div style={{
            padding: "14px 20px",
            background: "rgba(255,255,255,0.03)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", gap: "14px",
          }}>
            {/* Item thumb */}
            <div style={{
              width: 46, height: 46, borderRadius: 12, overflow: "hidden", flexShrink: 0,
              border: "1.5px solid rgba(255,255,255,.1)",
              background: "#1e293b",
            }}>
              {itemThumb
                ? <img src={itemThumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🛒</div>}
            </div>

            {/* ✅ FIX: Title = seller's username, subtitle = item name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 700, color: "#f1f5f9",
                letterSpacing: "-.01em", whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {headerName}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                {typingPeers.length > 0 ? (
                  <span style={{ fontSize: 12, color: "#38bdf8", fontWeight: 500 }}>typing…</span>
                ) : (
                  <>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#64748b" }}>online</span>
                  </>
                )}
                <span style={{ fontSize: 12, color: "#334155" }}>·</span>
                <span style={{
                  fontSize: 11, color: "#475569", fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: 200,
                }}>
                  {item?.title || "Listing"}
                </span>
              </div>
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="cm-close-btn"
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.08)",
                color: "#94a3b8", fontSize: 16, display: "flex",
                alignItems: "center", justifyContent: "center", cursor: "pointer",
                flexShrink: 0,
              }}
            >✕</button>
          </div>

          {/* ══ MESSAGES ══ */}
          <div
            style={{
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: aiModeEnabled && aiVisibility.showDealSidebar && aiChatInsight?.deal
                ? "1fr minmax(220px,260px)"
                : "1fr",
            }}
          >
            <div
              className="cm-scroll"
              style={{
                overflowY: "auto", padding: "16px 20px",
                display: "flex", flexDirection: "column", gap: 2,
                backgroundImage: `
                  radial-gradient(ellipse 60% 40% at 20% 80%, rgba(14,165,233,0.04) 0%, transparent 70%),
                  radial-gradient(ellipse 40% 30% at 80% 20%, rgba(99,102,241,0.04) 0%, transparent 70%)
                `,
              }}
            >
              {messages.length === 0 && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: 12 }}>
                  <div style={{ fontSize: 42 }}>👋</div>
                  <div style={{ color: "#475569", fontSize: 14, textAlign: "center", maxWidth: 240 }}>
                    Say hi to <strong style={{ color: "#94a3b8" }}>{headerName}</strong>!<br />
                    Ask about the listing or make an offer.
                  </div>
                </div>
              )}

              {grouped.map((entry, i) => {
                if (entry.type === "divider") {
                  return (
                    <div key={`div-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
                      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} />
                      <span style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap", fontWeight: 500 }}>{entry.label}</span>
                      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.06)" }} />
                    </div>
                  )
                }

                const msg = entry.data
                const mine = msg.senderId === user?.uid
                const isLast = mine && messages[messages.length - 1]?.id === msg.id
                const otherUid = sellerId === user?.uid ? msg.buyerId : sellerId
                const seen = isLast && convMeta?.lastRead?.[otherUid || ""]

                return (
                  <div key={msg.id} className="cm-bubble" style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 2 }}>
                    <div style={{ maxWidth: "68%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                      <div style={{
                        padding: msg.imageUrl && !msg.text ? "4px" : "10px 14px",
                        borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        background: mine
                          ? "linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)"
                          : "rgba(255,255,255,0.07)",
                        backdropFilter: mine ? "none" : "blur(8px)",
                        border: mine ? "none" : "1px solid rgba(255,255,255,.08)",
                        boxShadow: mine ? "0 4px 20px rgba(14,165,233,.25)" : "0 2px 8px rgba(0,0,0,.3)",
                        color: "#f8fafc",
                      }}>
                        {/* ✅ Show sender's actual username, not generic "Seller" */}
                        {!mine && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", marginBottom: msg.text || msg.imageUrl ? 4 : 0, textTransform: "uppercase", letterSpacing: ".05em" }}>
                            {msg.senderName || headerName}
                          </div>
                        )}
                        {msg.imageUrl && (
                          <img
                            src={msg.imageUrl}
                            alt="media"
                            className="cm-img-msg"
                            onClick={() => setImgPreview(msg.imageUrl)}
                            style={{ display: "block", maxHeight: 220, borderRadius: 12, objectFit: "cover", maxWidth: "100%" }}
                          />
                        )}
                        {msg.text && (
                          <p style={{ margin: msg.imageUrl ? "8px 0 0" : 0, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {msg.text}
                          </p>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, paddingLeft: 2, paddingRight: 2 }}>
                        <span style={{ fontSize: 10, color: "#475569" }}>{fmt(msg.createdAt)}</span>
                        {mine && (
                          <span style={{ fontSize: 12, color: seen ? "#38bdf8" : "#475569" }}>
                            {seen ? "✓✓" : "✓"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Typing indicator */}
              {typingPeers.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 4 }}>
                  <div style={{
                    padding: "10px 16px", borderRadius: "18px 18px 18px 4px",
                    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,.08)",
                  }}>
                    <div className="cm-typing" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span /><span /><span />
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* AI Deal Sidebar */}
            {aiModeEnabled && aiVisibility.showDealSidebar && aiChatInsight?.deal ? (
              <aside
                style={{
                  borderLeft: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(255,255,255,0.03)",
                  padding: "14px 12px",
                  overflowY: "auto",
                  display: "grid",
                  alignContent: "start",
                  gap: 10,
                }}
              >
                <p className="ai-chat-label">Deal Sidebar</p>
                <span className="ai-chat-pill">Price: {aiChatInsight.deal.priceEvaluation || "--"}</span>
                <span className="ai-chat-pill">Close: {toPercent(aiChatInsight.deal?.dealSuccess?.closeProbability)}</span>
                <span className="ai-chat-pill">
                  Time: {aiChatInsight.deal?.dealSuccess?.timeToCloseHours ?? aiChatInsight.deal?.dealSuccess?.etaHours ?? "--"}h
                </span>
                <span className="ai-chat-pill">Momentum: {aiChatInsight.deal?.dealMomentum || "--"}</span>
                <div className="ai-chat-side-card">
                  <p className="ai-chat-side-title">Price insights</p>
                  <p className="ai-chat-side-line">Fast sale: Rs {aiChatInsight.deal?.multiScenarioPricing?.fastSale ?? "--"}</p>
                  <p className="ai-chat-side-line">Balanced: Rs {aiChatInsight.deal?.multiScenarioPricing?.balanced ?? "--"}</p>
                  <p className="ai-chat-side-line">Max profit: Rs {aiChatInsight.deal?.multiScenarioPricing?.maxProfit ?? "--"}</p>
                </div>
                {aiChatInsight.deal?.offerQuality ? (
                  <div className="ai-chat-side-card">
                    <p className="ai-chat-side-title">Offer score</p>
                    <p className="ai-chat-side-line">Fairness: {Math.round((aiChatInsight.deal.offerQuality.fairness || 0) * 100)}%</p>
                    <p className="ai-chat-side-line">Seriousness: {Math.round((aiChatInsight.deal.offerQuality.seriousness || 0) * 100)}%</p>
                    <p className="ai-chat-side-line">Closure: {Math.round((aiChatInsight.deal.offerQuality.likelihoodToClose || 0) * 100)}%</p>
                  </div>
                ) : null}
                {Array.isArray(aiChatInsight.deal?.structuredNegotiationGuidance) ? (
                  <div className="ai-chat-side-card">
                    <p className="ai-chat-side-title">Negotiation flow</p>
                    <p className="ai-chat-side-line">
                      {aiChatInsight.deal.structuredNegotiationGuidance.join(" -> ")}
                    </p>
                    {aiChatInsight.deal?.negotiationSuggestions?.hint ? (
                      <p className="ai-chat-side-line">{aiChatInsight.deal.negotiationSuggestions.hint}</p>
                    ) : null}
                  </div>
                ) : null}
              </aside>
            ) : null}
          </div>

          {/* ══ FOOTER ══ */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", background: "rgba(255,255,255,.02)" }}>
            {aiModeEnabled && aiVisibility.showAssistBar ? (
              <div style={{ padding: "10px 16px 2px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="ai-chat-label">AI Assist</span>
                  {aiChatInsight?.conversation?.intent
                  && String(aiChatInsight.conversation.intent).toLowerCase() !== "casual" ? (
                    <span className="ai-chat-pill">Intent: {aiChatInsight.conversation.intent}</span>
                  ) : null}
                  {aiChatInsight?.conversation?.tone
                  && String(aiChatInsight.conversation.tone).toLowerCase() !== "serious" ? (
                    <span className="ai-chat-pill">Tone: {aiChatInsight.conversation.tone}</span>
                  ) : null}
                  {(Number(aiChatInsight?.conversation?.commitmentScore) >= 70
                  || Number(aiChatInsight?.conversation?.commitmentScore) <= 35) ? (
                    <span className="ai-chat-pill">
                      Commitment: {aiChatInsight?.conversation?.commitmentScore ?? "--"}
                    </span>
                  ) : null}
                  {aiVisibility.showRiskSignals && aiChatInsight?.trust?.riskAlert ? (
                    <span className="ai-chat-pill">{aiChatInsight.trust.riskAlert}</span>
                  ) : null}
                  {aiVisibility.showRiskSignals && Array.isArray(aiChatInsight?.trust?.warnings)
                    ? aiChatInsight.trust.warnings.slice(0, 1).map((warning) => (
                      <span key={warning} className="ai-chat-pill">{warning}</span>
                    ))
                    : null}
                </div>
                {aiChatInsight?.conversation?.suggestion ? (
                  <p className="ai-chat-note">Suggested: {aiChatInsight.conversation.suggestion}</p>
                ) : aiChatInsight?.conversation?.suggestions?.clarificationPrompt ? (
                  <p className="ai-chat-note">{aiChatInsight.conversation.suggestions.clarificationPrompt}</p>
                ) : null}
                {aiChatInsight?.systemGoal?.priorityActions?.[0]?.action ? (
                  <p className="ai-chat-note">AI Priority: {aiChatInsight.systemGoal.priorityActions[0].action}</p>
                ) : null}
                {aiError ? <p className="ai-chat-note warn">AI fallback active: {aiError}</p> : null}
              </div>
            ) : null}

            {/* Quick chips row */}
            <div style={{ padding: "10px 16px 6px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {aiModeEnabled && aiVisibility.showAssistBar && aiQuickSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="cm-chip"
                  onClick={() => sendMessage({ overrideText: suggestion })}
                  style={{
                    fontSize: 12, fontWeight: 700, color: "#7dd3fc",
                    background: "rgba(14,165,233,.15)",
                    border: "1px solid rgba(14,165,233,.3)",
                    borderRadius: 20, padding: "4px 12px", cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {suggestion}
                </button>
              ))}
              {QUICK.map((q) => (
                <button
                  key={q.label}
                  className="cm-chip"
                  onClick={() => sendMessage({ overrideText: q.text })}
                  style={{
                    fontSize: 12, fontWeight: 500, color: "#94a3b8",
                    background: "rgba(255,255,255,.05)",
                    borderRadius: 20, padding: "4px 12px", cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >{q.label}</button>
              ))}
              <div style={{ flex: 1 }} />
              {ACTION_CHIPS.map((a) =>
                a.href
                  ? <a key={a.label} href={a.href} target="_blank" rel="noreferrer"
                      className="cm-chip"
                      style={{
                        fontSize: 12, fontWeight: 600, color: "#94a3b8",
                        background: "rgba(255,255,255,.05)",
                        borderRadius: 20, padding: "4px 12px", cursor: "pointer",
                        textDecoration: "none",
                      }}>{a.label}</a>
                  : <button key={a.label} onClick={() => sendMessage({ overrideText: a.text })}
                      className="cm-chip"
                      style={{
                        fontSize: 12, fontWeight: 600, color: "#fff",
                        background: `${a.color}22`,
                        borderColor: `${a.color}44`,
                        borderRadius: 20, padding: "4px 12px", cursor: "pointer",
                        fontFamily: "inherit",
                      }}>{a.label}</button>
              )}
            </div>

            {/* Staged image preview */}
            {pendingPreview && (
              <div style={{
                margin: "0 16px 8px",
                borderRadius: 14,
                overflow: "hidden",
                position: "relative",
                background: "#0b1220",
                border: "1px solid rgba(255,255,255,.1)",
                display: "flex", alignItems: "center", padding: 8, gap: 10,
              }}>
                <img src={pendingPreview} alt="staged" style={{ height: 56, width: 56, objectFit: "cover", borderRadius: 10 }} />
                <span style={{ fontSize: 13, color: "#94a3b8", flex: 1 }}>Ready to send</span>
                <button onClick={() => { setPendingFile(null); setPendingPreview(null) }}
                  style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
                <button onClick={sendStagedImage} disabled={uploading}
                  style={{
                    background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
                    color: "#fff", border: "none", borderRadius: 10,
                    padding: "6px 16px", fontWeight: 700, cursor: "pointer",
                    fontSize: 13, fontFamily: "inherit",
                  }}>
                  {uploading ? "Uploading…" : "Send 📤"}
                </button>
              </div>
            )}

            {/* Input row */}
            <div style={{ padding: "8px 16px 14px", display: "flex", alignItems: "center", gap: 8 }}>

              {/* Emoji */}
              <div ref={emojiRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setShowEmojis((v) => !v)}
                  style={{
                    width: 44, height: 44, borderRadius: 14, fontSize: 20,
                    background: showEmojis ? "rgba(14,165,233,.15)" : "rgba(255,255,255,.06)",
                    border: `1px solid ${showEmojis ? "rgba(14,165,233,.4)" : "rgba(255,255,255,.08)"}`,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all .15s",
                  }}
                >😊</button>

                {showEmojis && (
                  <div style={{
                    position: "absolute", bottom: 52, left: 0, zIndex: 10,
                    background: "#0d1629",
                    border: "1px solid rgba(255,255,255,.1)",
                    borderRadius: 18, padding: 10,
                    display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4,
                    boxShadow: "0 16px 48px rgba(0,0,0,.6)",
                    animation: "cm-pop .15s ease both",
                  }}>
                    {EMOJIS.map((e) => (
                      <button key={e} onClick={() => { setText((t) => t + e); setShowEmojis(false); inputRef.current?.focus() }}
                        style={{
                          width: 36, height: 36, borderRadius: 10, fontSize: 18, cursor: "pointer",
                          background: "transparent", border: "none",
                          transition: "background .1s",
                        }}
                        onMouseEnter={(ev) => ev.currentTarget.style.background = "rgba(255,255,255,.08)"}
                        onMouseLeave={(ev) => ev.currentTarget.style.background = "transparent"}
                      >{e}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Image attach */}
              <label style={{
                width: 44, height: 44, borderRadius: 14, fontSize: 20,
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)",
                cursor: uploading ? "not-allowed" : "pointer", display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
                opacity: uploading ? .5 : 1,
              }}>
                📎
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = "" }} />
              </label>

              {aiModeEnabled ? (
                <button
                  onClick={() => setToneGuardEnabled((prev) => !prev)}
                  className={`ai-tone-toggle ${toneGuardEnabled ? "active" : ""}`}
                  title="Tone correction before send"
                >
                  Tone
                </button>
              ) : null}

              {/* Text input */}
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => { setText(e.target.value); setTyping(true) }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder={uploading ? "Uploading…" : `Message ${headerName}…`}
                disabled={uploading}
                style={{
                  flex: 1, height: 44, borderRadius: 14,
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.08)",
                  color: "#f1f5f9", padding: "0 16px",
                  fontSize: 14, fontFamily: "inherit", outline: "none",
                  transition: "border-color .15s",
                }}
                onFocus={(e) => e.target.style.borderColor = "rgba(14,165,233,.5)"}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,.08)"; setTyping(false) }}
              />

              {/* Send */}
              <button
                onClick={() => sendMessage()}
                disabled={uploading || (!text.trim() && !pendingFile)}
                className="cm-send-btn"
                style={{
                  width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                  background: text.trim() || pendingFile
                    ? "linear-gradient(135deg, #0ea5e9, #2563eb)"
                    : "rgba(255,255,255,.06)",
                  border: "none", cursor: text.trim() || pendingFile ? "pointer" : "default",
                  color: "#fff", fontSize: 20, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  boxShadow: text.trim() ? "0 4px 16px rgba(14,165,233,.35)" : "none",
                  transition: "all .15s",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Image Lightbox ── */}
      {imgPreview && (
        <div
          onClick={() => setImgPreview(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,.92)", backdropFilter: "blur(16px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img src={imgPreview} alt="preview"
            style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 16, boxShadow: "0 0 80px rgba(0,0,0,.8)", objectFit: "contain" }} />
          <button onClick={() => setImgPreview(null)}
            style={{
              position: "absolute", top: 20, right: 20,
              background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.15)",
              borderRadius: "50%", width: 40, height: 40, color: "#fff",
              fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
        </div>
      )}
    </>
  )
}

export default ChatModal