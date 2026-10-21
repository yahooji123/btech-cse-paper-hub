import { useEffect, useMemo, useState } from "react";
import { BookOpen, Search, Download, Eye, ShieldCheck, UploadCloud, X, FileText, Image as ImageIcon, Trash2, Pencil, GraduationCap, Filter, LockKeyhole, RefreshCw, ExternalLink, Power, Megaphone, Send } from "lucide-react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
const emptyForm = { title: "", semesters: ["1"], subject: "", subjectCode: "", examType: "MTE", academicYear: "2025" };

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}
function formatBytes(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatCount(count = 0) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}
function PreviewModal({ paper, onClose }) {
  useEffect(() => {
    const key = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = ""; };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="preview-modal" role="dialog" aria-modal="true" aria-label={`Preview ${paper.title}`}>
      <header className="modal-head"><div><span className="eyebrow">PAPER PREVIEW</span><h2>{paper.title}</h2>      <p>{paper.subject} · Semester {paper.semesters?.join(", ") || paper.semester} · {paper.examType} · {paper.academicYear}</p></div><button className="icon-btn" onClick={onClose} aria-label="Close preview"><X /></button></header>
      <div className="preview-body">
        {paper.fileType === "image" ? <img className="preview-image" src={paper.fileUrl} alt={paper.title} /> :
          <iframe className="pdf-frame" title={paper.title} src={paper.fileUrl} />}
      </div>
      <footer className="modal-footer"><span className="muted">Preview opens here; downloading is optional.</span><a className="button primary" href={paper.fileUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open in new tab</a><a className="button outline" href={`${API}/papers/${paper._id}/download`}><Download size={16} /> Download</a></footer>
    </section>
  </div>;
}
function MissingRequestModal({ onClose }) {
  const [form, setForm] = useState({ subject: "", semester: "1", examType: "MTE", academicYear: "2025", note: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await request("/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setMessage(result.message); setForm({ subject: "", semester: "1", examType: "MTE", academicYear: "2025", note: "" });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="request-modal" role="dialog" aria-modal="true" aria-label="Request a missing paper">
      <header className="modal-head"><div><span className="eyebrow">CAN'T FIND A PAPER?</span><h2>Request a missing paper</h2><p>Tell us what you need and we will try to add it.</p></div><button className="icon-btn" onClick={onClose} aria-label="Close request form"><X /></button></header>
      <form className="request-form" onSubmit={submit}><label>Subject<input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Operating Systems" required maxLength="120" /></label><div className="request-form-grid"><label>Semester<select value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })}>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n}>{n}</option>)}</select></label><label>Exam type<select value={form.examType} onChange={e => setForm({ ...form, examType: e.target.value })}><option>MTE</option><option>ETE</option></select></label><label>Academic year<input value={form.academicYear} onChange={e => setForm({ ...form, academicYear: e.target.value })} pattern="\d{4}" maxLength="4" required /></label></div><label>Additional note <span className="muted">(optional)</span><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Any specific paper details?" maxLength="500" /></label>{(message || error) && <div className={error ? "alert error" : "alert success"}>{error || message}</div>}<button className="button primary full" disabled={busy}><Send size={15} />{busy ? "Sending…" : "Send request"}</button></form>
    </section>
  </div>;
}
function AdminPanel({ onClose, onChanged, onMaintenanceChanged, onRequestSettingChanged }) {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [papers, setPapers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [requestEnabled, setRequestEnabled] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requests, setRequests] = useState([]);

  async function unlock(e) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { const d = await request("/admin/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); setToken(d.token); setPassword(""); setMessage("Admin panel unlocked."); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function loadAdminPapers() {
    try { const d = await request("/papers", { headers: { Authorization: "Bearer " + token } }); setPapers(d.papers); } catch (err) { setError(err.message); }
  }
  useEffect(() => { if (token) loadAdminPapers(); }, [token]);
  useEffect(() => {
    if (!token) return;
    request("/admin/maintenance", { headers: { Authorization: "Bearer " + token } })
      .then(data => setMaintenanceMode(data.maintenanceMode))
      .catch(err => setError(err.message));
  }, [token]);
  useEffect(() => {
    if (!token) return;
    Promise.all([
      request("/admin/request-settings", { headers: { Authorization: "Bearer " + token } }),
      request("/admin/paper-requests", { headers: { Authorization: "Bearer " + token } }),
    ]).then(([settings, data]) => { setRequestEnabled(settings.missingRequestEnabled); setRequests(data.requests); }).catch(err => setError(err.message));
  }, [token]);
  async function toggleMaintenance() {
    const nextMode = !maintenanceMode;
    setMaintenanceBusy(true); setError(""); setMessage("");
    try {
      const data = await request("/admin/maintenance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ maintenanceMode: nextMode }),
      });
      setMaintenanceMode(data.maintenanceMode);
      onMaintenanceChanged(data.maintenanceMode);
      setMessage(data.maintenanceMode ? "Maintenance mode is ON. Public access is blocked." : "Maintenance mode is OFF. Website is live again.");
    } catch (err) { setError(err.message); } finally { setMaintenanceBusy(false); }
  }
  async function toggleRequests() {
    const nextEnabled = !requestEnabled;
    setRequestBusy(true); setError(""); setMessage("");
    try {
      const data = await request("/admin/request-settings", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ missingRequestEnabled: nextEnabled }) });
      setRequestEnabled(data.missingRequestEnabled); onRequestSettingChanged(data.missingRequestEnabled);
      setMessage(data.missingRequestEnabled ? "Missing paper requests are now visible to students." : "Missing paper request UI is now hidden.");
    } catch (err) { setError(err.message); } finally { setRequestBusy(false); }
  }
  async function deleteRequest(item) {
    if (!confirm(`Remove the request for "${item.subject}"?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await request(`/admin/paper-requests/${item._id}`, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
      setRequests(current => current.filter(requestItem => requestItem._id !== item._id));
      setMessage("Paper request removed.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function setField(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }
  async function analyzePaper() {
    if (!file) {
      setError("Please choose a PDF or image file first.");
      return;
    }
    setAnalyzing(true); setError(""); setMessage("");
    try {
      const data = new FormData();
      data.append("file", file);
      const result = await request("/admin/papers/analyze", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: data,
      });
      setForm(f => ({ ...f, ...result.details, semesters: result.details.semesters.map(String) }));
      setMessage("Gemini extracted the details. Please review them before uploading.");
    } catch (err) { setError(err.message); } finally { setAnalyzing(false); }
  }
  async function analyzeExistingPaper() {
    setAnalyzing(true); setError(""); setMessage("");
    try {
      const result = await request(`/admin/papers/${editing}/analyze`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      setForm(f => ({ ...f, ...result.details, semesters: result.details.semesters.map(String) }));
      setMessage("Gemini re-analyzed the existing paper. Please review the details before saving.");
    } catch (err) { setError(err.message); } finally { setAnalyzing(false); }
  }
  async function savePaper(e) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (editing) {
        await request(`/admin/papers/${editing}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(form) });
        setMessage("Paper details updated."); setEditing(null);
      } else {
        if (!file) throw new Error("Please choose a PDF or image file.");
        const data = new FormData(); Object.entries(form).forEach(([k, v]) => data.append(k, v)); data.append("file", file);
        await request("/admin/papers", { method: "POST", headers: { Authorization: "Bearer " + token }, body: data });
        setMessage("Paper uploaded successfully to Cloudinary.");
      }
      setForm(emptyForm); setFile(null); await loadAdminPapers(); onChanged();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function deletePaper(paper) {
    if (!confirm(`Delete "${paper.title}" permanently? This also removes the file from Cloudinary.`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await request(`/admin/papers/${paper._id}`, { method: "DELETE", headers: { Authorization: "Bearer " + token } }); setMessage("Paper deleted."); await loadAdminPapers(); onChanged(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function editPaper(p) {
    setEditing(p._id);
    setForm({ title: p.title, semesters: (p.semesters || [p.semester]).map(String), subject: p.subject, subjectCode: p.subjectCode || "", examType: p.examType, academicYear: p.academicYear });
    setFile(null); setMessage("Editing metadata. The existing file will remain unchanged.");
    document.querySelector(".admin-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return <div className="modal-backdrop admin-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="admin-modal" role="dialog" aria-modal="true" aria-label="Admin panel">
      <header className="modal-head"><div className="admin-title"><span className="admin-icon"><ShieldCheck /></span><div><span className="eyebrow">RESTRICTED ACCESS</span><h2>Admin dashboard</h2><p>Upload and manage question papers</p></div></div><button className="icon-btn" onClick={onClose} aria-label="Close admin"><X /></button></header>
      {!token ? <form className="unlock-form" onSubmit={unlock}><div className="lock-art"><LockKeyhole size={27} /></div><h3>Admin unlock</h3><p className="muted">Students can browse papers without signing in. Only the admin password is required here.</p><label>Admin password<input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter admin password" required /></label><button className="button primary full" disabled={busy}>{busy ? "Checking…" : "Unlock admin panel"}</button></form> :
        <div className="admin-content">
          <div className="notice"><ShieldCheck size={17} /> Admin session active. Session expires after 4 hours or when this panel is closed.</div>
          <div className={`maintenance-control ${maintenanceMode ? "active" : ""}`}><div><b>{maintenanceMode ? "Maintenance mode is ON" : "Maintenance mode is OFF"}</b><span>{maintenanceMode ? "Visitors see the maintenance screen and public APIs are blocked." : "The website is currently available to visitors."}</span></div><button type="button" className={`button ${maintenanceMode ? "maintenance-off" : "maintenance-on"}`} onClick={toggleMaintenance} disabled={maintenanceBusy}><Power size={15} />{maintenanceBusy ? "Updating…" : maintenanceMode ? "Turn off" : "Turn on"}</button></div>
          <div className={`maintenance-control request-control ${requestEnabled ? "active" : ""}`}><div><b>{requestEnabled ? "Missing paper requests are ON" : "Missing paper requests are OFF"}</b><span>{requestEnabled ? "Students can request unavailable papers from the navbar ticker." : "The request button and ticker are hidden from students."}</span></div><button type="button" className={`button ${requestEnabled ? "maintenance-off" : "maintenance-on"}`} onClick={toggleRequests} disabled={requestBusy}><Megaphone size={15} />{requestBusy ? "Updating…" : requestEnabled ? "Turn off" : "Turn on"}</button></div>
          <div className="admin-requests"><div className="admin-list-head"><h3>Missing paper requests <span className="count">{requests.length}</span></h3><button className="button subtle" onClick={() => request("/admin/paper-requests", { headers: { Authorization: "Bearer " + token } }).then(data => setRequests(data.requests)).catch(err => setError(err.message))}><RefreshCw size={15} /> Refresh</button></div>{requests.length === 0 ? <p className="muted">No student requests yet.</p> : <div className="request-list">{requests.map(item => <div className="request-item" key={item._id}><div><b>{item.subject}</b><span>Semester {item.semester} · {item.examType} · {item.academicYear}</span>{item.note && <small>{item.note}</small>}</div><time>{new Date(item.createdAt).toLocaleDateString()}</time><button className="icon-btn danger-icon" title="Remove request" aria-label={`Remove request for ${item.subject}`} onClick={() => deleteRequest(item)} disabled={busy}><Trash2 size={15} /></button></div>)}</div>}</div>
          <form className="admin-form" onSubmit={savePaper}>
            <div className="form-heading"><div><h3>{editing ? "Edit paper details" : "Upload a paper"}</h3><p className="muted">PDFs and common image formats are supported.</p></div>{editing && <div className="form-heading-actions"><button type="button" className="button smart-button" onClick={analyzeExistingPaper} disabled={busy || analyzing}>{analyzing ? "Analyzing…" : "✨ AI re-analyze"}</button><button type="button" className="button subtle" onClick={() => { setEditing(null); setForm(emptyForm); setFile(null); setMessage(""); }}>Cancel edit</button></div>}</div>
            <div className="form-grid">
              <label className="span-2">Paper title<input name="title" value={form.title} onChange={setField} required maxLength="180" placeholder="e.g. Data Structures — MTE" /></label>
              <fieldset className="semester-picker"><legend>Semesters</legend><div className="semester-options">{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <label key={n}><input type="checkbox" checked={form.semesters.includes(String(n))} onChange={e => setForm(f => ({ ...f, semesters: e.target.checked ? [...f.semesters, String(n)] : f.semesters.filter(value => value !== String(n)) }))} />{n}</label>)}</div><small className="muted">Select all semesters where this paper applies.</small></fieldset>
              <label>Exam type<select name="examType" value={form.examType} onChange={setField}><option>MTE</option><option>ETE</option></select></label>
              <label>Subject<input name="subject" value={form.subject} onChange={setField} required placeholder="e.g. Database Management Systems" /></label>
              <label>Subject code <span className="muted">(optional)</span><input name="subjectCode" value={form.subjectCode} onChange={setField} placeholder="e.g. KCS-501" /></label>
              <label>Academic year<input name="academicYear" value={form.academicYear} onChange={setField} required pattern="\d{4}" maxLength="4" placeholder="2025" /></label>
              {!editing && <><label className="file-drop span-2"><UploadCloud size={24} /><b>{file ? file.name : "Choose a PDF or image"}</b><span className="muted">{file ? formatBytes(file.size) : "Maximum size set by server (default 20 MB)"}</span><input type="file" accept="application/pdf,image/*" onChange={e => { setFile(e.target.files?.[0] || null); setMessage(""); setError(""); }} required /></label><button type="button" className="button smart-button span-2" onClick={analyzePaper} disabled={busy || analyzing || !file}>{analyzing ? "Reading paper with Gemini…" : "✨ Auto-fill details with Gemini"}</button></>}
            </div>
            <button className="button primary full" disabled={busy}>{busy ? "Saving…" : editing ? "Save paper details" : "Upload paper"}</button>
          </form>
          <div className="admin-list-head"><h3>Uploaded papers <span className="count">{papers.length}</span></h3><button className="button subtle" onClick={loadAdminPapers}><RefreshCw size={15} /> Refresh</button></div>
          <div className="admin-paper-list">{papers.map(p => <div className="admin-paper" key={p._id}><span className="file-type">{p.fileType === "pdf" ? <FileText /> : <ImageIcon />}</span><div className="admin-paper-text"><b>{p.title}</b><span>{p.subject} · Sem {(p.semesters || [p.semester]).join(", ")} · {p.examType} · {p.academicYear}</span></div><button className="icon-btn" title="Edit details" onClick={() => editPaper(p)}><Pencil size={16} /></button><button className="icon-btn danger-icon" title="Delete paper" onClick={() => deletePaper(p)} disabled={busy}><Trash2 size={16} /></button></div>)}</div>
        </div>}
      {(message || error) && <div className={error ? "alert error" : "alert success"}>{error || message}</div>}
    </section>
  </div>;
}
export default function App() {
  const [papers, setPapers] = useState([]);
  const [meta, setMeta] = useState({ semesters: [], years: [], total: 0, totalDownloads: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [semester, setSemester] = useState("");
  const [examType, setExamType] = useState("");
  const [year, setYear] = useState("");
  const [fileType, setFileType] = useState("");
  const [preview, setPreview] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [missingRequestEnabled, setMissingRequestEnabled] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  async function loadMeta() {
    try { const m = await request("/papers/meta"); setMeta(m); } catch (err) { /* list request below shows API error */ }
  }
  async function loadPapers() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (semester) params.set("semester", semester);
      if (examType) params.set("examType", examType);
      if (year) params.set("academicYear", year);
      if (fileType) params.set("fileType", fileType);
      if (q.trim()) params.set("q", q.trim());
      const d = await request(`/papers?${params.toString()}`); setPapers(d.papers);
    } catch (err) { setError(`${err.message} Check that the backend is running and VITE_API_URL is configured.`); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadMeta(); }, []);
  useEffect(() => {
    request("/status").then(data => { setMaintenanceMode(data.maintenanceMode); setMissingRequestEnabled(data.missingRequestEnabled); }).catch(() => {});
  }, []);
  useEffect(() => { const id = setTimeout(loadPapers, 250); return () => clearTimeout(id); }, [q, semester, examType, year, fileType]);
  const resetFilters = () => { setQ(""); setSemester(""); setExamType(""); setYear(""); setFileType(""); };
  const groupedCount = useMemo(() => papers.length, [papers]);
  return <div className="app-shell">
    <div className="top-strip"><div className="container top-strip-inner"><span><span className="status-dot"></span> Student access is open — no account required</span><span>Built for B.Tech CSE students</span></div></div>
    <header className="site-header"><div className="container nav-inner"><a className="brand" href="#"><span className="brand-mark"><GraduationCap size={25} /></span><span><b>Paper<span>Hub</span></b><small>B.TECH CSE LIBRARY</small></span></a><nav><a href="#library">Question papers</a><a href="#how">How it works</a><button className="button admin-button maintenance-admin-trigger" onClick={() => setAdminOpen(true)}><ShieldCheck size={16} /> Admin</button></nav></div>{missingRequestEnabled && <div className="request-ticker"><div className="request-ticker-track"><span><Megaphone size={14} /> Can't find a paper? <button onClick={() => setRequestOpen(true)}>Request it from admin</button></span><span><Megaphone size={14} /> Missing paper request is open <button onClick={() => setRequestOpen(true)}>Send your request</button></span></div></div>}</header>
    <main>
      <section className="hero"><div className="hero-grid"></div><div className="container hero-content"><div className="hero-copy"><div className="eyebrow hero-eyebrow"><span></span> YOUR SEMESTER. YOUR RESOURCES.</div><h1>Past papers.<br /><em>Better preparation.</em></h1><p>Find, preview, and practice with B.Tech CSE MTE and ETE question papers — organized by semester, subject, and academic year.</p><div className="hero-actions"><a className="button white-button" href="#library">Explore papers <span>↓</span></a><span className="hero-note"><ShieldCheck size={16} /> Free access · No login</span></div></div><div className="hero-card"><div className="hero-card-top"><span className="mini-label">PAPER LIBRARY</span><BookOpen size={20} /></div><div className="hero-stat-row"><div className="hero-stat">{meta.total ?? 0}<span> papers available</span></div><div className="download-stat"><Download size={17} /><b>{formatCount(meta.totalDownloads ?? 0)}</b><span>total downloads</span></div></div><div className="semester-mini-grid">{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <div key={n}><span>SEM</span><b>{String(n).padStart(2, "0")}</b></div>)}</div><div className="hero-card-foot"><span className="green-pulse"></span> PDFs &amp; images · In-browser preview</div></div></div><div className="container hero-bottom"><span>01 / BROWSE</span><span>02 / PREVIEW</span><span>03 / PREPARE</span></div></section>
      <section className="container library-section" id="library">
        <div className="section-intro"><div><div className="eyebrow dark-eyebrow">THE QUESTION BANK</div><h2>Find your next <em>practice paper.</em></h2><p>Everything organized to help you spend less time searching and more time preparing.</p></div><div className="library-count"><b>{loading ? "…" : groupedCount}</b><span>matching papers</span></div></div>
        <div className="filter-panel"><div className="search-box"><Search size={19} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search subject, title, or subject code…" aria-label="Search papers" /></div><div className="filters"><label><span>Semester</span><select value={semester} onChange={e => setSemester(e.target.value)}><option value="">All semesters</option>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>Semester {n}</option>)}</select></label><label><span>Exam type</span><select value={examType} onChange={e => setExamType(e.target.value)}><option value="">MTE + ETE</option><option value="MTE">MTE</option><option value="ETE">ETE</option></select></label><label><span>Academic year</span><select value={year} onChange={e => setYear(e.target.value)}><option value="">All years</option>{meta.years.map(y => <option key={y}>{y}</option>)}</select></label><label><span>File type</span><select value={fileType} onChange={e => setFileType(e.target.value)}><option value="">PDF + Images</option><option value="pdf">PDF only</option><option value="image">Images only</option></select></label><button className="clear-filters" onClick={resetFilters}><Filter size={15} /> Reset</button></div></div>
        {error && <div className="error-banner"><b>Could not load papers.</b><span>{error}</span><button className="button outline" onClick={() => { loadMeta(); loadPapers(); }}>Try again</button></div>}
        {loading ? <div className="empty-state"><div className="spinner"></div><h3>Loading paper library…</h3><p>Connecting to the paper collection.</p></div> :
          papers.length === 0 ? <div className="empty-state"><div className="empty-icon"><BookOpen size={28} /></div><h3>No papers found yet</h3><p>{error ? "Fix the API configuration and retry." : "Try changing your filters, or check back after the admin uploads papers."}</p>{!error && <button className="button outline" onClick={resetFilters}>Clear filters</button>}</div> :
            <div className="paper-grid">{papers.map(p => <article className="paper-card" key={p._id}><div className="paper-card-art"><div className={`file-illustration ${p.fileType}`}><span className="file-corner"></span>{p.fileType === "pdf" ? <FileText size={35} /> : <ImageIcon size={35} />}<b>{p.fileType === "pdf" ? "PDF" : "IMAGE"}</b></div><div className="art-meta"><span className={`exam-tag ${p.examType.toLowerCase()}`}>{p.examType}</span><span>SEM {(p.semesters || [p.semester]).join(", ")}</span></div></div><div className="paper-card-body"><div className="year-row"><span>{p.academicYear}</span><span>{formatBytes(p.bytes)}</span></div><h3>{p.title}</h3><p className="subject-line">{p.subject}{p.subjectCode ? ` · ${p.subjectCode}` : ""}</p><div className="paper-card-actions"><button className="button primary" onClick={() => setPreview(p)}><Eye size={16} /> Preview</button><a className="button outline" href={`${API}/papers/${p._id}/download`}><Download size={16} /> Download</a></div><span className="download-count"><Download size={12} /> {p.downloadCount ?? 0} downloads</span></div></article>)}</div>}
      </section>
      <section className="how-section" id="how"><div className="container"><div className="eyebrow dark-eyebrow">SIMPLE BY DESIGN</div><h2>From search to <em>study mode.</em></h2><div className="steps"><div className="step"><span>01</span><Search /><h3>Find a paper</h3><p>Filter by semester, subject, MTE/ETE, and year to narrow your search.</p></div><div className="step"><span>02</span><Eye /><h3>Preview instantly</h3><p>Read PDFs and images in the website without downloading first.</p></div><div className="step"><span>03</span><Download /><h3>Practice your way</h3><p>Open or download a paper when you want an offline copy.</p></div></div></div></section>
    </main>
    <footer className="site-footer"><div className="container footer-inner"><a className="brand footer-brand" href="#"><span className="brand-mark"><GraduationCap size={22} /></span><span><b>Paper<span>Hub</span></b><small>B.TECH CSE LIBRARY</small></span></a><p>Built for students. Focused on preparation.</p><span>© {new Date().getFullYear()} PaperHub</span></div></footer>
    {preview && <PreviewModal paper={preview} onClose={() => setPreview(null)} />}
    {maintenanceMode && <div className="maintenance-overlay" role="alert"><div className="maintenance-message"><Power size={30} /><span className="eyebrow">TEMPORARILY UNAVAILABLE</span><h1>Website under maintenance</h1><p>We are making a few improvements. Please check back shortly.</p><button className="button maintenance-access" onClick={() => setAdminOpen(true)}><ShieldCheck size={15} /> Admin access</button></div></div>}
    {requestOpen && <MissingRequestModal onClose={() => setRequestOpen(false)} />}
    {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} onChanged={() => { loadMeta(); loadPapers(); }} onMaintenanceChanged={setMaintenanceMode} onRequestSettingChanged={setMissingRequestEnabled} />}
  </div>;
}
