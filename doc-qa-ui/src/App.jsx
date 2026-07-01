import { useState } from "react";

const API = "http://localhost:8001";

const CONF_COLORS = { High: "#2e7d32", Medium: "#f0a020", Low: "#e8452b" };

export default function App() {
  const [doc, setDoc] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!doc.trim() || !question.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: doc, question }),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ answer: "Error: " + e, confidence: "Low", sources: [] });
    }
    setLoading(false);
  }

  const lowConf = result && result.confidence === "Low";

  return (
    <div style={s.page}>
      <header style={s.header}>
        <h1 style={s.h1}>AI Document Assistant</h1>
        <p style={s.sub}>
          Ask questions about a document - grounded answers with sources and confidence
        </p>
      </header>

      <div style={s.card}>
        <p style={s.label}>Document</p>
        <textarea
          placeholder="Paste a contract, policy, report, or any document here..."
          value={doc}
          onChange={(e) => setDoc(e.target.value)}
          style={{ ...s.input, height: 160 }}
        />
        <p style={s.label}>Question</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="What would you like to know?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            style={{ ...s.input, marginBottom: 0 }}
          />
          <button onClick={ask} disabled={loading} style={s.primaryBtn}>
            {loading ? "Thinking..." : "Ask"}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ ...s.card, marginTop: 16 }}>
          <div style={s.answerHead}>
            <h2 style={s.h2}>Answer</h2>
            <span
              style={{
                ...s.confPill,
                background: CONF_COLORS[result.confidence] || "#666",
              }}
            >
              {result.confidence} confidence
            </span>
          </div>
          <p style={s.answer}>{result.answer}</p>

          {lowConf && (
            <div style={s.escalate}>
              ⚠️ Low confidence — recommend human review before acting on this answer.
            </div>
          )}

          {result.sources && result.sources.length > 0 && (
            <>
              <p style={s.label}>Sources (retrieved from your document)</p>
              {result.sources.map((src) => (
                <div
                  key={src.number}
                  style={{
                    ...s.source,
                    borderLeft: `3px solid ${src.cited ? "#2e7d32" : "#ddd"}`,
                    opacity: src.cited ? 1 : 0.6,
                  }}
                >
                  <div style={s.sourceHead}>
                    Source {src.number} {src.cited && "· cited in answer"}
                    <span style={s.score}>similarity {src.score}</span>
                  </div>
                  <div style={s.sourceText}>{src.text}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  page: { maxWidth: 820, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#1a1a1a", background: "#f7f7f8", minHeight: "100vh" },
  header: { marginBottom: 20 },
  h1: { margin: 0, fontSize: 26, color: "#1a1a1a" },
  sub: { margin: "4px 0 0", color: "#555", fontSize: 14 },
  card: { border: "1px solid #e2e2e2", borderRadius: 10, padding: 18, background: "#fff" },
  label: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "#888", margin: "0 0 6px" },
  input: { width: "100%", padding: 10, marginBottom: 14, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box", fontSize: 14, background: "#fff", color: "#1a1a1a", fontFamily: "inherit" },
  primaryBtn: { padding: "10px 20px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" },
  answerHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  h2: { fontSize: 16, margin: 0, color: "#1a1a1a" },
  confPill: { color: "#fff", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  answer: { fontSize: 15, lineHeight: 1.5, color: "#1a1a1a" },
  escalate: { margin: "12px 0", padding: 10, background: "#fff4e5", border: "1px solid #f0a020", borderRadius: 6, fontSize: 13 },
  source: { padding: "8px 12px", marginBottom: 8, background: "#fafafa", borderRadius: 4 },
  sourceHead: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#2e7d32", marginBottom: 4, display: "flex", justifyContent: "space-between" },
  score: { color: "#999", fontWeight: 400 },
  sourceText: { fontSize: 13, lineHeight: 1.4, color: "#333" },
};
