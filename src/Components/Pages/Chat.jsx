import { useEffect, useMemo, useState } from "react";
import Navbar from "../Navbar/Navbar";
import Login from "../Modal/Login";
import Sell from "../Modal/Sell";
import ChatModal from "../Chat/ChatModal";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, fireStore } from "../Firebase/Firebase";
import { collection, onSnapshot, query, where, deleteDoc, doc, getDocs } from "firebase/firestore";
import { ItemsContext } from "../Context/Item";

/* ─── time formatter ─────────────────────────────────────────────── */
const fmtTime = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

/* ══════════════════════════════════════════════════════════════════ */
const Chat = () => {
  const [openModal, setModal] = useState(false);
  const [openModalSell, setModalSell] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [activeConvId, setActiveConvId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState("");
  const [user] = useAuthState(auth);
  const itemsCtx = ItemsContext();

  const toggleModal = () => setModal((p) => !p);
  const toggleModalSell = () => setModalSell((p) => !p);

  /* ── conversations listener ── */
  useEffect(() => {
    if (!user?.uid) { setConversations([]); return; }
    const q = query(
      collection(fireStore, "conversations"),
      where("participants", "array-contains", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.lastUpdated?.toMillis?.() || 0) - (a.lastUpdated?.toMillis?.() || 0));
      setConversations(list);
    });
    return () => unsub();
  }, [user?.uid]);

  const itemById = useMemo(() => {
    const m = new Map();
    (itemsCtx.items || []).forEach((it) => m.set(it.id, it));
    return m;
  }, [itemsCtx.items]);

  const decorated = useMemo(() => {
    const sorted = [...conversations].sort(
      (a, b) => (b.lastUpdated?.toMillis?.() || 0) - (a.lastUpdated?.toMillis?.() || 0)
    )
    return sorted.map((conv) => {
      const otherId = (conv.participants || []).find((p) => p !== user?.uid) || conv.sellerId;
      const item = itemById.get(conv.itemId) || {
        id: conv.itemId,
        title: conv.itemTitle || "Listing",
        imageUrl: conv.itemImage || "",
        userId: otherId,
        userName: conv.participantsNames?.[otherId] || conv.otherName || "User",
      };
      const lastUpdatedMs = conv.lastUpdated?.toMillis?.() || 0;
      const lastReadMs = conv.lastRead?.[user?.uid || ""]?.toMillis?.() || 0;
      const hasUnread = !!(conv.lastMessage || conv.lastMessageType) && lastUpdatedMs > lastReadMs;
      const displayName = item.title || conv.itemTitle || "Listing";
      return { ...conv, item, hasUnread, displayName, otherId };
    })
  }, [conversations, itemById, user?.uid]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return s ? decorated.filter((c) => (c.item?.title || "").toLowerCase().includes(s) || (c.lastMessage || "").toLowerCase().includes(s)) : decorated;
  }, [decorated, search]);


  /* auto-select first */
  useEffect(() => {
    if (!activeConvId && filtered.length > 0) setActiveConvId(filtered[0].id);
    if (activeConvId && filtered.every((c) => c.id !== activeConvId)) setActiveConvId(filtered[0]?.id || null);
  }, [filtered, activeConvId]);

  const activeConv = filtered.find((c) => c.id === activeConvId) || null;
  const totalUnread = filtered.filter((c) => c.hasUnread).length;

  const deleteConversation = async (convId) => {
    try {
      const msgSnap = await getDocs(query(collection(fireStore, "messages"), where("conversationId", "==", convId)))
      await Promise.all(msgSnap.docs.map((d) => deleteDoc(d.ref)))
      const notifSnap = await getDocs(query(collection(fireStore, "notifications"), where("conversationId", "==", convId)))
      await Promise.all(notifSnap.docs.map((d) => deleteDoc(d.ref)))
      await deleteDoc(doc(fireStore, "conversations", convId))
      if (activeConvId === convId) setActiveConvId(null)
    } catch (err) {
      console.error(err)
      alert("Failed to delete chat. Try again.")
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap');
        .ch-root { font-family: 'Plus Jakarta Sans', sans-serif; }
        .ch-scroll::-webkit-scrollbar { width: 4px }
        .ch-scroll::-webkit-scrollbar-track { background: transparent }
        .ch-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 8px }
        .ch-row { transition: background .15s, transform .12s }
        .ch-row:hover { background: rgba(255,255,255,.05) !important }
        .ch-row:active { transform: scale(.99) }
        .ch-search:focus { border-color: rgba(14,165,233,.5) !important; outline: none }
        .ch-open-btn { transition: all .15s }
        .ch-open-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(14,165,233,.35) !important }
        .ch-open-btn:active { transform: scale(.97) }
        .ch-fade-in { animation: ch-fade .4s ease both }
        .ch-fade-in-up { animation: ch-fade-up .35s ease both }
        @keyframes ch-fade { from { opacity:0 } to { opacity:1 } }
        @keyframes ch-fade-up { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        .ch-stagger:nth-child(1)  { animation-delay: .04s }
        .ch-stagger:nth-child(2)  { animation-delay: .08s }
        .ch-stagger:nth-child(3)  { animation-delay: .12s }
        .ch-stagger:nth-child(4)  { animation-delay: .16s }
        .ch-stagger:nth-child(5)  { animation-delay: .20s }
        .ch-stagger:nth-child(n+6){ animation-delay: .24s }
        .ch-avatar-ring { transition: box-shadow .2s }
        .ch-row:hover .ch-avatar-ring { box-shadow: 0 0 0 2px rgba(14,165,233,.5) }
      `}</style>

      <div
        className="ch-root ch-fade-in"
        style={{
          minHeight: "100vh",
          background: "linear-gradient(160deg, #080e1c 0%, #060b17 50%, #0a1020 100%)",
          backgroundAttachment: "fixed",
        }}
      >
        {/* ── subtle mesh bg ── */}
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: `
            radial-gradient(ellipse 55% 35% at 5% 90%, rgba(14,165,233,0.06) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 95% 10%, rgba(99,102,241,0.05) 0%, transparent 70%)
          `,
        }} />

        <Navbar toggleModal={toggleModal} toggleModalSell={toggleModalSell} />

        <main style={{ position: "relative", zIndex: 1, paddingTop: 112, maxWidth: 1200, margin: "0 auto", padding: "112px 20px 40px" }}>

          {/* ── Page header ── */}
          <div className="ch-fade-in-up" style={{ marginBottom: 28, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".18em", color: "#0ea5e9", textTransform: "uppercase", marginBottom: 4 }}>
                Inbox
              </p>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-.03em", margin: 0 }}>
                Messages
                {totalUnread > 0 && (
                  <span style={{
                    marginLeft: 10, fontSize: 13, fontWeight: 700,
                    background: "linear-gradient(135deg,#0ea5e9,#2563eb)",
                    borderRadius: 20, padding: "2px 10px", color: "#fff",
                    verticalAlign: "middle", boxShadow: "0 2px 10px rgba(14,165,233,.35)",
                  }}>{totalUnread} new</span>
                )}
              </h1>
            </div>
            {!user && (
              <button
                onClick={toggleModal}
                className="ch-open-btn"
                style={{
                  background: "linear-gradient(135deg,#0ea5e9,#2563eb)",
                  color: "#fff", border: "none", borderRadius: 14,
                  padding: "10px 24px", fontWeight: 700, fontSize: 14,
                  cursor: "pointer", fontFamily: "inherit",
                  boxShadow: "0 4px 16px rgba(14,165,233,.3)",
                }}
              >Sign in to chat</button>
            )}
          </div>

          {/* ══ LOGGED IN ══ */}
          {user ? (
            <div
              className="ch-fade-in-up"
              style={{
                display: "grid",
                gridTemplateColumns: "340px 1fr",
                gap: 16,
                height: "calc(100vh - 220px)",
                minHeight: 480,
              }}
            >
              {/* ── LEFT: Conversation list ── */}
              <div style={{
                borderRadius: 22,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 8px 40px rgba(0,0,0,.4)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}>
                {/* search bar */}
                <div style={{ padding: "14px 14px 10px" }}>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, pointerEvents: "none", opacity: .5 }}>🔍</span>
                    <input
                      className="ch-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search conversations…"
                      style={{
                        width: "100%", height: 40, borderRadius: 12,
                        background: "rgba(255,255,255,.06)",
                        border: "1px solid rgba(255,255,255,.08)",
                        color: "#e2e8f0", paddingLeft: 38, paddingRight: 14,
                        fontSize: 13, fontFamily: "inherit",
                        boxSizing: "border-box", transition: "border-color .15s",
                      }}
                    />
                  </div>
                </div>

                {/* header count */}
                <div style={{ padding: "0 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".1em" }}>
                    {filtered.length} chat{filtered.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* list */}
                <div className="ch-scroll" style={{ flex: 1, overflowY: "auto" }}>
                  {filtered.length === 0 ? (
                    <div style={{ padding: "40px 20px", textAlign: "center" }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
                      <p style={{ color: "#475569", fontSize: 13 }}>
                        {search ? "No matches found." : "No conversations yet.\nMessage a seller from a listing to start a chat."}
                      </p>
                    </div>
                  ) : (
                    filtered.map((conv) => {
                      const active = conv.id === activeConvId;
                      return (
                        <button
                          key={conv.id}
                          className="ch-row ch-fade-in ch-stagger"
                          onClick={() => { setActiveConvId(conv.id); setShowChat(false); }}
                          style={{
                            width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                            padding: "12px 14px",
                            background: active ? "rgba(14,165,233,.1)" : "transparent",
                            borderLeft: active ? "3px solid #0ea5e9" : "3px solid transparent",
                            display: "flex", gap: 12, alignItems: "center",
                            fontFamily: "inherit",
                          }}
                        >
                          {/* thumb */}
                          <div
                            className="ch-avatar-ring"
                            style={{
                              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                              overflow: "hidden", background: "#1e293b",
                              border: "1.5px solid rgba(255,255,255,.08)",
                              boxShadow: active ? "0 0 0 2px rgba(14,165,233,.5)" : "none",
                              transition: "box-shadow .2s",
                            }}
                          >
                            {conv.item?.imageUrl
                              ? <img src={conv.item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🛍️</div>
                            }
                          </div>

                          {/* content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: active ? "#e2e8f0" : "#cbd5e1", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {conv.displayName || conv.item?.title || "Chat"}
                              </p>
                            <span style={{ fontSize: 10, color: "#475569", whiteSpace: "nowrap", flexShrink: 0 }}>
                              {fmtTime(conv.lastUpdated)}
                            </span>
                          </div>
                            <p style={{ fontSize: 12, color: conv.hasUnread ? "#94a3b8" : "#475569", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: conv.hasUnread ? 600 : 400, fontStyle: conv.lastMessage ? "normal" : "italic" }}>
                              {conv.lastMessage || (conv.lastMessageType === "image" ? "📷 Photo" : "No messages yet — start chatting")}
                            </p>
                          </div>

                          {/* unread dot */}
                          {conv.hasUnread && (
                            <span style={{
                              width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                              background: "linear-gradient(135deg,#0ea5e9,#2563eb)",
                              boxShadow: "0 0 6px rgba(14,165,233,.7)",
                              alignSelf: "center",
                            }} />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── RIGHT: Preview panel ── */}
              <div style={{
                borderRadius: 22,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 8px 40px rgba(0,0,0,.35)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}>
                {activeConv ? (
                  <>
                    {/* Top info bar */}
                    <div style={{
                      padding: "20px 28px",
                      borderBottom: "1px solid rgba(255,255,255,.06)",
                      background: "rgba(255,255,255,.02)",
                      display: "flex", alignItems: "center", gap: 18,
                    }}>
                      <div style={{
                        width: 64, height: 64, borderRadius: 18, overflow: "hidden",
                        border: "2px solid rgba(255,255,255,.1)", flexShrink: 0,
                        background: "#1e293b",
                        boxShadow: "0 4px 20px rgba(0,0,0,.4)",
                      }}>
                        {activeConv.item?.imageUrl
                          ? <img src={activeConv.item.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🛒</div>
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "#0ea5e9", textTransform: "uppercase", margin: "0 0 4px" }}>Chat</p>
                        <p style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: "-.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {(activeConv.displayName || activeConv.item?.title || "Chat")}
                        </p>
                        <p style={{ fontSize: 12, color: "#475569", margin: "4px 0 0" }}>
                          Last activity · {fmtTime(activeConv.lastUpdated)}
                        </p>
                      </div>
                      {activeConv.hasUnread && (
                        <div style={{
                          fontSize: 11, fontWeight: 700, color: "#fff",
                          background: "linear-gradient(135deg,#0ea5e9,#2563eb)",
                          borderRadius: 20, padding: "4px 12px",
                          boxShadow: "0 2px 10px rgba(14,165,233,.4)",
                          whiteSpace: "nowrap",
                        }}>New messages</div>
                      )}
                    </div>

                    {/* Preview area: show latest message only */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 40px 20px", gap: 12 }}>
                      <div style={{ width: "100%", maxWidth: 420 }}>
                        <div style={{ display: "flex", justifyContent: activeConv.lastSenderId === user?.uid ? "flex-end" : "flex-start" }}>
                          <div style={{
                            padding: "10px 14px",
                            borderRadius: activeConv.lastSenderId === user?.uid ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                            background: activeConv.lastSenderId === user?.uid ? "linear-gradient(135deg,#0ea5e9,#2563eb)" : "rgba(255,255,255,.08)",
                            color: "#e2e8f0",
                            fontSize: 14,
                            maxWidth: "80%",
                            boxShadow: activeConv.lastSenderId === user?.uid ? "0 4px 18px rgba(14,165,233,.35)" : "0 2px 10px rgba(0,0,0,.35)",
                          }}>
                            {activeConv.lastMessage || (activeConv.lastMessageType === "image" ? "📷 Photo" : "No messages yet.")}
                          </div>
                        </div>
                        <p style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>
                          {activeConv.lastMessage ? "Most recent message" : "Start chatting to see your latest message preview here."}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ padding: "20px 28px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
                      <button
                        className="ch-open-btn"
                        onClick={() => setShowChat(true)}
                        style={{
                          background: "linear-gradient(135deg,#0ea5e9,#2563eb)",
                          color: "#fff", border: "none", borderRadius: 14,
                          padding: "12px 32px", fontWeight: 700, fontSize: 15,
                          cursor: "pointer", fontFamily: "inherit",
                          boxShadow: "0 4px 20px rgba(14,165,233,.3)",
                          display: "flex", alignItems: "center", gap: 8,
                        }}
                      >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Open Chat
                      </button>
                      {activeConv && (
                        <button
                          onClick={() => deleteConversation(activeConv.id)}
                          style={{
                            background: "rgba(239,68,68,0.12)",
                            color: "#f87171",
                            border: "1px solid rgba(239,68,68,0.25)",
                            borderRadius: 14,
                            padding: "12px 16px",
                            fontWeight: 700,
                            fontSize: 14,
                            cursor: "pointer",
                          }}
                        >
                          Delete Chat
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: .5 }}>
                    <div style={{ fontSize: 48 }}>💬</div>
                    <p style={{ color: "#475569", fontSize: 14 }}>Select a conversation to preview</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ══ LOGGED OUT ══ */
            <div
              className="ch-fade-in-up"
              style={{
                borderRadius: 22,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                padding: "60px 40px",
                textAlign: "center",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
              }}
            >
              <div style={{ fontSize: 52 }}>🔒</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Sign in to see your messages</h2>
              <p style={{ fontSize: 14, color: "#475569", maxWidth: 320 }}>
                Chat with sellers, negotiate prices, and arrange pickups — all in one place.
              </p>
              <button
                className="ch-open-btn"
                onClick={toggleModal}
                style={{
                  background: "linear-gradient(135deg,#0ea5e9,#2563eb)",
                  color: "#fff", border: "none", borderRadius: 14,
                  padding: "12px 32px", fontWeight: 700, fontSize: 15,
                  cursor: "pointer", fontFamily: "inherit",
                  boxShadow: "0 4px 20px rgba(14,165,233,.3)", marginTop: 8,
                }}
              >Sign In</button>
            </div>
          )}
        </main>
      </div>

      <Login openModal={openModal} toggleModal={toggleModal} />
      <Sell setItems={itemsCtx.setItems} toggleModal={toggleModalSell} status={openModalSell} />
      {activeConv && (
        <ChatModal
          open={showChat}
          onClose={() => setShowChat(false)}
          item={activeConv.item}
          user={user}
          conversationId={activeConv.id}
        />
      )}
    </>
  );
};

export default Chat;
