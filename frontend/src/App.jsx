import { useState, useEffect, useRef } from "react";
import {
  Mail, Lock, User, Eye, EyeOff, Upload, Zap,
  CheckCircle, XCircle, Clock, ChevronDown, LogOut,
  X, Copy, Check, AlertCircle, Sparkles, RotateCcw,
  Camera, Building2, Tag, ChevronRight, Loader2, History, Send,
} from "lucide-react";

/* ---------------------------------------------------------------
   API config
--------------------------------------------------------------- */
const API = import.meta.env.VITE_API_URL || "http://localhost:5001";

/* ---------------------------------------------------------------
   Token helpers
--------------------------------------------------------------- */
const getToken  = ()       => localStorage.getItem("pf_access");
const getRToken = ()       => localStorage.getItem("pf_refresh");
const save      = (a, r)   => { localStorage.setItem("pf_access", a); if (r) localStorage.setItem("pf_refresh", r); };
const clear     = ()       => { localStorage.removeItem("pf_access"); localStorage.removeItem("pf_refresh"); };

async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (!(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const t = getToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  let res = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.status === 401) {
    const rt = getRToken();
    if (rt) {
      const rr = await fetch(`${API}/api/auth/refresh`, {
        method: "POST", headers: { Authorization: `Bearer ${rt}`, "Content-Type": "application/json" },
      });
      if (rr.ok) {
        const { access_token } = await rr.json();
        save(access_token, null);
        headers["Authorization"] = `Bearer ${access_token}`;
        res = await fetch(`${API}${path}`, { ...opts, headers });
      } else clear();
    }
  }
  return res;
}

/* ---------------------------------------------------------------
   Root
--------------------------------------------------------------- */
export default function App() {
  const [screen,  setScreen]  = useState("auth");
  const [account, setAccount] = useState(null);

  useEffect(() => {
    if (!getToken()) return;
    apiFetch("/api/me").then(async r => {
      if (r.ok) { const d = await r.json(); setAccount(d.user); setScreen("tool"); }
      else clear();
    }).catch(clear);
  }, []);

  return (
    <div className="root">
      <Styles />
      {screen === "auth" && (
        <AuthScreen onSuccess={(user, a, r) => { save(a, r); setAccount(user); setScreen("tool"); }} />
      )}
      {screen === "tool" && account && (
        <ToolScreen
          account={account}
          setAccount={setAccount}
          onLogout={() => { clear(); setAccount(null); setScreen("auth"); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   Auth
--------------------------------------------------------------- */
function AuthScreen({ onSuccess }) {
  const [mode,    setMode]   = useState("signup");
  const [email,   setEmail]  = useState("");
  const [uname,   setUname]  = useState("");
  const [pass,    setPass]   = useState("");
  const [showPw,  setShowPw] = useState(false);
  const [errs,    setErrs]   = useState({});
  const [apiErr,  setApiErr] = useState("");
  const [loading, setLoad]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    setApiErr("");
    const v = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) v.email = "Enter a valid email.";
    if (mode === "signup" && !/^[a-zA-Z0-9_]{3,20}$/.test(uname)) v.username = "3–20 chars, letters/numbers/underscore.";
    if (pass.length < 6) v.password = "At least 6 characters.";
    setErrs(v);
    if (Object.keys(v).length) return;
    setLoad(true);
    try {
      const res  = await fetch(`${API}/api/auth/${mode === "signup" ? "register" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { email, username: uname, password: pass } : { email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) { data.errors ? setErrs(data.errors) : setApiErr(data.error || "Something went wrong."); return; }
      onSuccess(data.user, data.access_token, data.refresh_token);
    } catch { setApiErr("Cannot reach the server. Is the backend running?"); }
    finally   { setLoad(false); }
  }

  return (
    <div className="auth-wrap">
      {/* Left panel */}
      <div className="auth-left">
        <div className="auth-logo"><Camera size={18} /> PitchForge</div>
        <h1 className="auth-title">Turn any Instagram into a <span className="violet">signed client.</span></h1>
        <p className="auth-sub">Drop in their profile screenshot and two posts. PitchForge reads their account, writes a personalised pitch, and gets smarter with every win and loss.</p>
        <div className="auth-bullets">
          <div className="bullet"><CheckCircle size={13} color="#10B981" /> Spots real strengths and one thing to fix</div>
          <div className="bullet"><CheckCircle size={13} color="#10B981" /> Offers a free post to open the door</div>
          <div className="bullet"><CheckCircle size={13} color="#10B981" /> Learns from your results automatically</div>
        </div>
        {/* Decorative orbiting rings */}
        <div className="orbit-stage">
          <div className="ring ring-1" /><div className="ring ring-2" /><div className="ring ring-3" />
          <div className="orbit-core"><Camera size={20} /></div>
          <div className="orbit-dot od-1"><Zap size={9}/></div>
          <div className="orbit-dot od-2"><Send size={9}/></div>
          <div className="orbit-dot od-3"><Sparkles size={9}/></div>
        </div>
      </div>

      {/* Right card */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="tabs">
            <button className={"tab"+(mode==="signup"?" tab-on":"")} onClick={()=>setMode("signup")} type="button">Sign up</button>
            <button className={"tab"+(mode==="login" ?" tab-on":"")} onClick={()=>setMode("login")}  type="button">Log in</button>
          </div>
          {apiErr && <div className="banner err-banner"><AlertCircle size={13}/> {apiErr}</div>}
          <form onSubmit={submit} className="form" noValidate>
            <Field label="Email"    icon={<Mail size={14}/>} type="email"    value={email} onChange={setEmail} error={errs.email}    placeholder="you@agency.com"/>
            {mode === "signup" && <Field label="Username" icon={<User size={14}/>}              value={uname}  onChange={setUname} error={errs.username} placeholder="your handle"/>}
            <Field label="Password" icon={<Lock size={14}/>} type={showPw?"text":"password"} value={pass}   onChange={setPass}   error={errs.password} placeholder="••••••••"
              suffix={<button type="button" className="eye-btn" onClick={()=>setShowPw(v=>!v)}>{showPw?<EyeOff size={13}/>:<Eye size={13}/>}</button>}
            />
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? <Loader2 size={14} className="spin"/> : <Zap size={14}/>}
              {loading ? "Please wait…" : mode==="signup" ? "Create account" : "Log in"}
            </button>
            <p className="fine">{mode==="signup" ? "Free forever. No credit card." : "Welcome back."}</p>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, error, suffix, ...rest }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className={"field-wrap"+(error?" field-err":"")}>
        <span className="field-icon">{icon}</span>
        <input className="input" {...rest} onChange={e=>rest.onChange(e.target.value)} value={rest.value}/>
        {suffix}
      </div>
      {error && <span className="err-msg"><AlertCircle size={11}/> {error}</span>}
    </label>
  );
}

/* ---------------------------------------------------------------
   Tool screen
--------------------------------------------------------------- */
function ToolScreen({ account, setAccount, onLogout }) {
  const [tab,        setTab]        = useState("generate");
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [messages,   setMessages]   = useState([]);
  const [generating, setGenerating] = useState(false);
  const [current,    setCurrent]    = useState(null);
  const [apiErr,     setApiErr]     = useState("");
  const [copied,     setCopied]     = useState(false);
  const [displayTxt, setDisplayTxt] = useState("");
  const [typing,     setTyping]     = useState(false);

  // Form
  const [bizName,     setBizName]     = useState("");
  const [bizField,    setBizField]    = useState("");
  const [customGoal,  setCustomGoal]  = useState("");
  const [imgP,        setImgP]        = useState(null);
  const [img1,        setImg1]        = useState(null);
  const [img2,        setImg2]        = useState(null);
  const refP = useRef(); const ref1 = useRef(); const ref2 = useRef();

  const stats = account.stats || {};

  useEffect(() => { loadMessages(); }, []);

  async function loadMessages() {
    const r = await apiFetch("/api/messages");
    if (r.ok) { const d = await r.json(); setMessages(d.messages); }
  }

  // Typewriter
  useEffect(() => {
    if (!current) return;
    setDisplayTxt("");
    setTyping(true);
    const text = current.generated_text;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayTxt(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); setTyping(false); }
    }, 16);
    return () => clearInterval(iv);
  }, [current]);

  async function generate(e) {
    e.preventDefault();
    setApiErr("");
    if (!imgP)            { setApiErr("Upload at least the profile screenshot."); return; }
    if (!bizName.trim())  { setApiErr("Enter the business name."); return; }
    if (!bizField.trim()) { setApiErr("Enter the business field."); return; }

    const form = new FormData();
    form.append("business_name",  bizName.trim());
    form.append("business_field", bizField.trim());
    if (customGoal.trim()) form.append("custom_goal", customGoal.trim());
    form.append("image_profile",  imgP);
    if (img1) form.append("image_post1", img1);
    if (img2) form.append("image_post2", img2);

    setGenerating(true);
    try {
      const res  = await apiFetch("/api/generate", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setApiErr(data.error || "Generation failed."); return; }
      setCurrent(data.message);
      setAccount(data.user);
      setMessages(prev => [data.message, ...prev]);
    } catch { setApiErr("Cannot reach the server."); }
    finally   { setGenerating(false); }
  }

  async function markOutcome(msgId, outcome, note = "") {
    const res  = await apiFetch(`/api/messages/${msgId}/outcome`, {
      method: "POST", body: JSON.stringify({ outcome, note }),
    });
    if (res.ok) {
      const d = await res.json();
      setMessages(prev => prev.map(m => m.id === msgId ? d.message : m));
      setAccount(d.user);
      if (current?.id === msgId) setCurrent(d.message);
    }
  }

  function copyMsg() {
    if (!current) return;
    navigator.clipboard.writeText(current.generated_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetForm() {
    setCurrent(null); setDisplayTxt(""); setImgP(null);
    setImg1(null); setImg2(null); setBizName(""); setBizField(""); setCustomGoal(""); setApiErr("");
  }

  return (
    <div className="tool">
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-logo"><Camera size={15}/> PitchForge</div>
        <div className="topbar-right">
          <div className="stat-pill stat-s"><CheckCircle size={11}/> {stats.successes||0} won</div>
          <div className="stat-pill stat-f"><XCircle     size={11}/> {stats.failures||0}  lost</div>
          <div className="stat-pill stat-p"><Clock       size={11}/> {stats.pending||0}   pending</div>
          <div className="acct-wrap">
            <button className="avatar-btn" onClick={()=>setMenuOpen(v=>!v)} type="button">
              {account.username[0].toUpperCase()} <ChevronDown size={12}/>
            </button>
            {menuOpen && (
              <div className="dropdown">
                <div className="dd-head">
                  <div className="dd-name">{account.username}</div>
                  <div className="dd-email">{account.email}</div>
                </div>
                <button className="dd-item" onClick={onLogout} type="button"><LogOut size={13}/> Log out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="main-tabs">
        <button className={"main-tab"+(tab==="generate"?" main-tab-on":"")} onClick={()=>setTab("generate")} type="button">
          <Zap size={13}/> Generate
        </button>
        <button className={"main-tab"+(tab==="history"?" main-tab-on":"")} onClick={()=>setTab("history")} type="button">
          <History size={13}/> History <span className="badge">{messages.length}</span>
        </button>
      </div>

      {/* Generate tab */}
      {tab === "generate" && (
        <div className="main-grid">
          {/* Input column */}
          <div className="col-input">
            <div className="section-label">01 · SCREENSHOTS</div>
            <div className="img-grid">
              <DropZone label="Profile page" sub="Required" file={imgP} onFile={setImgP} ref_={refP} accent/>
              <DropZone label="Post 1"       sub="Optional" file={img1} onFile={setImg1} ref_={ref1}/>
              <DropZone label="Post 2"       sub="Optional" file={img2} onFile={setImg2} ref_={ref2}/>
            </div>

            <div className="section-label" style={{marginTop:22}}>02 · BUSINESS INFO</div>
            <label className="field">
              <span className="field-label">Business name</span>
              <div className="field-wrap">
                <span className="field-icon"><Building2 size={14}/></span>
                <input className="input" value={bizName} onChange={e=>setBizName(e.target.value)} placeholder="e.g. Bloom Bakery"/>
              </div>
            </label>
            <label className="field">
              <span className="field-label">Industry / field</span>
              <div className="field-wrap">
                <span className="field-icon"><Tag size={14}/></span>
                <input className="input" value={bizField} onChange={e=>setBizField(e.target.value)} placeholder="e.g. Artisan bakery, fitness coaching…"/>
              </div>
            </label>

            <div className="section-label" style={{marginTop:22}}>03 · YOUR GOAL <span className="goal-optional">optional</span></div>
            <label className="field">
              <span className="field-label">What do you want from them?</span>
              <div className="field-wrap field-wrap-tall">
                <textarea
                  className="input input-textarea"
                  value={customGoal}
                  onChange={e=>setCustomGoal(e.target.value)}
                  placeholder={`Leave blank to pitch a free social media post.\n\nOr describe your actual goal, e.g:\n"Pitch our video editing service"\n"Invite them to be a podcast guest"\n"Offer them an affiliate deal"`}
                  rows={4}
                />
              </div>
            </label>

            {apiErr && <div className="banner err-banner"><AlertCircle size={13}/> {apiErr}</div>}

            <button className="btn btn-primary btn-full" onClick={generate} disabled={generating} type="button">
              {generating ? <Loader2 size={14} className="spin"/> : <Sparkles size={14}/>}
              {generating ? "Analysing & writing…" : "Generate pitch message"}
            </button>

            {generating && (
              <div className="steps">
                <Step label="Reading screenshots"        done/>
                <Step label="Spotting brand strengths"   done/>
                <Step label="Finding one quick win"      done/>
                <Step label="Writing the message"        active/>
              </div>
            )}
          </div>

          {/* Output column */}
          <div className="col-output">
            <div className="section-label">04 · YOUR PITCH</div>

            {!current && !generating && (
              <div className="empty-state">
                <div className="empty-icon"><Camera size={26}/></div>
                <p>Upload the screenshots, fill in the business details, and hit Generate — your pitch appears here.</p>
              </div>
            )}

            {(current || generating) && (
              <div className="output-card">
                {current && (
                  <div className="output-meta">
                    <span className="output-biz">{current.business_name}</span>
                    <span className="output-field">{current.business_field}</span>
                    {current.custom_goal && <span className="output-goal">🎯 {current.custom_goal}</span>}
                    <span className="output-date">{new Date(current.created_at).toLocaleDateString()}</span>
                  </div>
                )}

                <div className="msg-box">
                  {generating && !displayTxt && (
                    <div className="dots"><span/><span/><span/></div>
                  )}
                  {displayTxt && (
                    <pre className="msg-text">
                      {displayTxt}{typing && <span className="cursor">|</span>}
                    </pre>
                  )}
                </div>

                {current && !typing && (
                  <>
                    <div className="output-actions">
                      <button className="btn btn-ghost btn-sm" onClick={copyMsg} type="button">
                        {copied ? <><Check size={12}/> Copied!</> : <><Copy size={12}/> Copy</>}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={resetForm} type="button">
                        <RotateCcw size={12}/> New pitch
                      </button>
                    </div>

                    <div className="outcome-box">
                      <div className="outcome-label">Did this get a reply?</div>
                      {!current.outcome ? (
                        <div className="outcome-btns">
                          <button className="ob ob-s" onClick={()=>markOutcome(current.id,"success")} type="button">
                            <CheckCircle size={13}/> It worked! 🎉
                          </button>
                          <button className="ob ob-f" onClick={()=>markOutcome(current.id,"failure")} type="button">
                            <XCircle size={13}/> No reply
                          </button>
                        </div>
                      ) : (
                        <OutcomeTag outcome={current.outcome}/>
                      )}
                      <p className="outcome-hint">PitchForge uses your results to write better messages next time.</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="history-wrap">
          {messages.length === 0 ? (
            <div className="empty-state" style={{margin:"60px auto"}}>
              <div className="empty-icon"><History size={26}/></div>
              <p>No messages yet. Generate your first pitch and it'll appear here.</p>
            </div>
          ) : (
            <>
              <div className="history-legend">
                <span style={{color:"#10B981"}}><CheckCircle size={11}/> Won</span>
                <span style={{color:"#F43F5E"}}><XCircle     size={11}/> Lost</span>
                <span style={{color:"#94A3B8"}}><Clock       size={11}/> Pending</span>
              </div>
              <div className="history-list">
                {messages.map(m => <HistoryCard key={m.id} msg={m} onOutcome={markOutcome}/>)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   Drop zone
--------------------------------------------------------------- */
function DropZone({ label, sub, file, onFile, ref_, accent }) {
  const [drag, setDrag] = useState(false);
  function handle(f) { if (f && f.type.startsWith("image/")) onFile(f); }
  return (
    <div
      className={"dz"+(drag?" dz-drag":"")+(accent?" dz-accent":"")+(file?" dz-filled":"")}
      onDragOver={e=>{e.preventDefault();setDrag(true);}}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0]);}}
      onClick={()=>ref_.current?.click()}
    >
      <input ref={ref_} type="file" accept="image/*" hidden onChange={e=>handle(e.target.files[0])}/>
      {file ? (
        <>
          <img src={URL.createObjectURL(file)} alt={label} className="dz-img"/>
          <button className="dz-remove" onClick={e=>{e.stopPropagation();onFile(null);}} type="button"><X size={11}/></button>
        </>
      ) : (
        <div className="dz-inner">
          <Upload size={15} color={accent?"#7C3AED":"#475569"}/>
          <div className="dz-label">{label}</div>
          <div className="dz-sub">{sub}</div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   History card
--------------------------------------------------------------- */
function HistoryCard({ msg, onOutcome }) {
  const [open,  setOpen]  = useState(false);
  const [note,  setNote]  = useState("");
  const [busy,  setBusy]  = useState(false);

  async function mark(outcome) {
    setBusy(true);
    await onOutcome(msg.id, outcome, note);
    setBusy(false);
  }

  const color = msg.outcome === "success" ? "#10B981" : msg.outcome === "failure" ? "#F43F5E" : "#64748B";
  const Icon  = msg.outcome === "success" ? CheckCircle : msg.outcome === "failure" ? XCircle : Clock;

  return (
    <div className={"hcard hcard-"+(msg.outcome||"pending")}>
      <div className="hcard-head" onClick={()=>setOpen(v=>!v)}>
        <div className="hcard-left">
          <Icon size={14} color={color}/>
          <div>
            <div className="hcard-biz">{msg.business_name}</div>
            <div className="hcard-meta">
              {msg.business_field}
              {msg.custom_goal && <span className="hcard-goal"> · 🎯 {msg.custom_goal}</span>}
              {" · "}{new Date(msg.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
        <ChevronRight size={13} className={"chevron"+(open?" rotated":"")} color="#64748B"/>
      </div>

      {open && (
        <div className="hcard-body">
          <pre className="hcard-text">{msg.generated_text}</pre>
          {!msg.outcome ? (
            <div className="hcard-outcome">
              <div className="outcome-label">Did this get a reply?</div>
              <textarea className="note-input" rows={2} placeholder="Optional note (e.g. 'Asked for pricing')" value={note} onChange={e=>setNote(e.target.value)}/>
              <div className="outcome-btns">
                <button className="ob ob-s" onClick={()=>mark("success")} disabled={busy} type="button"><CheckCircle size={12}/> It worked!</button>
                <button className="ob ob-f" onClick={()=>mark("failure")} disabled={busy} type="button"><XCircle     size={12}/> No reply</button>
              </div>
            </div>
          ) : (
            <div style={{marginTop:10}}>
              <OutcomeTag outcome={msg.outcome}/>
              {msg.outcome_note && <div className="hcard-note">"{msg.outcome_note}"</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   Small shared components
--------------------------------------------------------------- */
function OutcomeTag({ outcome }) {
  const s = outcome === "success";
  return (
    <div className={"outcome-tag "+(s?"tag-s":"tag-f")}>
      {s ? <CheckCircle size={13}/> : <XCircle size={13}/>}
      {s ? "Marked as won — PitchForge will reinforce this style." : "Marked as lost — PitchForge will adjust future messages."}
    </div>
  );
}

function Step({ label, done, active }) {
  return (
    <div className={"step"+(done?" step-done":active?" step-active":"")}>
      {done ? <Check size={11}/> : active ? <Loader2 size={11} className="spin"/> : <span className="step-dot"/>}
      {label}
    </div>
  );
}

/* ---------------------------------------------------------------
   All styles
--------------------------------------------------------------- */
function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      body{background:#0D1117;color:#E2E8F0;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;}

      .root{
        --navy:#0D1117; --panel:#161B22; --card:#1C2230; --line:#30374A;
        --fog:#64748B; --slate:#94A3B8; --bone:#E2E8F0; --white:#F0F4FF;
        --violet:#7C3AED; --vdim:#5B21B6; --vglow:rgba(124,58,237,.15);
        --green:#10B981; --red:#F43F5E; --amber:#F59E0B;
        min-height:100vh;
      }
      .root *:focus-visible{outline:2px solid var(--violet);outline-offset:2px;}
      .violet{color:var(--violet);}

      /* ---- Auth ---- */
      .auth-wrap{display:grid;grid-template-columns:1.1fr .9fr;min-height:100vh;}
      .auth-left{background:linear-gradient(135deg,#0D1117,#120D2E);border-right:1px solid var(--line);padding:52px 52px;display:flex;flex-direction:column;gap:28px;position:relative;overflow:hidden;}
      .auth-logo{display:flex;align-items:center;gap:8px;font-family:'Syne',sans-serif;font-size:17px;font-weight:700;color:var(--violet);}
      .auth-title{font-family:'Syne',sans-serif;font-size:34px;line-height:1.25;font-weight:800;color:var(--white);max-width:440px;}
      .auth-sub{color:var(--slate);font-size:14.5px;line-height:1.7;max-width:420px;}
      .auth-bullets{display:flex;flex-direction:column;gap:10px;}
      .bullet{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--bone);}

      /* Orbit */
      .orbit-stage{position:absolute;bottom:-70px;right:-70px;width:300px;height:300px;}
      .ring{position:absolute;border-radius:50%;border:1px solid;}
      .ring-1{width:150px;height:150px;top:75px;left:75px;border-color:rgba(124,58,237,.22);animation:spin 12s linear infinite;}
      .ring-2{width:230px;height:230px;top:35px;left:35px;border-color:rgba(124,58,237,.12);animation:spin 20s linear infinite reverse;}
      .ring-3{width:300px;height:300px;top:0;left:0;border-color:rgba(124,58,237,.07);animation:spin 30s linear infinite;}
      .orbit-core{position:absolute;width:44px;height:44px;top:128px;left:128px;background:var(--violet);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 0 36px rgba(124,58,237,.45);}
      .orbit-dot{position:absolute;width:24px;height:24px;background:var(--card);border:1px solid var(--line);border-radius:7px;display:flex;align-items:center;justify-content:center;color:var(--violet);}
      .od-1{top:56px;left:138px;} .od-2{top:138px;left:226px;} .od-3{top:218px;left:110px;}
      @keyframes spin{to{transform:rotate(360deg);}}

      .auth-right{display:flex;align-items:center;justify-content:center;padding:40px;background:var(--navy);}
      .auth-card{width:100%;max-width:370px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px;}

      /* Tabs */
      .tabs{display:flex;gap:3px;background:var(--navy);border-radius:10px;padding:4px;margin-bottom:22px;}
      .tab{flex:1;background:none;border:none;color:var(--fog);font-family:'Inter';font-size:14px;font-weight:600;padding:9px;border-radius:7px;cursor:pointer;}
      .tab-on{background:var(--card);color:var(--white);}

      /* Form */
      .form{display:flex;flex-direction:column;gap:14px;}
      .field{display:flex;flex-direction:column;gap:5px;}
      .field-label{font-size:11px;color:var(--slate);text-transform:uppercase;letter-spacing:.06em;font-weight:500;}
      .field-wrap{display:flex;align-items:center;background:var(--navy);border:1px solid var(--line);border-radius:9px;padding:0 11px;transition:border-color .15s;}
      .field-wrap:focus-within{border-color:var(--violet);}
      .field-err{border-color:var(--red)!important;}
      .field-icon{color:var(--fog);display:flex;flex-shrink:0;}
      .input{flex:1;background:none;border:none;color:var(--white);font-family:'Inter';font-size:14px;padding:10px 9px;outline:none;}
      .input::placeholder{color:var(--fog);}
      .eye-btn{background:none;border:none;color:var(--fog);cursor:pointer;display:flex;padding:3px;}
      .err-msg{display:flex;align-items:center;gap:5px;color:var(--red);font-size:12px;}
      .fine{color:var(--fog);font-size:12px;text-align:center;}

      /* Buttons */
      .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-family:'Inter';font-weight:600;font-size:14px;padding:11px 18px;border-radius:9px;border:1px solid transparent;cursor:pointer;transition:all .15s;text-decoration:none;}
      .btn:disabled{opacity:.45;cursor:not-allowed;}
      .btn-full{width:100%;}
      .btn-primary{background:var(--violet);color:#fff;}
      .btn-primary:hover:not(:disabled){background:#6D28D9;}
      .btn-ghost{background:transparent;border-color:var(--line);color:var(--bone);}
      .btn-ghost:hover:not(:disabled){border-color:var(--violet);color:var(--violet);}
      .btn-sm{font-size:13px;padding:8px 13px;}
      .spin{animation:spin .9s linear infinite;}

      /* Banner */
      .banner{display:flex;align-items:center;gap:8px;padding:10px 13px;border-radius:8px;font-size:13px;}
      .err-banner{background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);color:var(--red);}

      /* ---- Tool ---- */
      .tool{min-height:100vh;display:flex;flex-direction:column;}
      .topbar{display:flex;align-items:center;justify-content:space-between;padding:13px 26px;border-bottom:1px solid var(--line);background:var(--panel);}
      .topbar-logo{display:flex;align-items:center;gap:7px;font-family:'Syne';font-size:15px;font-weight:700;color:var(--violet);}
      .topbar-right{display:flex;align-items:center;gap:8px;}
      .stat-pill{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:5px 10px;border-radius:999px;border:1px solid var(--line);}
      .stat-s{color:var(--green);border-color:rgba(16,185,129,.25);background:rgba(16,185,129,.08);}
      .stat-f{color:var(--red);border-color:rgba(244,63,94,.25);background:rgba(244,63,94,.08);}
      .stat-p{color:var(--slate);}
      .acct-wrap{position:relative;}
      .avatar-btn{display:flex;align-items:center;gap:4px;background:var(--card);border:1px solid var(--line);color:var(--bone);height:33px;padding:0 10px;border-radius:999px;cursor:pointer;font-weight:700;font-size:13px;}
      .dropdown{position:absolute;right:0;top:41px;width:200px;background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:7px;z-index:50;}
      .dd-head{padding:8px 10px 9px;border-bottom:1px solid var(--line);margin-bottom:5px;}
      .dd-name{font-weight:600;font-size:14px;} .dd-email{color:var(--fog);font-size:11px;margin-top:2px;}
      .dd-item{display:flex;align-items:center;gap:7px;width:100%;background:none;border:none;color:var(--bone);font-size:13px;padding:8px 10px;border-radius:6px;cursor:pointer;text-align:left;}
      .dd-item:hover{background:var(--card);}

      /* Main tabs */
      .main-tabs{display:flex;padding:9px 26px 0;border-bottom:1px solid var(--line);background:var(--panel);}
      .main-tab{display:flex;align-items:center;gap:6px;background:none;border:none;border-bottom:2px solid transparent;color:var(--fog);font-family:'Inter';font-size:14px;font-weight:600;padding:9px 14px;cursor:pointer;margin-bottom:-1px;}
      .main-tab-on{color:var(--violet);border-bottom-color:var(--violet);}
      .badge{background:var(--card);color:var(--slate);font-size:11px;padding:2px 7px;border-radius:999px;font-weight:600;}

      /* Grid */
      .main-grid{display:grid;grid-template-columns:1fr 1fr;flex:1;}
      .col-input{padding:26px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:13px;}
      .col-output{padding:26px;display:flex;flex-direction:column;gap:13px;}
      .section-label{font-size:10.5px;font-weight:700;color:var(--violet);text-transform:uppercase;letter-spacing:.1em;}

      /* Drop zones */
      .img-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;}
      .dz{position:relative;border:1.5px dashed var(--line);border-radius:11px;height:108px;cursor:pointer;overflow:hidden;transition:border-color .15s,background .15s;display:flex;align-items:center;justify-content:center;background:var(--card);}
      .dz:hover{border-color:var(--slate);}
      .dz-drag{border-color:var(--violet);background:var(--vglow);}
      .dz-accent{border-color:rgba(124,58,237,.4);}
      .dz-filled{border-style:solid;border-color:var(--violet);}
      .dz-inner{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;padding:10px;}
      .dz-label{font-size:11.5px;font-weight:600;color:var(--bone);}
      .dz-sub{font-size:10px;color:var(--fog);}
      .dz-img{width:100%;height:100%;object-fit:cover;display:block;}
      .dz-remove{position:absolute;top:4px;right:4px;background:rgba(0,0,0,.7);border:none;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;}

      /* Steps */
      .steps{display:flex;flex-direction:column;gap:7px;}
      .step{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--fog);}
      .step-done{color:var(--green);} .step-active{color:var(--violet);}
      .step-dot{width:6px;height:6px;border-radius:50%;background:var(--line);display:inline-block;}

      /* Output */
      .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;min-height:300px;color:var(--fog);text-align:center;max-width:280px;margin:0 auto;line-height:1.6;font-size:14px;}
      .empty-icon{width:52px;height:52px;background:var(--card);border:1px solid var(--line);border-radius:14px;display:flex;align-items:center;justify-content:center;color:var(--violet);}
      .output-card{background:var(--card);border:1px solid var(--line);border-radius:13px;overflow:hidden;display:flex;flex-direction:column;}
      .output-meta{display:flex;align-items:center;gap:8px;padding:11px 15px;border-bottom:1px solid var(--line);flex-wrap:wrap;}
      .output-biz{font-weight:700;font-size:13.5px;color:var(--white);}
      .output-field{background:var(--vglow);color:var(--violet);font-size:11px;padding:3px 9px;border-radius:999px;font-weight:600;}
      .output-date{color:var(--fog);font-size:11px;margin-left:auto;}
      .msg-box{padding:16px;min-height:170px;display:flex;align-items:flex-start;}
      .msg-text{font-family:'JetBrains Mono',monospace;font-size:12.5px;line-height:1.75;color:var(--bone);white-space:pre-wrap;word-break:break-word;}
      .cursor{display:inline-block;width:2px;height:1em;background:var(--violet);margin-left:1px;animation:blink .7s step-end infinite;vertical-align:text-bottom;}
      @keyframes blink{50%{opacity:0;}}
      .dots{display:flex;gap:6px;align-items:center;padding:8px 0;}
      .dots span{width:7px;height:7px;border-radius:50%;background:var(--violet);animation:dot .9s ease-in-out infinite;}
      .dots span:nth-child(2){animation-delay:.2s;} .dots span:nth-child(3){animation-delay:.4s;}
      @keyframes dot{0%,80%,100%{transform:scale(.6);opacity:.3;}40%{transform:scale(1);opacity:1;}}
      .output-actions{display:flex;gap:7px;padding:0 15px 13px;border-bottom:1px solid var(--line);}

      /* Outcome */
      .outcome-box{padding:14px 15px;}
      .outcome-label{font-size:11.5px;font-weight:600;color:var(--slate);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;}
      .outcome-btns{display:flex;gap:8px;}
      .ob{display:flex;align-items:center;gap:6px;font-family:'Inter';font-size:13px;font-weight:600;padding:9px 15px;border-radius:8px;border:1.5px solid;cursor:pointer;transition:all .15s;}
      .ob:disabled{opacity:.5;cursor:not-allowed;}
      .ob-s{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.4);color:var(--green);}
      .ob-s:hover:not(:disabled){background:rgba(16,185,129,.2);}
      .ob-f{background:rgba(244,63,94,.1);border-color:rgba(244,63,94,.4);color:var(--red);}
      .ob-f:hover:not(:disabled){background:rgba(244,63,94,.2);}
      .outcome-tag{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;padding:10px 13px;border-radius:8px;}
      .tag-s{background:rgba(16,185,129,.1);color:var(--green);}
      .tag-f{background:rgba(244,63,94,.1);color:var(--red);}
      .outcome-hint{color:var(--fog);font-size:11.5px;margin-top:10px;line-height:1.5;}

      /* History */
      .history-wrap{padding:26px;max-width:860px;margin:0 auto;width:100%;}
      .history-legend{display:flex;gap:16px;margin-bottom:18px;font-size:12px;font-weight:600;}
      .history-legend span{display:flex;align-items:center;gap:5px;}
      .history-list{display:flex;flex-direction:column;gap:9px;}
      .hcard{background:var(--card);border:1px solid var(--line);border-radius:11px;overflow:hidden;}
      .hcard-success{border-left:3px solid var(--green);}
      .hcard-failure{border-left:3px solid var(--red);}
      .hcard-pending{border-left:3px solid var(--fog);}
      .hcard-head{display:flex;align-items:center;justify-content:space-between;padding:13px 15px;cursor:pointer;}
      .hcard-head:hover{background:rgba(255,255,255,.02);}
      .hcard-left{display:flex;align-items:center;gap:11px;}
      .hcard-biz{font-weight:700;font-size:14px;color:var(--white);}
      .hcard-meta{font-size:12px;color:var(--slate);margin-top:2px;}
      .chevron{transition:transform .2s;} .rotated{transform:rotate(90deg);}
      .hcard-body{padding:0 15px 15px;border-top:1px solid var(--line);}
      .hcard-text{font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7;color:var(--bone);white-space:pre-wrap;word-break:break-word;padding:13px 0;}
      .hcard-outcome{display:flex;flex-direction:column;gap:9px;margin-top:6px;}
      .note-input{width:100%;background:var(--navy);border:1px solid var(--line);border-radius:8px;color:var(--bone);font-family:'Inter';font-size:13px;padding:9px 11px;resize:none;outline:none;}
      .note-input:focus{border-color:var(--violet);}
      .hcard-note{font-size:12.5px;color:var(--slate);font-style:italic;margin-top:8px;}

      .goal-optional{font-size:9px;font-weight:500;color:var(--fog);text-transform:lowercase;letter-spacing:.03em;margin-left:6px;background:var(--card);padding:2px 7px;border-radius:999px;border:1px solid var(--line);}
      .field-wrap-tall{align-items:flex-start;padding:10px 12px;}
      .input-textarea{resize:none;line-height:1.6;font-size:13px;padding:0 8px;}
      .output-goal{background:rgba(124,58,237,.12);color:#A78BFA;font-size:11px;padding:3px 9px;border-radius:999px;font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .hcard-goal{color:var(--fog);font-size:11px;}
      @media(max-width:600px){
        .auth-wrap{grid-template-columns:1fr;}
        .auth-left{display:none;}
        .main-grid{grid-template-columns:1fr;}
        .col-input{border-right:none;border-bottom:1px solid var(--line);}
        .topbar{padding:11px 14px;flex-wrap:wrap;gap:8px;}
        .stat-pill{display:none;}
        .history-wrap{padding:18px;}
      }
    `}</style>
  );
}
