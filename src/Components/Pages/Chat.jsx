import { useEffect, useMemo, useState } from "react";
import Navbar from "../Navbar/Navbar";
import Login from "../Modal/Login";
import Sell from "../Modal/Sell";
import ChatModal from "../Chat/ChatModal";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, fireStore } from "../Firebase/Firebase";
import { collection, onSnapshot, query, where, deleteDoc, doc, getDocs } from "firebase/firestore";
import { ItemsContext } from "../Context/Item";
import { useAIMode } from "../Context/AIMode";

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
  const { aiModeEnabled } = useAIMode();

  const toggleModal = () => setModal((p) => !p);
  const toggleModalSell = () => setModalSell((p) => !p);

  /* ── Conversations: three parallel listeners so we never miss one ──
     Reason: if ChatModal's first setDoc had a malformed participants
     array (e.g. item.userId was undefined), the array-contains query
     would miss the conversation. The buyerId / sellerId queries act
     as guaranteed fallbacks because sendMessage() always writes those.
  ─────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user?.uid) { setConversations([]); return; }

    // Use a Map so duplicates from overlapping queries are de-duped by id
    const seen = new Map();

    const push = (snap) => {
      snap.docs.forEach((d) => {
        const data = { id: d.id, ...d.data() };
        // Only surface conversations that have at least one real message
        if (data.lastMessage || data.lastMessageType) {
          seen.set(d.id, data);
        } else {
          // If a conversation was removed from the map due to no messages,
          // remove it (handles the edge case where lastMessage was cleared)
          seen.delete(d.id);
        }
      });
      const list = [...seen.values()].sort(
        (a, b) => (b.lastUpdated?.toMillis?.() || 0) - (a.lastUpdated?.toMillis?.() || 0)
      );
      setConversations(list);
    };

    // ✅ Query 1: normal path — both UIDs correctly in participants array
    const q1 = query(
      collection(fireStore, "conversations"),
      where("participants", "array-contains", user.uid)
    );
    // ✅ Query 2: fallback for Evan (buyer) if participants was written wrongly
    const q2 = query(
      collection(fireStore, "conversations"),
      where("buyerId", "==", user.uid)
    );
    // ✅ Query 3: fallback for Vishal (seller)
    const q3 = query(
      collection(fireStore, "conversations"),
      where("sellerId", "==", user.uid)
    );

    const u1 = onSnapshot(q1, push, console.error);
    const u2 = onSnapshot(q2, push, console.error);
    const u3 = onSnapshot(q3, push, console.error);

    return () => { u1(); u2(); u3(); };
  }, [user?.uid]);

  const itemById = useMemo(() => {
    const m = new Map();
    (itemsCtx.items || []).forEach((it) => m.set(it.id, it));
    return m;
  }, [itemsCtx.items]);

  const decorated = useMemo(() => {
    return conversations.map((conv) => {
      // ── Am I the seller or buyer for this conversation? ──────────
      const iAmSeller = user?.uid === conv.sellerId;

      // ── Resolve the other person's UID ──────────────────────────
      const otherId = iAmSeller
        ? (conv.buyerId  || (conv.participants || []).find((p) => p !== user?.uid))
        : (conv.sellerId || (conv.participants || []).find((p) => p !== user?.uid));

      // ── Resolve the other person's display name ─────────────────
      // Priority: dedicated role field → participantsNames map → fallback label
      //
      // KEY FIX: we use role-aware fields (buyerName / sellerName) written by
      // ChatModal so Vishal always sees "Evan" and Evan always sees "Vishal",
      // regardless of how participantsNames is populated.
      const otherPersonName = iAmSeller
        ? (conv.buyerName  || (otherId && conv.participantsNames?.[otherId]) || "Buyer")
        : (conv.sellerName || conv.itemOwnerName || (otherId && conv.participantsNames?.[otherId]) || "Seller");

      // ── Build an item stub if not in local context ───────────────
      const item = itemById.get(conv.itemId) || {
        id:       conv.itemId,
        title:    conv.itemTitle  || "Listing",
        imageUrl: conv.itemImage  || "",
        userId:   conv.sellerId   || otherId,
        userName: conv.sellerName || "Seller",
      };

      // ── Unread indicator ─────────────────────────────────────────
      const lastUpdatedMs = conv.lastUpdated?.toMillis?.() || 0;
      const lastReadMs    = conv.lastRead?.[user?.uid || ""]?.toMillis?.() || 0;
      const hasUnread = !!(conv.lastMessage || conv.lastMessageType) && lastUpdatedMs > lastReadMs;

      return {
        ...conv,
        item,
        hasUnread,
        // displayName = the OTHER person's name (who you're talking to)
        displayName: otherPersonName,
        // itemTitle shown as subtitle
        itemTitle: item.title || conv.itemTitle || "Listing",
        otherId,
        iAmSeller,
      };
    });
  }, [conversations, itemById, user?.uid]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return s
      ? decorated.filter((c) =>
          (c.displayName || "").toLowerCase().includes(s) ||
          (c.itemTitle   || "").toLowerCase().includes(s) ||
          (c.lastMessage || "").toLowerCase().includes(s)
        )
      : decorated;
  }, [decorated, search]);

  /* auto-select first */
  useEffect(() => {
    if (!activeConvId && filtered.length > 0) setActiveConvId(filtered[0].id);
    if (activeConvId && filtered.every((c) => c.id !== activeConvId))
      setActiveConvId(filtered[0]?.id || null);
  }, [filtered, activeConvId]);

  const activeConv  = filtered.find((c) => c.id === activeConvId) || null;
  const totalUnread = filtered.filter((c) => c.hasUnread).length;

  const deleteConversation = async (convId) => {
    try {
      const msgSnap = await getDocs(
        query(collection(fireStore, "messages"), where("conversationId", "==", convId))
      );
      await Promise.all(msgSnap.docs.map((d) => deleteDoc(d.ref)));
      const notifSnap = await getDocs(
        query(collection(fireStore, "notifications"), where("conversationId", "==", convId))
      );
      await Promise.all(notifSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(fireStore, "conversations", convId));
      if (activeConvId === convId) setActiveConvId(null);
    } catch (err) {
      console.error(err);
      alert("Failed to delete chat. Try again.");
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap');
        .ch-root{font-family:'Plus Jakarta Sans',sans-serif}
        .ch-scroll::-webkit-scrollbar{width:4px}
        .ch-scroll::-webkit-scrollbar-track{background:transparent}
        .ch-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:8px}
        .ch-row{transition:background .15s,transform .12s;border:none;outline:none}
        .ch-row:hover{background:rgba(255,255,255,.055)!important}
        .ch-row:active{transform:scale(.99)}
        .ch-search:focus{border-color:rgba(14,165,233,.5)!important;outline:none}
        .ch-open-btn{transition:all .15s}
        .ch-open-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(14,165,233,.35)!important}
        .ch-open-btn:active{transform:scale(.97)}
        .ch-fade-in{animation:ch-fade .4s ease both}
        .ch-fade-in-up{animation:ch-fade-up .35s ease both}
        @keyframes ch-fade{from{opacity:0}to{opacity:1}}
        @keyframes ch-fade-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        .ch-stagger:nth-child(1){animation-delay:.04s}
        .ch-stagger:nth-child(2){animation-delay:.08s}
        .ch-stagger:nth-child(3){animation-delay:.12s}
        .ch-stagger:nth-child(4){animation-delay:.16s}
        .ch-stagger:nth-child(5){animation-delay:.20s}
        .ch-stagger:nth-child(n+6){animation-delay:.24s}
        .ch-avatar-ring{transition:box-shadow .2s}
        .ch-row:hover .ch-avatar-ring{box-shadow:0 0 0 2px rgba(14,165,233,.5)}
      `}</style>

      <div className="ch-root ch-fade-in" style={{minHeight:"100vh",background:"linear-gradient(160deg,#080e1c 0%,#060b17 50%,#0a1020 100%)",backgroundAttachment:"fixed"}}>
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,backgroundImage:`radial-gradient(ellipse 55% 35% at 5% 90%,rgba(14,165,233,0.06) 0%,transparent 70%),radial-gradient(ellipse 40% 30% at 95% 10%,rgba(99,102,241,0.05) 0%,transparent 70%)`}} />

        <Navbar toggleModal={toggleModal} toggleModalSell={toggleModalSell} />

        <main style={{position:"relative",zIndex:1,maxWidth:1200,margin:"0 auto",padding:"112px 20px 40px"}}>

          {/* Page header */}
          <div className="ch-fade-in-up" style={{marginBottom:28,display:"flex",alignItems:"flex-end",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div>
              <p style={{fontSize:11,fontWeight:700,letterSpacing:".18em",color:"#0ea5e9",textTransform:"uppercase",marginBottom:4}}>Inbox</p>
              <h1 style={{fontSize:28,fontWeight:800,color:"#f1f5f9",letterSpacing:"-.03em",margin:0}}>
                Messages
                {totalUnread > 0 && (
                  <span style={{marginLeft:10,fontSize:13,fontWeight:700,background:"linear-gradient(135deg,#0ea5e9,#2563eb)",borderRadius:20,padding:"2px 10px",color:"#fff",verticalAlign:"middle",boxShadow:"0 2px 10px rgba(14,165,233,.35)"}}>{totalUnread} new</span>
                )}
              </h1>
              {aiModeEnabled && (
                <p style={{marginTop:6,fontSize:12,color:"#67e8f9",fontWeight:700}}>
                  AI Assist active — intent, negotiation & trust signals running in chat.
                </p>
              )}
            </div>
            {!user && (
              <button onClick={toggleModal} className="ch-open-btn" style={{background:"linear-gradient(135deg,#0ea5e9,#2563eb)",color:"#fff",border:"none",borderRadius:14,padding:"10px 24px",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(14,165,233,.3)"}}>
                Sign in to chat
              </button>
            )}
          </div>

          {user ? (
            <div className="ch-fade-in-up" style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:16,height:"calc(100vh - 220px)",minHeight:480}}>

              {/* ── LEFT: list ── */}
              <div style={{borderRadius:22,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",backdropFilter:"blur(20px)",boxShadow:"0 8px 40px rgba(0,0,0,.4)",display:"flex",flexDirection:"column",overflow:"hidden"}}>

                <div style={{padding:"14px 14px 10px"}}>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,pointerEvents:"none",opacity:.5}}>🔍</span>
                    <input
                      className="ch-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name or listing…"
                      style={{width:"100%",height:40,borderRadius:12,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.08)",color:"#e2e8f0",paddingLeft:38,paddingRight:14,fontSize:13,fontFamily:"inherit",boxSizing:"border-box",transition:"border-color .15s"}}
                    />
                  </div>
                </div>

                <div style={{padding:"0 16px 10px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:".1em"}}>
                    {filtered.length} chat{filtered.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="ch-scroll" style={{flex:1,overflowY:"auto"}}>
                  {filtered.length === 0 ? (
                    <div style={{padding:"40px 20px",textAlign:"center"}}>
                      <div style={{fontSize:36,marginBottom:10}}>💬</div>
                      <p style={{color:"#475569",fontSize:13}}>
                        {search
                          ? "No matches found."
                          : "No conversations yet.\nBrowse listings and message a seller to start chatting."}
                      </p>
                    </div>
                  ) : filtered.map((conv) => {
                    const active = conv.id === activeConvId;
                    return (
                      <button
                        key={conv.id}
                        className="ch-row ch-fade-in ch-stagger"
                        onClick={() => { setActiveConvId(conv.id); setShowChat(false); }}
                        style={{width:"100%",textAlign:"left",border:"none",cursor:"pointer",padding:"12px 14px",background:active?"rgba(14,165,233,.1)":"transparent",borderLeft:active?"3px solid #0ea5e9":"3px solid transparent",display:"flex",gap:12,alignItems:"center",fontFamily:"inherit"}}
                      >
                        <div className="ch-avatar-ring" style={{width:52,height:52,borderRadius:14,flexShrink:0,overflow:"hidden",background:"#1e293b",border:"1.5px solid rgba(255,255,255,.08)",boxShadow:active?"0 0 0 2px rgba(14,165,233,.5)":"none",transition:"box-shadow .2s"}}>
                          {conv.item?.imageUrl
                            ? <img src={conv.item.imageUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} />
                            : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🛍️</div>
                          }
                        </div>

                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:4}}>
                            {/* ✅ displayName = the OTHER person's username */}
                            <p style={{fontSize:13,fontWeight:700,color:active?"#e2e8f0":"#cbd5e1",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {conv.displayName}
                            </p>
                            <span style={{fontSize:10,color:"#475569",whiteSpace:"nowrap",flexShrink:0}}>
                              {fmtTime(conv.lastUpdated)}
                            </span>
                          </div>
                          {/* Item title as subtitle */}
                          <p style={{fontSize:11,color:"#38bdf8",margin:"1px 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600,opacity:0.8}}>
                            {conv.itemTitle}
                          </p>
                          <p style={{fontSize:12,color:conv.hasUnread?"#94a3b8":"#475569",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:conv.hasUnread?600:400,fontStyle:conv.lastMessage?"normal":"italic"}}>
                            {conv.lastMessage||(conv.lastMessageType==="image"?"📷 Photo":"No messages yet")}
                          </p>
                        </div>

                        {conv.hasUnread && (
                          <span style={{width:9,height:9,borderRadius:"50%",flexShrink:0,background:"linear-gradient(135deg,#0ea5e9,#2563eb)",boxShadow:"0 0 6px rgba(14,165,233,.7)",alignSelf:"center"}} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── RIGHT: preview ── */}
              <div style={{borderRadius:22,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",backdropFilter:"blur(20px)",boxShadow:"0 8px 40px rgba(0,0,0,.35)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
                {activeConv ? (
                  <>
                    <div style={{padding:"20px 28px",borderBottom:"1px solid rgba(255,255,255,.06)",background:"rgba(255,255,255,.02)",display:"flex",alignItems:"center",gap:18}}>
                      <div style={{width:64,height:64,borderRadius:18,overflow:"hidden",border:"2px solid rgba(255,255,255,.1)",flexShrink:0,background:"#1e293b",boxShadow:"0 4px 20px rgba(0,0,0,.4)"}}>
                        {activeConv.item?.imageUrl
                          ? <img src={activeConv.item.imageUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} />
                          : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>🛒</div>
                        }
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:10,fontWeight:700,letterSpacing:".18em",color:"#0ea5e9",textTransform:"uppercase",margin:"0 0 2px"}}>Conversation with</p>
                        {/* ✅ Shows the other person's name */}
                        <p style={{fontSize:20,fontWeight:800,color:"#f1f5f9",margin:0,letterSpacing:"-.02em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {activeConv.displayName}
                        </p>
                        <p style={{fontSize:13,color:"#38bdf8",margin:"3px 0 0",fontWeight:600}}>
                          Re: {activeConv.itemTitle}
                        </p>
                        <p style={{fontSize:12,color:"#475569",margin:"2px 0 0"}}>
                          Last activity · {fmtTime(activeConv.lastUpdated)}
                        </p>
                      </div>
                      {activeConv.hasUnread && (
                        <div style={{fontSize:11,fontWeight:700,color:"#fff",background:"linear-gradient(135deg,#0ea5e9,#2563eb)",borderRadius:20,padding:"4px 12px",boxShadow:"0 2px 10px rgba(14,165,233,.4)",whiteSpace:"nowrap"}}>New messages</div>
                      )}
                    </div>

                    {/* Latest message preview */}
                    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 40px 20px",gap:12}}>
                      <div style={{width:"100%",maxWidth:420}}>
                        {activeConv.lastMessage && (
                          <p style={{fontSize:11,color:"#475569",margin:"0 0 6px",fontWeight:600,textAlign:activeConv.lastSenderId===user?.uid?"right":"left"}}>
                            {activeConv.lastSenderId === user?.uid ? "You" : activeConv.displayName}
                          </p>
                        )}
                        <div style={{display:"flex",justifyContent:activeConv.lastSenderId===user?.uid?"flex-end":"flex-start"}}>
                          <div style={{padding:"11px 16px",borderRadius:activeConv.lastSenderId===user?.uid?"16px 16px 4px 16px":"16px 16px 16px 4px",background:activeConv.lastSenderId===user?.uid?"linear-gradient(135deg,#0ea5e9,#2563eb)":"rgba(255,255,255,.08)",color:"#e2e8f0",fontSize:14,lineHeight:1.5,maxWidth:"80%",boxShadow:activeConv.lastSenderId===user?.uid?"0 4px 18px rgba(14,165,233,.35)":"0 2px 10px rgba(0,0,0,.35)"}}>
                            {activeConv.lastMessage||(activeConv.lastMessageType==="image"?"📷 Photo":"No messages yet.")}
                          </div>
                        </div>
                        <p style={{color:"#475569",fontSize:12,marginTop:8,textAlign:activeConv.lastSenderId===user?.uid?"right":"left"}}>
                          {fmtTime(activeConv.lastUpdated)}
                        </p>
                      </div>
                    </div>

                    <div style={{padding:"20px 28px",borderTop:"1px solid rgba(255,255,255,.06)",display:"flex",justifyContent:"flex-end",gap:10,alignItems:"center"}}>
                      <button
                        onClick={() => deleteConversation(activeConv.id)}
                        style={{background:"rgba(239,68,68,0.1)",color:"#f87171",border:"1px solid rgba(239,68,68,0.2)",borderRadius:14,padding:"12px 16px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}
                        onMouseEnter={(e) => { e.currentTarget.style.background="rgba(239,68,68,0.18)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background="rgba(239,68,68,0.1)"; }}
                      >
                        🗑 Delete
                      </button>
                      <button
                        className="ch-open-btn"
                        onClick={() => setShowChat(true)}
                        style={{background:"linear-gradient(135deg,#0ea5e9,#2563eb)",color:"#fff",border:"none",borderRadius:14,padding:"12px 32px",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(14,165,233,.3)",display:"flex",alignItems:"center",gap:8}}
                      >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Open Chat
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,opacity:.5}}>
                    <div style={{fontSize:48}}>💬</div>
                    <p style={{color:"#475569",fontSize:14}}>Select a conversation to preview</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="ch-fade-in-up" style={{borderRadius:22,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",padding:"60px 40px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
              <div style={{fontSize:52}}>🔒</div>
              <h2 style={{fontSize:20,fontWeight:800,color:"#f1f5f9",margin:0}}>Sign in to see your messages</h2>
              <p style={{fontSize:14,color:"#475569",maxWidth:320}}>Chat with sellers, negotiate prices, and arrange pickups — all in one place.</p>
              <button className="ch-open-btn" onClick={toggleModal} style={{background:"linear-gradient(135deg,#0ea5e9,#2563eb)",color:"#fff",border:"none",borderRadius:14,padding:"12px 32px",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(14,165,233,.3)",marginTop:8}}>Sign In</button>
            </div>
          )}
        </main>
      </div>

      <Login openModal={openModal} toggleModal={toggleModal} />
      <Sell setItems={itemsCtx.setItems} toggleModalSell={toggleModalSell} status={openModalSell} />
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
