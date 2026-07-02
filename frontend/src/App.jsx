import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mail, Lock, User, Eye, EyeOff, Upload, Zap, CheckCircle2,
  XCircle, Clock, ChevronDown, LogOut, X, Copy, Check,
  TrendingUp, AlertCircle, Sparkles, RotateCcw, Camera,
  Building2, Tag, ChevronRight, Loader2,
} from "lucide-react";

/* ---------------------------------------------------------------
   Config
--------------------------------------------------------------- */
const API = import.meta.env.VITE_API_URL || "http://localhost:5001";

/* ---------------------------------------------------------------
   API helpers
--------------------------------------------------------------- */
const getToken  = ()    => localStorage.getItem("pf_access");
const getRToken = ()    => localStorage.getItem("pf_refresh");
const storeTokens = (a, r) => { localStorage.setItem("pf_access", a); if (r) localStorage.setItem("pf_refresh", r); };
const clearTokens = ()  => { localStorage.removeItem("pf_access"); localStorage.removeItem("pf_refresh"); };

async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const isForm  = opts.body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${API}${path}`, { ...opts, headers });

  if (res.status === 401) {
    const rt = getRToken();
    if (rt) {
      const rr = await fetch(`${API}/api/auth/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${rt}`, "Content-Type": "application/json" },
      });
      if (rr.ok) {
        const { access_token } = await rr.json();
        storeTokens(access_token, null);
        headers["Authorization"] = `Bearer ${access_token}`;
        res = await fetch(`${API}${path}`, { ...opts, headers });
      } else { clearTokens(); }
    }
  }
  return res;
}

/* ---------------------------------------------------------------
   Root
--------------------------------------------------------------- */
export default function PitchForge() {
  const [screen,  setScreen]  = useState("auth");
  const [account, setAccount] = useState(null);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    apiFetch("/api/me").then(async r => {
      if (r.ok) { const { user } = await r.json(); setAccount(user); setScreen("tool"); }
      else clearTokens();
    }).catch(() => clearTokens());
  }, []);

  function onAuth(user, access, refresh) {
    storeTokens(access, refresh);
    setAccount(user);
    setScreen("tool");
  }

  function onLogout() { clearTokens(); setAccount(null); setScreen("auth"); }

  return (
    <div className="pf-root">
      <Styles />
      {screen === "auth" && <AuthScreen onAuth={onAuth} />}
      {screen === "tool" && account && (
        <ToolScreen account={account} setAccount={setAccount} onLogout={onLogout} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   Auth Screen
--------------------------------------------------------------- */
function AuthScreen({ onAuth }) {
  const [mode,     setMode]    = useState("signup");
  const [email,    setEmail]   = useState("");
  const [username, setUname]   = useState("");
  const [password, setPass]    = useState("");
  const [showPw,   setShowPw]  = useState(false);
  const [errors,   setErrors]  = useState({});
  const [apiErr,   setApiErr]  = useState("");
  const [loading,  setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setApiErr("");
    const errs = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email.";
    if (mode === "signup" && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) errs.username = "3–20 chars: letters, numbers, underscore.";
    if (password.length < 6) errs.password = "At least 6 characters.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const endpoint = mode === "signup" ? "/api/auth/register" : "/api/auth/login";
      const body     = mode === "signup" ? { email, username, password } : { email, password };
      const res      = await fetch(`${API}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data     = await res.json();
      if (!res.ok) { data.errors ? setErrors(data.errors) : setApiErr(data.error || "Something went wrong."); return; }
      onAuth(data.user, data.access_token, data.refresh_token);
    } catch { setApiErr("Cannot reach the server. Is it running?"); }
    finally   { setLoading(false); }
  }

  return (
    <div className="pf-auth">
      {/* Left brand panel */}
      <div className="pf-auth-left">
        <div className="pf-auth-logo">
          <Camera size={20} /> PitchForge
        </div>
        <div className="pf-auth-hero">
          <h1 className="pf-display">Turn any Instagram into a <span className="pf-violet">signed client.</span></h1>
          <p className="pf-auth-sub">Drop in their profile screenshot and two posts. PitchForge reads their account and writes a personalised outreach message that actually gets replies — then learns from every win and loss to get sharper over time.</p>
        </div>
        <div className="pf-auth-pills">
          <div className="pf-pill"><CheckCircle2 size={13} color="#10B981" /> Spots real strengths and weaknesses</div>
          <div className="pf-pill"><CheckCircle2 size={13} color="#10B981" /> Offers a free post to open the door</div>
          <div className="pf-pill"><CheckCircle2 size={13} color="#10B981" /> Gets smarter with every campaign</div>
        </div>
        <div className="pf-auth-orbit">
          <div className="pf-orbit-ring pf-orbit-1" />
          <div className="pf-orbit-ring pf-orbit-2" />
          <div className="pf-orbit-ring pf-orbit-3" />
          <div className="pf-orbit-core"><Camera size={22} /></div>
          <div className="pf-orbit-dot pf-od-1"><Zap size={10} /></div>
          <div className="pf-orbit-dot pf-od-2"><TrendingUp size={10} /></div>
          <div className="pf-orbit-dot pf-od-3"><Sparkles size={10} /></div>
        </div>
      </div>

      {/* Right auth card */}
      <div className="pf-auth-right">
        <div className="pf-auth-card">
          <div className="pf-tabs">
            <button className={"pf-tab"+(mode==="signup"?" pf-tab-on":"")} onClick={()=>setMode("signup")} type="button">Sign up</button>
            <button className={"pf-tab"+(mode==="login" ?" pf-tab-on":"")} onClick={()=>setMode("login")}  type="button">Log in</button>
          </div>

          {apiErr && <div className="pf-banner pf-banner-err"><AlertCircle size={14}/> {apiErr}</div>}

          <form onSubmit={submit} className="pf-form" noValidate>
            <AuthField label="Email"    icon={<Mail size={15}/>} type="email"    value={email}    onChange={setEmail}   error={errors.email}    placeholder="you@agency.com" autoComplete="email"/>
            {mode === "signup" && <AuthField label="Username" icon={<User size={15}/>}                      value={username} onChange={setUname}   error={errors.username} placeholder="your handle"     autoComplete="username"/>}
            <AuthField label="Password" icon={<Lock size={15}/>} type={showPw?"text":"password"}  value={password} onChange={setPass}    error={errors.password} placeholder="••••••••"    autoComplete={mode==="signup"?"new-password":"current-password"}
              suffix={<button type="button" className="pf-eye" onClick={()=>setShowPw(v=>!v)}>{showPw?<EyeOff size={14}/>:<Eye size={14}/>}</button>}
            />
            <button type="submit" className="pf-btn pf-btn-primary" disabled={loading}>
              {loading ? <Loader2 size={15} className="pf-spin"/> : <Zap size={15}/>}
              {loading ? "Please wait…" : mode==="signup" ? "Create account" : "Log in"}
            </button>
            <p className="pf-fine">{mode==="signup" ? "Free forever. No credit card." : "Welcome back."}</p>
          </form>
        </div>
      </div>
    </div>
  );
}

function AuthField({ label, icon, error, suffix, ...rest }) {
  return (
    <label className="pf-field">
      <span className="pf-field-label">{label}</span>
      <div className={"pf-field-wrap"+(error?" pf-field-err":"")}>
        <span className="pf-field-icon">{icon}</span>
        <input className="pf-input" {...rest} onChange={e=>rest.onChange(e.target.value)} value={rest.value}/>
        {suffix}
      </div>
      {error && <span className="pf-err-msg"><AlertCircle size={11}/> {error}</span>}
    </label>
  );
}

/* ---------------------------------------------------------------
   Tool Screen
--------------------------------------------------------------- */
function ToolScreen({ account, setAccount, onLogout }) {
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [messages,    setMessages]    = useState([]);
  const [generating,  setGenerating]  = useState(false);
  const [generated,   setGenerated]   = useState(null);  // latest generated message
  const [apiErr,      setApiErr]      = useState("");
  const [tab,         setTab]         = useState("generate"); // 'generate' | 'history'
  const [copied,      setCopied]      = useState(false);

  // Form state
  const [bizName,   setBizName]   = useState("");
  const [bizField,  setBizField]  = useState("");
  const [imgProfile,setImgProfile]= useState(null);
  const [imgPost1,  setImgPost1]  = useState(null);
  const [imgPost2,  setImgPost2]  = useState(null);

  // Typewriter state
  const [displayText, setDisplayText] = useState("");
  const [typing,      setTyping]      = useState(false);

  const profileRef = useRef(); const post1Ref = useRef(); const post2Ref = useRef();

  // Load history on mount
  useEffect(() => { loadMessages(); }, []);

  async function loadMessages() {
    const res = await apiFetch("/api/messages");
    if (res.ok) { const d = await res.json(); setMessages(d.messages); }
  }

  // Typewriter effect
  useEffect(() => {
    if (!generated) return;
    setDisplayText("");
    setTyping(true);
    const text = generated.generated_text;
    let i = 0;
    const interval = setInterval(() => {
      setDisplayText(text.slice(0, i + 1));
      i++;
      if (i >= text.length) { clearInterval(interval); setTyping(false); }
    }, 18);
    return () => clearInterval(interval);
  }, [generated]);

  async function handleGenerate(e) {
    e.preventDefault();
    setApiErr("");
    if (!imgProfile) { setApiErr("Upload at least the Instagram profile screenshot."); return; }
    if (!bizName.trim())  { setApiErr("Enter the business name."); return; }
    if (!bizField.trim()) { setApiErr("Enter the business field / industry."); return; }

    const form = new FormData();
    form.append("business_name",  bizName.trim());
    form.append("business_field", bizField.trim());
    form.append("image_profile",  imgProfile);
    if (imgPost1) form.append("image_post1", imgPost1);
    if (imgPost2) form.append("image_post2", imgPost2);

    setGenerating(true);
    try {
      const res  = await apiFetch("/api/generate", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setApiErr(data.error || "Generation failed."); return; }
      setGenerated(data.message);
      setAccount(data.user);
      setMessages(prev => [data.message, ...prev]);
      setTab("generate");
    } catch { setApiErr("Cannot reach the server."); }
    finally   { setGenerating(false); }
  }

  async function setOutcome(msgId, outcome, note = "") {
    const res  = await apiFetch(`/api/messages/${msgId}/outcome`, {
      method: "POST",
      body:   JSON.stringify({ outcome, note }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessages(prev => prev.map(m => m.id === msgId ? data.message : m));
      setAccount(data.user);
      if (generated?.id === msgId) setGenerated(data.message);
    }
  }

  function copyText() {
    if (!generated) return;
    navigator.clipboard.writeText(generated.generated_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setGenerated(null); setDisplayText(""); setImgProfile(null);
    setImgPost1(null); setImgPost2(null); setBizName(""); setBizField(""); setApiErr("");
  }

  const stats = account.stats || {};

  return (
    <div className="pf-tool">
      {/* Topbar */}
      <header className="pf-topbar">
        <div className="pf-topbar-logo"><Camera size={16}/> PitchForge</div>
        <div className="pf-topbar-right">
          {/* Stats pills */}
          <div className="pf-stat-pill pf-stat-s"><CheckCircle2 size={12}/> {stats.successes||0} won</div>
          <div className="pf-stat-pill pf-stat-f"><XCircle      size={12}/> {stats.failures ||0} lost</div>
          <div className="pf-stat-pill pf-stat-p"><Clock        size={12}/> {stats.pending  ||0} pending</div>
          {/* Account menu */}
          <div className="pf-acct-wrap">
            <button className="pf-avatar" onClick={()=>setMenuOpen(v=>!v)} type="button">
              {account.username[0].toUpperCase()} <ChevronDown size={13}/>
            </button>
            {menuOpen && (
              <div className="pf-menu">
                <div className="pf-menu-head">
                  <div className="pf-menu-name">{account.username}</div>
                  <div className="pf-menu-email">{account.email}</div>
                </div>
                <button className="pf-menu-item" onClick={onLogout} type="button"><LogOut size={13}/> Log out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="pf-tabbar">
        <button className={"pf-maintab"+(tab==="generate"?" pf-maintab-on":"")} onClick={()=>setTab("generate")} type="button">
          <Zap size={14}/> Generate
        </button>
        <button className={"pf-maintab"+(tab==="history"?" pf-maintab-on":"")} onClick={()=>setTab("history")} type="button">
          <Clock size={14}/> History <span className="pf-count">{messages.length}</span>
        </button>
      </div>

      {tab === "generate" && (
        <div className="pf-main">
          {/* ---- Left: Input ---- */}
          <section className="pf-input-col">
            <div className="pf-section-label">01 · INSTAGRAM SCREENSHOTS</div>

            <div className="pf-img-grid">
              <ImageDropZone label="Profile page" sublabel="Required" file={imgProfile} onFile={setImgProfile} inputRef={profileRef} accent />
              <ImageDropZone label="Post 1"       sublabel="Optional" file={imgPost1}   onFile={setImgPost1}   inputRef={post1Ref}  />
              <ImageDropZone label="Post 2"       sublabel="Optional" file={imgPost2}   onFile={setImgPost2}   inputRef={post2Ref}  />
            </div>

            <div className="pf-section-label" style={{marginTop:24}}>02 · BUSINESS INFO</div>

            <label className="pf-field">
              <span className="pf-field-label">Business name</span>
              <div className="pf-field-wrap">
                <span className="pf-field-icon"><Building2 size={15}/></span>
                <input className="pf-input" value={bizName} onChange={e=>setBizName(e.target.value)} placeholder="e.g. Bloom Bakery"/>
              </div>
            </label>

            <label className="pf-field">
              <span className="pf-field-label">Field / industry</span>
              <div className="pf-field-wrap">
                <span className="pf-field-icon"><Tag size={15}/></span>
                <input className="pf-input" value={bizField} onChange={e=>setBizField(e.target.value)} placeholder="e.g. Artisan bakery, fitness coaching, real estate…"/>
              </div>
            </label>

            {apiErr && <div className="pf-banner pf-banner-err"><AlertCircle size={13}/> {apiErr}</div>}

            <button className="pf-btn pf-btn-primary pf-btn-full" onClick={handleGenerate} disabled={generating} type="button">
              {generating ? <Loader2 size={15} className="pf-spin"/> : <Sparkles size={15}/>}
              {generating ? "Analysing & writing…" : "Generate pitch message"}
            </button>

            {generating && (
              <div className="pf-generating-steps">
                <Step label="Reading Instagram screenshots"  done={true} />
                <Step label="Analysing brand strengths"      done={true} />
                <Step label="Identifying quick wins"         done={true} />
                <Step label="Writing personalised message"   done={false} active />
              </div>
            )}
          </section>

          {/* ---- Right: Output ---- */}
          <section className="pf-output-col">
            <div className="pf-section-label">03 · YOUR PITCH MESSAGE</div>

            {!generated && !generating && (
              <div className="pf-output-empty">
                <div className="pf-empty-icon"><Camera size={28}/></div>
                <p>Upload the screenshots, fill in the business details, and hit Generate — your personalised pitch will appear here.</p>
              </div>
            )}

            {(generated || generating) && (
              <div className="pf-output-card">
                {/* Business tag */}
                {generated && (
                  <div className="pf-output-meta">
                    <span className="pf-output-biz">{generated.business_name}</span>
                    <span className="pf-output-field">{generated.business_field}</span>
                    <span className="pf-output-date">{new Date(generated.created_at).toLocaleDateString()}</span>
                  </div>
                )}

                {/* Message text */}
                <div className="pf-message-box">
                  {generating && !displayText && (
                    <div className="pf-generating-dots">
                      <span/><span/><span/>
                    </div>
                  )}
                  {displayText && (
                    <pre className="pf-message-text">
                      {displayText}{typing && <span className="pf-cursor">|</span>}
                    </pre>
                  )}
                </div>

                {/* Actions */}
                {generated && !typing && (
                  <>
                    <div className="pf-output-actions">
                      <button className="pf-btn pf-btn-ghost pf-btn-sm" onClick={copyText} type="button">
                        {copied ? <><Check size={13}/> Copied!</> : <><Copy size={13}/> Copy message</>}
                      </button>
                      <button className="pf-btn pf-btn-ghost pf-btn-sm" onClick={reset} type="button">
                        <RotateCcw size={13}/> New pitch
                      </button>
                    </div>

                    {/* Outcome tracker */}
                    <div className="pf-outcome-section">
                      <div className="pf-outcome-label">Did this message get a reply?</div>
                      {!generated.outcome ? (
                        <div className="pf-outcome-btns">
                          <OutcomeBtn
                            type="success"
                            onClick={() => setOutcome(generated.id, "success")}
                            icon={<CheckCircle2 size={14}/>}
                            label="It worked! 🎉"
                          />
                          <OutcomeBtn
                            type="failure"
                            onClick={() => setOutcome(generated.id, "failure")}
                            icon={<XCircle size={14}/>}
                            label="No reply"
                          />
                        </div>
                      ) : (
                        <OutcomeResult outcome={generated.outcome} />
                      )}
                      <p className="pf-outcome-hint">
                        PitchForge uses your results to refine future messages automatically.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "history" && (
        <div className="pf-history">
          {messages.length === 0 ? (
            <div className="pf-output-empty" style={{margin:"48px auto"}}>
              <div className="pf-empty-icon"><Clock size={28}/></div>
              <p>No messages yet. Generate your first pitch and it'll appear here.</p>
            </div>
          ) : (
            <>
              <div className="pf-history-legend">
                <span className="pf-legend-s"><CheckCircle2 size={11}/> Won</span>
                <span className="pf-legend-f"><XCircle      size={11}/> Lost</span>
                <span className="pf-legend-p"><Clock        size={11}/> Pending</span>
              </div>
              <div className="pf-history-grid">
                {messages.map(m => (
                  <HistoryCard key={m.id} msg={m} onOutcome={setOutcome} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   Image Drop Zone
--------------------------------------------------------------- */
function ImageDropZone({ label, sublabel, file, onFile, inputRef, accent }) {
  const [drag, setDrag] = useState(false);

  function handle(f) {
    if (f && f.type.startsWith("image/")) onFile(f);
  }

  return (
    <div
      className={"pf-dropzone"+(drag?" pf-dz-drag":"")+(accent?" pf-dz-accent":"")+(file?" pf-dz-filled":"")}
      onDragOver={e=>{e.preventDefault();setDrag(true);}}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0]);}}
      onClick={()=>inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e=>handle(e.target.files[0])}/>
      {file ? (
        <>
          <img src={URL.createObjectURL(file)} alt={label} className="pf-dz-preview"/>
          <button className="pf-dz-remove" onClick={e=>{e.stopPropagation();onFile(null);}} type="button">
            <X size={12}/>
          </button>
        </>
      ) : (
        <div className="pf-dz-inner">
          <Upload size={16} color={accent?"#7C3AED":"#475569"}/>
          <div className="pf-dz-label">{label}</div>
          <div className="pf-dz-sub">{sublabel}</div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   History Card
--------------------------------------------------------------- */
function HistoryCard({ msg, onOutcome }) {
  const [expanded, setExpanded] = useState(false);
  const [note,     setNote]     = useState("");
  const [pending,  setPending]  = useState(false);

  async function mark(outcome) {
    setPending(true);
    await onOutcome(msg.id, outcome, note);
    setPending(false);
  }

  const statusClass = msg.outcome === "success" ? "pf-hcard-s" : msg.outcome === "failure" ? "pf-hcard-f" : "pf-hcard-p";
  const StatusIcon  = msg.outcome === "success" ? CheckCircle2 : msg.outcome === "failure" ? XCircle : Clock;
  const statusColor = msg.outcome === "success" ? "#10B981"    : msg.outcome === "failure" ? "#F43F5E" : "#94A3B8";

  return (
    <div className={"pf-hcard "+statusClass}>
      <div className="pf-hcard-head" onClick={()=>setExpanded(v=>!v)}>
        <div className="pf-hcard-info">
          <StatusIcon size={14} color={statusColor}/>
          <div>
            <div className="pf-hcard-biz">{msg.business_name}</div>
            <div className="pf-hcard-field">{msg.business_field} · {new Date(msg.created_at).toLocaleDateString()}</div>
          </div>
        </div>
        <ChevronRight size={14} className={"pf-hcard-chevron"+(expanded?" pf-rotated":"")}/>
      </div>

      {expanded && (
        <div className="pf-hcard-body">
          <pre className="pf-hcard-text">{msg.generated_text}</pre>

          {!msg.outcome ? (
            <div className="pf-hcard-outcome">
              <div className="pf-outcome-label">Did this get a reply?</div>
              <textarea
                className="pf-note-input"
                placeholder="Optional note (e.g. 'They asked for pricing')"
                value={note}
                onChange={e=>setNote(e.target.value)}
                rows={2}
              />
              <div className="pf-outcome-btns">
                <OutcomeBtn type="success" onClick={()=>mark("success")} icon={<CheckCircle2 size={13}/>} label="It worked!" disabled={pending}/>
                <OutcomeBtn type="failure" onClick={()=>mark("failure")} icon={<XCircle      size={13}/>} label="No reply"   disabled={pending}/>
              </div>
            </div>
          ) : (
            <div className="pf-hcard-result">
              <OutcomeResult outcome={msg.outcome}/>
              {msg.outcome_note && <div className="pf-hcard-note">"{msg.outcome_note}"</div>}
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
function OutcomeBtn({ type, onClick, icon, label, disabled }) {
  return (
    <button
      className={"pf-outcome-btn pf-ob-"+type}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      {icon} {label}
    </button>
  );
}

function OutcomeResult({ outcome }) {
  const is = outcome === "success";
  return (
    <div className={"pf-outcome-result pf-or-"+(is?"s":"f")}>
      {is ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}
      {is ? "Marked as won — PitchForge will reinforce this style." : "Marked as lost — PitchForge will adjust future messages."}
    </div>
  );
}

function Step({ label, done, active }) {
  return (
    <div className={"pf-step"+(done?" pf-step-done":"")+(active?" pf-step-active":"")}>
      {done   ? <Check     size={12}/> :
       active ? <Loader2   size={12} className="pf-spin"/> :
                <span className="pf-step-dot"/>}
      {label}
    </div>
  );
}

/* ---------------------------------------------------------------
   Styles
--------------------------------------------------------------- */
function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      .pf-root {
        --navy:   #0D1117;
        --panel:  #161B22;
        --card:   #1C2230;
        --line:   #30374A;
        --fog:    #64748B;
        --slate:  #94A3B8;
        --bone:   #E2E8F0;
        --white:  #F0F4FF;
        --violet: #7C3AED;
        --violet-dim: #5B21B6;
        --violet-glow: rgba(124,58,237,0.15);
        --emerald:#10B981;
        --rose:   #F43F5E;
        --amber:  #F59E0B;
        background: var(--navy);
        color: var(--bone);
        font-family: 'Inter', sans-serif;
        min-height: 100vh;
        -webkit-font-smoothing: antialiased;
      }
      .pf-root *:focus-visible { outline: 2px solid var(--violet); outline-offset: 2px; }
      .pf-display { font-family: 'Syne', sans-serif; }
      .pf-violet  { color: var(--violet); }

      /* ---- Auth ---- */
      .pf-auth { display: grid; grid-template-columns: 1.1fr 0.9fr; min-height: 100vh; }

      .pf-auth-left {
        background: linear-gradient(135deg, #0D1117 0%, #130D2E 100%);
        border-right: 1px solid var(--line);
        padding: 52px 56px;
        display: flex; flex-direction: column; gap: 32px;
        position: relative; overflow: hidden;
      }
      .pf-auth-logo { display: flex; align-items: center; gap: 8px; font-family: 'Syne', sans-serif; font-size: 17px; font-weight: 700; color: var(--violet); }
      .pf-auth-hero h1 { font-size: 36px; line-height: 1.2; font-weight: 800; color: var(--white); max-width: 460px; }
      .pf-auth-sub { color: var(--slate); font-size: 15px; line-height: 1.7; max-width: 440px; margin-top: 14px; }
      .pf-auth-pills { display: flex; flex-direction: column; gap: 10px; }
      .pf-pill { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--bone); }

      /* Orbit animation */
      .pf-auth-orbit { position: absolute; bottom: -60px; right: -60px; width: 320px; height: 320px; }
      .pf-orbit-ring { position: absolute; border-radius: 50%; border: 1px solid; }
      .pf-orbit-1 { width: 160px; height: 160px; top: 80px; left: 80px; border-color: rgba(124,58,237,.2); animation: pf-spin 12s linear infinite; }
      .pf-orbit-2 { width: 240px; height: 240px; top: 40px; left: 40px; border-color: rgba(124,58,237,.12); animation: pf-spin 20s linear infinite reverse; }
      .pf-orbit-3 { width: 320px; height: 320px; top: 0;    left: 0;    border-color: rgba(124,58,237,.07); animation: pf-spin 30s linear infinite; }
      .pf-orbit-core { position: absolute; width: 48px; height: 48px; top: 136px; left: 136px; background: var(--violet); border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #fff; box-shadow: 0 0 40px rgba(124,58,237,.4); }
      .pf-orbit-dot { position: absolute; width: 26px; height: 26px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--violet); }
      .pf-od-1 { top: 60px;  left: 148px; }
      .pf-od-2 { top: 148px; left: 240px; }
      .pf-od-3 { top: 230px; left: 120px; }
      @keyframes pf-spin { to { transform: rotate(360deg); } }

      .pf-auth-right { display: flex; align-items: center; justify-content: center; padding: 40px; background: var(--navy); }
      .pf-auth-card  { width: 100%; max-width: 380px; background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 28px; }

      .pf-tabs { display: flex; gap: 4px; background: var(--navy); border-radius: 10px; padding: 4px; margin-bottom: 24px; }
      .pf-tab  { flex: 1; background: none; border: none; color: var(--fog); font-family: 'Inter'; font-size: 14px; font-weight: 600; padding: 9px 0; border-radius: 7px; cursor: pointer; }
      .pf-tab-on { background: var(--card); color: var(--white); }

      /* ---- Fields ---- */
      .pf-form  { display: flex; flex-direction: column; gap: 16px; }
      .pf-field { display: flex; flex-direction: column; gap: 6px; }
      .pf-field-label { font-size: 11.5px; color: var(--slate); text-transform: uppercase; letter-spacing: .06em; font-weight: 500; }
      .pf-field-wrap  { display: flex; align-items: center; background: var(--navy); border: 1px solid var(--line); border-radius: 10px; padding: 0 12px; transition: border-color .15s; }
      .pf-field-wrap:focus-within { border-color: var(--violet); }
      .pf-field-err   { border-color: var(--rose); }
      .pf-field-icon  { color: var(--fog); display: flex; flex-shrink: 0; }
      .pf-input       { flex: 1; background: none; border: none; color: var(--white); font-family: 'Inter'; font-size: 14px; padding: 11px 10px; outline: none; }
      .pf-input::placeholder { color: var(--fog); }
      .pf-eye         { background: none; border: none; color: var(--fog); cursor: pointer; display: flex; padding: 4px; }
      .pf-err-msg     { display: flex; align-items: center; gap: 5px; color: var(--rose); font-size: 12px; }
      .pf-fine        { color: var(--fog); font-size: 12px; text-align: center; }

      /* ---- Buttons ---- */
      .pf-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-family: 'Inter'; font-weight: 600; font-size: 14px; padding: 11px 18px; border-radius: 10px; border: 1px solid transparent; cursor: pointer; transition: all .15s; text-decoration: none; }
      .pf-btn:disabled { opacity: .45; cursor: not-allowed; }
      .pf-btn-full    { width: 100%; }
      .pf-btn-primary { background: var(--violet); color: #fff; border-color: var(--violet); }
      .pf-btn-primary:hover:not(:disabled) { background: #6D28D9; }
      .pf-btn-ghost   { background: transparent; border-color: var(--line); color: var(--bone); }
      .pf-btn-ghost:hover:not(:disabled) { border-color: var(--violet); color: var(--violet); }
      .pf-btn-sm      { font-size: 13px; padding: 8px 14px; }

      .pf-spin { animation: pf-spin-kf 1s linear infinite; }
      @keyframes pf-spin-kf { to { transform: rotate(360deg); } }

      /* ---- Banner ---- */
      .pf-banner { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
      .pf-banner-err { background: rgba(244,63,94,.1); border: 1px solid rgba(244,63,94,.3); color: var(--rose); }

      /* ---- Tool: topbar ---- */
      .pf-topbar { display: flex; align-items: center; justify-content: space-between; padding: 14px 28px; border-bottom: 1px solid var(--line); background: var(--panel); }
      .pf-topbar-logo { display: flex; align-items: center; gap: 8px; font-family: 'Syne'; font-size: 15px; font-weight: 700; color: var(--violet); }
      .pf-topbar-right { display: flex; align-items: center; gap: 10px; }
      .pf-stat-pill { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line); }
      .pf-stat-s { color: var(--emerald); border-color: rgba(16,185,129,.25); background: rgba(16,185,129,.08); }
      .pf-stat-f { color: var(--rose);    border-color: rgba(244,63,94,.25);  background: rgba(244,63,94,.08); }
      .pf-stat-p { color: var(--slate);   border-color: var(--line); }

      /* Account menu */
      .pf-acct-wrap { position: relative; }
      .pf-avatar    { display: flex; align-items: center; gap: 4px; background: var(--card); border: 1px solid var(--line); color: var(--bone); height: 34px; padding: 0 10px; border-radius: 999px; cursor: pointer; font-weight: 700; font-size: 13px; }
      .pf-menu      { position: absolute; right: 0; top: 42px; width: 210px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 8px; z-index: 50; }
      .pf-menu-head { padding: 8px 10px 10px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
      .pf-menu-name { font-weight: 600; font-size: 14px; }
      .pf-menu-email{ color: var(--fog); font-size: 11px; margin-top: 2px; }
      .pf-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; color: var(--bone); font-size: 13px; padding: 9px 10px; border-radius: 6px; cursor: pointer; text-align: left; }
      .pf-menu-item:hover { background: var(--card); }

      /* ---- Tab bar ---- */
      .pf-tabbar    { display: flex; gap: 2px; padding: 10px 28px 0; border-bottom: 1px solid var(--line); background: var(--panel); }
      .pf-maintab   { display: flex; align-items: center; gap: 6px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--fog); font-family: 'Inter'; font-size: 14px; font-weight: 600; padding: 10px 16px; cursor: pointer; margin-bottom: -1px; }
      .pf-maintab-on { color: var(--violet); border-bottom-color: var(--violet); }
      .pf-count     { background: var(--card); color: var(--slate); font-size: 11px; padding: 2px 7px; border-radius: 999px; font-weight: 600; }

      /* ---- Main layout ---- */
      .pf-main { display: grid; grid-template-columns: 1fr 1fr; gap: 0; min-height: calc(100vh - 105px); }

      .pf-input-col  { padding: 28px; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 14px; }
      .pf-output-col { padding: 28px; display: flex; flex-direction: column; gap: 14px; }
      .pf-section-label { font-size: 10.5px; font-weight: 700; color: var(--violet); text-transform: uppercase; letter-spacing: .1em; }

      /* ---- Image drop zones ---- */
      .pf-img-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
      .pf-dropzone { position: relative; border: 1.5px dashed var(--line); border-radius: 12px; height: 110px; cursor: pointer; overflow: hidden; transition: border-color .15s, background .15s; display: flex; align-items: center; justify-content: center; background: var(--card); }
      .pf-dropzone:hover { border-color: var(--slate); }
      .pf-dz-drag   { border-color: var(--violet); background: var(--violet-glow); }
      .pf-dz-accent { border-color: rgba(124,58,237,.4); }
      .pf-dz-filled { border-style: solid; border-color: var(--violet); }
      .pf-dz-inner  { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 12px; }
      .pf-dz-label  { font-size: 12px; font-weight: 600; color: var(--bone); }
      .pf-dz-sub    { font-size: 10.5px; color: var(--fog); }
      .pf-dz-preview{ width: 100%; height: 100%; object-fit: cover; display: block; }
      .pf-dz-remove { position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,.7); border: none; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; color: #fff; cursor: pointer; }

      /* ---- Generating steps ---- */
      .pf-generating-steps { display: flex; flex-direction: column; gap: 8px; }
      .pf-step { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--fog); }
      .pf-step-done   { color: var(--emerald); }
      .pf-step-active { color: var(--violet); }
      .pf-step-dot    { width: 6px; height: 6px; border-radius: 50%; background: var(--line); display: inline-block; }

      /* ---- Output card ---- */
      .pf-output-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; min-height: 340px; color: var(--fog); text-align: center; max-width: 300px; margin: 0 auto; line-height: 1.6; font-size: 14px; }
      .pf-empty-icon   { width: 56px; height: 56px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: var(--violet); }

      .pf-output-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
      .pf-output-meta { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
      .pf-output-biz  { font-weight: 700; font-size: 13.5px; color: var(--white); }
      .pf-output-field{ background: var(--violet-glow); color: var(--violet); font-size: 11.5px; padding: 3px 9px; border-radius: 999px; font-weight: 600; }
      .pf-output-date { color: var(--fog); font-size: 11.5px; margin-left: auto; }

      .pf-message-box { padding: 18px; min-height: 180px; display: flex; align-items: flex-start; }
      .pf-message-text { font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.75; color: var(--bone); white-space: pre-wrap; word-break: break-word; }
      .pf-cursor { display: inline-block; width: 2px; height: 1em; background: var(--violet); margin-left: 1px; animation: pf-blink .7s step-end infinite; vertical-align: text-bottom; }
      @keyframes pf-blink { 50% { opacity: 0; } }

      .pf-generating-dots { display: flex; gap: 6px; align-items: center; padding: 8px 0; }
      .pf-generating-dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--violet); animation: pf-dot .9s ease-in-out infinite; }
      .pf-generating-dots span:nth-child(2) { animation-delay: .2s; }
      .pf-generating-dots span:nth-child(3) { animation-delay: .4s; }
      @keyframes pf-dot { 0%,80%,100% { transform: scale(.6); opacity: .3; } 40% { transform: scale(1); opacity: 1; } }

      .pf-output-actions { display: flex; gap: 8px; padding: 0 16px 14px; border-bottom: 1px solid var(--line); }

      /* ---- Outcome ---- */
      .pf-outcome-section { padding: 16px; }
      .pf-outcome-label   { font-size: 12px; font-weight: 600; color: var(--slate); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
      .pf-outcome-btns    { display: flex; gap: 8px; }
      .pf-outcome-btn     { display: flex; align-items: center; gap: 6px; font-family: 'Inter'; font-size: 13px; font-weight: 600; padding: 9px 16px; border-radius: 8px; border: 1.5px solid; cursor: pointer; transition: all .15s; }
      .pf-outcome-btn:disabled { opacity: .5; cursor: not-allowed; }
      .pf-ob-success { background: rgba(16,185,129,.1); border-color: rgba(16,185,129,.4); color: var(--emerald); }
      .pf-ob-success:hover:not(:disabled) { background: rgba(16,185,129,.2); }
      .pf-ob-failure { background: rgba(244,63,94,.1);  border-color: rgba(244,63,94,.4);  color: var(--rose); }
      .pf-ob-failure:hover:not(:disabled) { background: rgba(244,63,94,.2); }
      .pf-outcome-result  { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; padding: 10px 14px; border-radius: 8px; }
      .pf-or-s { background: rgba(16,185,129,.1); color: var(--emerald); }
      .pf-or-f { background: rgba(244,63,94,.1);  color: var(--rose); }
      .pf-outcome-hint { color: var(--fog); font-size: 11.5px; margin-top: 10px; line-height: 1.5; }

      /* ---- History ---- */
      .pf-history { padding: 28px; max-width: 900px; margin: 0 auto; width: 100%; }
      .pf-history-legend { display: flex; gap: 16px; margin-bottom: 20px; }
      .pf-legend-s,.pf-legend-f,.pf-legend-p { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; }
      .pf-legend-s { color: var(--emerald); }
      .pf-legend-f { color: var(--rose); }
      .pf-legend-p { color: var(--slate); }
      .pf-history-grid { display: flex; flex-direction: column; gap: 10px; }

      .pf-hcard      { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; transition: border-color .15s; }
      .pf-hcard-s    { border-left: 3px solid var(--emerald); }
      .pf-hcard-f    { border-left: 3px solid var(--rose); }
      .pf-hcard-p    { border-left: 3px solid var(--fog); }
      .pf-hcard-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; cursor: pointer; }
      .pf-hcard-head:hover { background: rgba(255,255,255,.02); }
      .pf-hcard-info { display: flex; align-items: center; gap: 12px; }
      .pf-hcard-biz  { font-weight: 700; font-size: 14px; color: var(--white); }
      .pf-hcard-field{ font-size: 12px; color: var(--slate); margin-top: 2px; }
      .pf-hcard-chevron { color: var(--fog); transition: transform .2s; }
      .pf-rotated    { transform: rotate(90deg); }

      .pf-hcard-body { padding: 0 16px 16px; border-top: 1px solid var(--line); }
      .pf-hcard-text { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.7; color: var(--bone); white-space: pre-wrap; word-break: break-word; padding: 14px 0; }
      .pf-hcard-outcome { margin-top: 8px; display: flex; flex-direction: column; gap: 10px; }
      .pf-note-input { width: 100%; background: var(--navy); border: 1px solid var(--line); border-radius: 8px; color: var(--bone); font-family: 'Inter'; font-size: 13px; padding: 9px 12px; resize: none; outline: none; }
      .pf-note-input:focus { border-color: var(--violet); }
      .pf-hcard-result{ padding: 4px 0; display: flex; flex-direction: column; gap: 8px; }
      .pf-hcard-note { font-size: 12.5px; color: var(--slate); font-style: italic; }

      @media (max-width: 860px) {
        .pf-auth { grid-template-columns: 1fr; }
        .pf-auth-left { display: none; }
        .pf-main { grid-template-columns: 1fr; }
        .pf-input-col { border-right: none; border-bottom: 1px solid var(--line); }
        .pf-topbar { padding: 12px 16px; }
        .pf-stat-pill { display: none; }
        .pf-tabbar { padding: 8px 16px 0; }
        .pf-img-grid { grid-template-columns: 1fr 1fr 1fr; }
      }
    `}</style>
  );
}
