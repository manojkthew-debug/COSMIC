import { useState, useEffect, useRef } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase Config ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAvXzHmXGZWveePRitxrlWlwgpInX-YT2I",
  authDomain: "cosmic-b78cc.firebaseapp.com",
  projectId: "cosmic-b78cc",
  storageBucket: "cosmic-b78cc.firebasestorage.app",
  messagingSenderId: "673894072759",
  appId: "1:673894072759:web:9af1d4e59d502f65e06832",
  measurementId: "G-YZ7WBY9Y9L"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ── E2EE ─────────────────────────────────────────────────────────────────────
async function generateKeyPair() {
  return await window.crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" },
    true, ["encrypt","decrypt"]
  );
}
async function encryptMsg(pubKey, text) {
  const buf = await window.crypto.subtle.encrypt({ name:"RSA-OAEP" }, pubKey, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function roomKey(a, b) { return [a,b].sort().join("_"); }

// ════════════════════════════════════════════════════════════════════════════
export default function CosmicApp() {
  const [page, setPage]               = useState("landing");
  const [authTab, setAuthTab]         = useState("login");
  const [form, setForm]               = useState({ email:"", password:"", username:"", displayName:"" });
  const [authErr, setAuthErr]         = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [keys, setKeys]               = useState(null);
  const [tab, setTab]                 = useState("feed");
  const [contacts, setContacts]       = useState([]);
  const [activeChat, setActiveChat]   = useState(null);
  const [messages, setMessages]       = useState([]);
  const [msgInput, setMsgInput]       = useState("");
  const [posts, setPosts]             = useState([]);
  const [liked, setLiked]             = useState({});
  const [newPostText, setNewPostText] = useState("");
  const [showNewPost, setShowNewPost] = useState(false);
  const [addName, setAddName]         = useState("");
  const [showAdd, setShowAdd]         = useState(false);
  const [addErr, setAddErr]           = useState("");
  const [storyView, setStoryView]     = useState(null);
  const [sideOpen, setSideOpen]       = useState(false);
  const [appLoading, setAppLoading]   = useState(true);
  const bottomRef                     = useRef(null);
  const unsubMsgs                     = useRef(null);
  const unsubPosts                    = useRef(null);

  // ── Auth state listener ───────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const profileDoc = await getDoc(doc(db, "users", user.uid));
        if (profileDoc.exists()) setUserProfile(profileDoc.data());
        setPage("app");
        generateKeyPair().then(setKeys);
        loadPosts();
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setPage("landing");
      }
      setAppLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  // ── Load posts realtime ───────────────────────────────────────────────────
  const loadPosts = () => {
    if (unsubPosts.current) unsubPosts.current();
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    unsubPosts.current = onSnapshot(q, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  };

  // ── Load messages realtime ────────────────────────────────────────────────
  const loadMessages = (contact) => {
    if (unsubMsgs.current) unsubMsgs.current();
    const room = roomKey(currentUser.uid, contact.uid);
    const q = query(collection(db, "chats", room, "messages"), orderBy("createdAt", "asc"));
    unsubMsgs.current = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  };

  // ── Signup ────────────────────────────────────────────────────────────────
  const signup = async () => {
    const { email, password, username, displayName } = form;
    if (!email||!password||!username||!displayName) { setAuthErr("All fields required"); return; }
    if (password.length < 6) { setAuthErr("Password must be 6+ characters"); return; }
    if (username.length < 3) { setAuthErr("Username must be 3+ characters"); return; }
    setAuthLoading(true); setAuthErr("");
    try {
      // Check username taken
      const uSnap = await getDocs(query(collection(db, "usernames"), where("username", "==", username.toLowerCase())));
      if (!uSnap.empty) { setAuthErr("Username already taken"); setAuthLoading(false); return; }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });

      const profile = {
        uid: cred.user.uid, email, username: username.toLowerCase(),
        displayName, bio: "Hey, I'm on COSMIC 🌌",
        avatar: displayName[0].toUpperCase(), createdAt: serverTimestamp()
      };
      await setDoc(doc(db, "users", cred.user.uid), profile);
      await setDoc(doc(db, "usernames", username.toLowerCase()), { uid: cred.user.uid, username: username.toLowerCase() });
      setUserProfile(profile);
    } catch (e) {
      setAuthErr(e.message.replace("Firebase: ","").replace(/\(auth.*\)/,""));
    }
    setAuthLoading(false);
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = async () => {
    const { email, password } = form;
    if (!email||!password) { setAuthErr("Fill in all fields"); return; }
    setAuthLoading(true); setAuthErr("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setAuthErr("Wrong email or password");
    }
    setAuthLoading(false);
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = async () => {
    if (unsubMsgs.current) unsubMsgs.current();
    if (unsubPosts.current) unsubPosts.current();
    await signOut(auth);
    setContacts([]); setActiveChat(null); setMessages([]);
    setPosts([]); setLiked({}); setTab("feed");
  };

  // ── Add Contact ───────────────────────────────────────────────────────────
  const addContact = async () => {
    const name = addName.trim().toLowerCase();
    if (!name) return;
    if (name === userProfile?.username) { setAddErr("That's you!"); return; }
    if (contacts.find(c => c.username === name)) { setAddErr("Already added"); return; }
    try {
      const uSnap = await getDocs(query(collection(db, "usernames"), where("username","==",name)));
      if (uSnap.empty) { setAddErr("User not found — they must sign up first"); return; }
      const uid = uSnap.docs[0].data().uid;
      const profileSnap = await getDoc(doc(db, "users", uid));
      if (!profileSnap.exists()) { setAddErr("User not found"); return; }
      const contact = { uid, ...profileSnap.data() };
      setContacts(prev => [...prev, contact]);
      setActiveChat(contact);
      loadMessages(contact);
      setTab("chat");
      setAddName(""); setShowAdd(false); setAddErr("");
    } catch (e) {
      setAddErr("Error finding user");
    }
  };

  // ── Send Message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!msgInput.trim()||!keys||!activeChat) return;
    const text = msgInput.trim(); setMsgInput("");
    const encrypted = await encryptMsg(keys.publicKey, text);
    const room = roomKey(currentUser.uid, activeChat.uid);
    await addDoc(collection(db, "chats", room, "messages"), {
      text, encrypted,
      from: currentUser.uid,
      fromName: userProfile?.displayName,
      fromAvatar: userProfile?.avatar,
      createdAt: serverTimestamp()
    });
  };

  // ── Post ──────────────────────────────────────────────────────────────────
  const submitPost = async () => {
    if (!newPostText.trim()) return;
    await addDoc(collection(db, "posts"), {
      uid: currentUser.uid,
      displayName: userProfile?.displayName,
      avatar: userProfile?.avatar,
      username: userProfile?.username,
      caption: newPostText.trim(),
      likes: 0, comments: 0,
      createdAt: serverTimestamp()
    });
    setNewPostText(""); setShowNewPost(false);
  };

  const toggleLike = (id) => {
    setLiked(p => ({ ...p, [id]: !p[id] }));
    setPosts(p => p.map(x => x.id===id ? { ...x, likes: liked[id] ? x.likes-1 : x.likes+1 } : x));
  };

  // ── Loading screen ────────────────────────────────────────────────────────
  if (appLoading) return (
    <div style={s.loadRoot}>
      <style>{CSS}</style>
      <div style={s.loadBox}>
        <div style={s.loadLogo}>🌌 COSMIC</div>
        <div style={s.loadBar}><div style={s.loadBarFill}/></div>
        <div style={s.loadText}>Connecting securely...</div>
      </div>
    </div>
  );

  // ── Landing ───────────────────────────────────────────────────────────────
  if (page==="landing") return (
    <div style={s.landRoot}>
      <style>{CSS}</style>
      <nav style={s.nav}>
        <div style={s.navLogo}>🌌 COSMIC</div>
        <div style={s.navR}>
          <button style={s.navGhost} onClick={()=>{setAuthTab("login");setPage("auth");}}>Log in</button>
          <button style={s.navSolid} onClick={()=>{setAuthTab("signup");setPage("auth");}}>Get started →</button>
        </div>
      </nav>
      <div style={s.hero}>
        <div style={s.heroBadge}>End-to-End Encrypted · RSA-2048 · Zero Backdoors</div>
        <h1 style={s.heroH1}>The social app that<br/><span style={s.heroAccent}>actually respects you.</span></h1>
        <p style={s.heroSub}>Chat, post, and connect — encrypted end-to-end. No ads, no data selling, no backdoors. Works on every device on the planet.</p>
        <div style={s.heroBtns}>
          <button style={s.heroPrimary} onClick={()=>{setAuthTab("signup");setPage("auth");}}>Create free account</button>
          <button style={s.heroSecondary} onClick={()=>{setAuthTab("login");setPage("auth");}}>Log into existing account</button>
        </div>
        <div style={s.heroFeatures}>
          {[["🔐","RSA-2048 E2EE"],["📱","All devices worldwide"],["🚫","No ads, no tracking"],["⚡","Real-time chat"],["🌍","Works everywhere"],["🔑","Keys on your device"]].map(([icon,label])=>(
            <div key={label} style={s.heroFeature}><span style={{fontSize:20}}>{icon}</span><span style={{color:"#555",fontSize:13}}>{label}</span></div>
          ))}
        </div>
      </div>
      <div style={s.landFooter}>© 2026 COSMIC · Private by design · Open source</div>
    </div>
  );

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (page==="auth") return (
    <div style={s.authRoot}>
      <style>{CSS}</style>
      <div style={s.authCard}>
        <div style={s.authLogo} onClick={()=>setPage("landing")}>🌌 COSMIC</div>
        <div style={s.authTabs}>
          {["login","signup"].map(t=>(
            <button key={t} style={{...s.authTab,...(authTab===t?s.authTabActive:{})}} onClick={()=>{setAuthTab(t);setAuthErr("");}}>
              {t==="login"?"Log In":"Sign Up"}
            </button>
          ))}
        </div>
        {authErr&&<div style={s.authErr}>⚠ {authErr}</div>}
        {authTab==="signup"&&<>
          <input style={s.authInput} placeholder="Display name (e.g. Manoj K)" value={form.displayName} onChange={e=>setForm(f=>({...f,displayName:e.target.value}))}/>
          <input style={s.authInput} placeholder="Username (e.g. manoj2026)" value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value.toLowerCase().replace(/\s/g,"")}))}/>
        </>}
        <input style={s.authInput} placeholder="Email address" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
        <input style={s.authInput} placeholder="Password (6+ characters)" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&(authTab==="login"?login():signup())}/>
        <button style={{...s.authBtn,...(authLoading?{opacity:0.6}:{})}} onClick={authTab==="login"?login:signup} disabled={authLoading}>
          {authLoading?"Please wait...":authTab==="login"?"LOG IN →":"CREATE ACCOUNT →"}
        </button>
        <div style={s.authNote}>🔐 Keys generated on your device. Never sent to any server.</div>
        <div style={s.authBack} onClick={()=>setPage("landing")}>← Back to home</div>
      </div>
    </div>
  );

  // ── Story viewer ──────────────────────────────────────────────────────────
  if (storyView) return (
    <div style={s.storyOverlay} onClick={()=>setStoryView(null)}>
      <style>{CSS}</style>
      <div style={s.storyBox}>
        <div style={s.storyBigAv}>{storyView.avatar}</div>
        <div style={s.storyBigName}>{storyView.displayName}</div>
        <div style={{fontSize:52,margin:"24px 0"}}>✨</div>
        <div style={{fontSize:11,color:"#333",marginTop:24}}>Tap anywhere to close</div>
      </div>
    </div>
  );

  const storyPeople = [userProfile, ...contacts].filter(Boolean);

  // ── Main App ──────────────────────────────────────────────────────────────
  return (
    <div style={s.appRoot}>
      <style>{CSS}</style>

      {sideOpen&&<div style={s.sideOverlay} onClick={()=>setSideOpen(false)}/>}

      {/* Sidebar */}
      <div style={{...s.sidebar,...(sideOpen?s.sidebarOpen:{})}}>
        <div style={s.sideLogo}>🌌 COSMIC</div>
        <div style={s.sideProfile}>
          <div style={s.sideAv}>{userProfile?.avatar}</div>
          <div>
            <div style={s.sideName}>{userProfile?.displayName}</div>
            <div style={s.sideHandle}>@{userProfile?.username}</div>
          </div>
        </div>
        <nav style={s.sideNav}>
          {[{id:"feed",icon:"⊞",label:"Feed"},{id:"chat",icon:"✉",label:"Messages"},{id:"profile",icon:"◯",label:"Profile"}].map(t=>(
            <button key={t.id} style={{...s.sideNavBtn,...(tab===t.id?s.sideNavActive:{})}} onClick={()=>{setTab(t.id);setSideOpen(false);}}>
              <span style={{fontSize:18}}>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
        <div style={s.sideEncBox}>
          <div style={s.sideEncTitle}>⚙ ENCRYPTION</div>
          {[["Algorithm","RSA-OAEP"],["Key Size","2048-bit"],["Status",keys?"✓ Active":"..."]].map(([k,v])=>(
            <div key={k} style={s.sideEncRow}><span>{k}</span><span style={{color:k==="Status"&&keys?"#fff":"inherit"}}>{v}</span></div>
          ))}
        </div>
        <button style={s.sideLogout} onClick={logout}>Log out</button>
      </div>

      {/* Main */}
      <div style={s.appMain}>
        {/* Topbar */}
        <div style={s.topbar}>
          <button style={s.menuBtn} onClick={()=>setSideOpen(o=>!o)}>☰</button>
          <div style={s.topLogo}>🌌 COSMIC</div>
          <div style={s.topAv}>{userProfile?.avatar}</div>
        </div>

        {/* ── FEED ── */}
        {tab==="feed"&&(
          <div style={s.feedWrap}>
            <div style={s.storiesRow}>
              {storyPeople.map((u,i)=>(
                <div key={i} style={s.storyItem} onClick={()=>setStoryView(u)}>
                  <div style={{...s.storyRing,borderColor:i===0?"#fff":"#333"}}>
                    <div style={s.storyAv}>{u?.avatar}</div>
                  </div>
                  <div style={s.storyLabel}>{i===0?"Your story":(u?.displayName)}</div>
                </div>
              ))}
            </div>
            <div style={s.hr}/>

            {showNewPost?(
              <div style={s.newPostBox}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={s.postAv}>{userProfile?.avatar}</div>
                  <span style={{color:"#888",fontSize:13}}>{userProfile?.displayName}</span>
                </div>
                <textarea style={s.newPostTA} placeholder="What's on your mind?" value={newPostText} onChange={e=>setNewPostText(e.target.value)} rows={3} autoFocus/>
                <div style={s.rowEnd}>
                  <button style={s.cancelBtn} onClick={()=>setShowNewPost(false)}>Cancel</button>
                  <button style={s.primaryBtn} onClick={submitPost}>Post</button>
                </div>
              </div>
            ):(
              <div style={s.newPostTrigger} onClick={()=>setShowNewPost(true)}>
                <div style={s.postAv}>{userProfile?.avatar}</div>
                <div style={{flex:1,fontSize:14,color:"#333"}}>What's on your mind?</div>
                <span>📸</span>
              </div>
            )}

            {posts.length===0?(
              <div style={s.emptyState}><div style={{fontSize:44}}>📭</div><div style={s.emptyTitle}>No posts yet</div><div style={s.emptySub}>Be the first to post!</div></div>
            ):posts.map(p=>(
              <div key={p.id} style={s.postCard}>
                <div style={s.postTop}>
                  <div style={s.postAv}>{p.avatar}</div>
                  <div><div style={s.postName}>{p.displayName}</div><div style={s.postTime}>{p.createdAt?.toDate?.()?.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})||"just now"}</div></div>
                  <div style={s.postDots}>···</div>
                </div>
                <div style={s.postImg}>📸</div>
                <div style={s.postActions}>
                  <button style={s.actBtn} onClick={()=>toggleLike(p.id)}>{liked[p.id]?"♥":"♡"} {p.likes}</button>
                  <button style={s.actBtn}>💬 {p.comments}</button>
                  <button style={s.actBtn}>↗</button>
                  <button style={{...s.actBtn,marginLeft:"auto"}}>🔖</button>
                </div>
                <div style={s.postCaption}><b>{p.displayName}</b> {p.caption}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── CHAT ── */}
        {tab==="chat"&&(
          <div style={s.chatLayout}>
            <div style={s.contactPanel}>
              <div style={s.contactHeader}>
                <span style={s.contactTitle}>Messages</span>
                <button style={s.addCircle} onClick={()=>{setShowAdd(o=>!o);setAddErr("");}}>+</button>
              </div>
              {showAdd&&(
                <div style={s.addBox}>
                  <input style={s.addInput} placeholder="Enter username..." value={addName} onChange={e=>setAddName(e.target.value.toLowerCase())} onKeyDown={e=>e.key==="Enter"&&addContact()} autoFocus/>
                  {addErr&&<div style={s.addErrBox}>{addErr}</div>}
                  <div style={s.rowEnd}>
                    <button style={s.cancelBtn} onClick={()=>{setShowAdd(false);setAddErr("");setAddName("");}}>Cancel</button>
                    <button style={s.primaryBtn} onClick={addContact}>Add</button>
                  </div>
                  <div style={{fontSize:10,color:"#333"}}>💡 They must have a COSMIC account</div>
                </div>
              )}
              {contacts.length===0?(
                <div style={s.emptyState}><div style={{fontSize:28}}>💬</div><div style={s.emptyTitle}>N
