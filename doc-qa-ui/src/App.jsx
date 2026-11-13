import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const initial = { answer: '', needs_review: false, sources: [] };
const T = {
  page: { minHeight: '100vh', background: 'radial-gradient(ellipse at top left, #e9ded2 0%, #f4eee8 42%, #f2ece5 100%)', color: '#30231c', fontFamily: 'Inter, system-ui, sans-serif', padding: '36px 18px 80px' },
  wrap: { maxWidth: 1080, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 22 },
  title: { fontSize: 'clamp(26px, 3vw, 36px)', letterSpacing: '-.035em', margin: '0 0 8px', fontWeight: 720 },
  muted: { color: '#716257', fontSize: 14, lineHeight: 1.6 },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(270px, 365px) minmax(0, 1fr)', gap: 18, alignItems: 'start' },
  card: { borderRadius: 14, background: '#fffdfa', padding: 24, boxShadow: '0 8px 26px #49311d12', border: '1px solid #e2d5c9', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: 650, margin: '16px 0 7px', display: 'block' },
  field: { width: '100%', padding: '11px 12px', fontSize: 14, border: '1px solid #d8c8b9', borderRadius: 8, color: '#30231c', background: '#fffefa', boxSizing: 'border-box' },
  btn: { border: 'none', borderRadius: 8, padding: '11px 16px', background: '#5f3d2c', color: '#fffaf6', fontWeight: 650, cursor: 'pointer' },
  outline: { border: '1px solid #d8c8b9', borderRadius: 8, padding: '8px 10px', background: '#fffdfa', color: '#553b2b', cursor: 'pointer' },
  pill: { fontSize: 11, background: '#eee1d4', borderRadius: 12, color: '#5d3c2b', padding: '4px 8px', fontWeight: 700 },
  divider: { borderTop: '1px solid #ebe1d8', paddingTop: 13, marginTop: 16 },
};

export default function App() {
  const [docs, setDocs] = useState([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('policy');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [selected, setSelected] = useState([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function request(path, options) {
    const res = await fetch(`${API}${path}`, options);
    const data = await res.json();
    if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${res.status})`);
    return data;
  }
  async function loadDocs() {
    try {
      const data = await request('/documents');
      setDocs(data.documents);
      setSelected(prev => prev.filter(id => data.documents.some(d => d.id === id)));
    } catch (e) {
      setMessage(e instanceof TypeError
        ? "We couldn't connect to your document library. Please try again in a moment."
        : `We couldn't load your documents: ${e.message}`);
    }
  }
  useEffect(() => { loadDocs(); }, []);

  async function upload(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      let result;
      if (file) {
        const fd = new FormData(); fd.append('file', file); fd.append('kind', kind);
        result = await request('/documents/upload', { method: 'POST', body: fd });
      } else {
        result = await request('/documents/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, kind, text }) });
      }
      const documentName = file?.name || title;
      setMessage(result.duplicate ? 'This document is already in your library.' : `Added "${documentName}" to your library. You can ask questions about it now.`);
      setFile(null); setText(''); setTitle('');
      const picker = document.getElementById('docfile'); if (picker) picker.value = '';
      await loadDocs();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  async function removeDoc(id, documentName) {
    if (!window.confirm(`Remove "${documentName}" from your library? This can't be undone.`)) return;
    setBusy(true); setMessage('');
    try { await request(`/documents/${id}`, { method: 'DELETE' }); await loadDocs(); setMessage('Document removed.'); }
    catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  async function ask(e) {
    e.preventDefault(); setBusy(true); setAnswer(null); setMessage('');
    try {
      setAnswer(await request('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, document_ids: selected.length ? selected : null }) }));
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  function toggle(id) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }

  return (
    <main style={T.page}><div style={T.wrap}>
      <header style={T.header}>
        <div>
          <h1 style={T.title}>Find answers in your documents.</h1>
          <p style={{ ...T.muted, margin: 0 }}>Add a contract or policy, then ask a question in plain language.</p>
        </div>
      </header>
      {message && <div role="alert" style={{ ...T.card, padding: '12px 16px', background: '#f1e5d9', color: '#573b2a' }}>{message}</div>}
      <div className="docqa-grid" style={T.grid}>
        <aside>
          <section style={T.card}>
            <h2 style={{ fontSize: 19, margin: '0 0 6px' }}>Add a document</h2>
            <p style={T.muted}>Upload a PDF or text file, or paste text below.</p>
            <form onSubmit={upload}>
              <label style={T.label}>Document type</label>
              <select style={T.field} value={kind} onChange={e => setKind(e.target.value)}>
                <option value="policy">Company policy</option><option value="contract">Vendor contract</option><option value="other">Other document</option>
              </select>
              <label style={T.label} htmlFor="docfile">Choose a PDF or text file</label>
              <input id="docfile" aria-label="Upload a PDF or text document" style={{ ...T.field, padding: 9 }} type="file" accept=".pdf,.txt"
                     onChange={e => setFile(e.target.files?.[0] || null)} />
              <label style={T.label} htmlFor="document-title">Document name</label>
              <input id="document-title" style={{ ...T.field, marginBottom: 8 }} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Travel policy" disabled={!!file} />
              <label style={T.label} htmlFor="document-text">Document text</label>
              <textarea style={{ ...T.field, height: 100, resize: 'vertical' }} value={text} onChange={e => setText(e.target.value)}
                        id="document-text" placeholder="Paste the policy or contract text here" disabled={!!file} />
              <button className="primary-action" style={{ ...T.btn, marginTop: 12, width: '100%', opacity: busy ? .6 : 1 }} disabled={busy || (!file && (!title.trim() || !text.trim()))}>
                {busy ? 'Adding document…' : 'Add to library'}
              </button>
            </form>
          </section>
          <section style={T.card}>
            <h2 style={{ fontSize: 19, margin: '0 0 6px' }}>Saved documents</h2>
            <p style={T.muted}>Select documents to search only those. Leave all unselected to search your full library.</p>
            {docs.length === 0 && <p style={T.muted}>No documents yet. Add one above to get started.</p>}
            {docs.map(d => <div key={d.id} style={{ ...T.divider, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input aria-label={`Select ${d.title}`} type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ overflowWrap: 'anywhere', fontWeight: 650, fontSize: 13 }}>{d.title}</div>
                <div style={{ ...T.muted, fontSize: 11, textTransform: 'capitalize' }}>{d.kind}</div></div>
              <button type="button" aria-label={`Remove ${d.title}`} style={{ ...T.outline, padding: '5px 8px' }} onClick={() => removeDoc(d.id, d.title)} disabled={busy}>Remove</button>
            </div>)}
          </section>
        </aside>
        <section>
          <div style={T.card}>
            <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>Ask a question</h2>
            <p style={T.muted}>Ask about your selected documents. If none are selected, we’ll search your full library.</p>
            <form onSubmit={ask}>
              <textarea value={question} onChange={e => setQuestion(e.target.value)}
                        aria-label="Your question"
                        placeholder="e.g. When can this agreement be terminated?"
                        style={{ ...T.field, minHeight: 110, marginTop: 14, resize: 'vertical' }} />
              <button className="primary-action" style={{ ...T.btn, marginTop: 12, opacity: busy ? .6 : 1 }} disabled={busy || !docs.length || !question.trim()}>
                {busy ? 'Looking through your documents…' : 'Ask'}
              </button>
            </form>
          </div>
          {answer && <div style={T.card}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Answer</h2>
              {answer.needs_review && <span style={{ ...T.pill, background: '#f1e5d0', color: '#63451f' }}>Please double-check</span>}
            </div>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 15 }}>{answer.answer}</p>
            <h3 style={{ fontSize: 14, marginTop: 24 }}>Sources</h3>
            {(answer.sources || []).map(s => <article key={s.id} style={{ ...T.divider }}>
              <div style={{ fontSize: 13, fontWeight: 750 }}>{s.title}{s.page ? ` · page ${s.page}` : ''}</div>
              <p style={{ ...T.muted, whiteSpace: 'pre-wrap', margin: '7px 0' }}>{s.excerpt}</p>
            </article>)}
            {answer.sources?.length === 0 && <p style={T.muted}>I couldn’t find a supporting passage in your documents.</p>}
          </div>}
          <div style={{ ...T.card, background: '#f0e7dc' }}>
            <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>A quick note</h2>
            <p style={{ ...T.muted, marginBottom: 0 }}>Answers are AI-generated and may be wrong. Check the source passages before relying on them. Your documents are sent to an AI service, so only upload files you’re allowed to share.</p>
          </div>
        </section>
      </div>
    </div></main>
  );
}
