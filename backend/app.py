"""AI Document Q&A — FastAPI backend with a RAG pipeline.

Flow: chunk the document -> embed chunks -> embed the question ->
retrieve top-k chunks by cosine similarity -> ask the LLM to answer
using ONLY those chunks, with citations and a confidence level.
"""
import os
import json

import numpy as np
import google.generativeai as genai
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

genai.configure(api_key=os.environ["GEMINI_API_KEY"])

EMBED_MODEL = "models/text-embedding-004"
GEN_MODEL = "gemini-2.5-flash-lite"
TOP_K = 3

app = FastAPI(title="AI Document Q&A")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    document: str
    question: str


def chunk_document(text: str, target_words: int = 80) -> list[str]:
    """Split a document into chunks of roughly target_words, on paragraph
    boundaries where possible."""
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    chunks, current, count = [], [], 0
    for para in paragraphs:
        words = para.split()
        if count + len(words) > target_words and current:
            chunks.append(" ".join(current))
            current, count = [], 0
        current.append(para)
        count += len(words)
    if current:
        chunks.append(" ".join(current))
    return chunks or [text]


def embed(texts: list[str]) -> np.ndarray:
    """Embed a list of texts into vectors."""
    result = genai.embed_content(model=EMBED_MODEL, content=texts)
    return np.array(result["embedding"])


def cosine_sim(query_vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Cosine similarity between one vector and each row of a matrix."""
    q = query_vec / (np.linalg.norm(query_vec) + 1e-9)
    m = matrix / (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-9)
    return m @ q


def retrieve(question: str, chunks: list[str]) -> list[dict]:
    """Return the top-k most relevant chunks with their similarity scores."""
    chunk_vecs = embed(chunks)
    q_vec = embed([question])[0]
    sims = cosine_sim(q_vec, chunk_vecs)
    top_idx = np.argsort(sims)[::-1][:TOP_K]
    return [{"text": chunks[i], "score": float(sims[i])} for i in top_idx]


def answer(question: str, top_chunks: list[dict]) -> dict:
    """Ask the LLM to answer using only the retrieved chunks."""
    context = "\n\n".join(
        f"[Source {i+1}]: {c['text']}" for i, c in enumerate(top_chunks)
    )
    prompt = f"""You are a careful document assistant. Answer the question using ONLY the sources below. \
If the answer is not in the sources, say "The document does not contain this information." \
Respond ONLY with valid JSON, no markdown.

Sources:
{context}

Question: {question}

Return JSON with this exact shape:
{{
  "answer": "your answer, grounded only in the sources",
  "cited_sources": [list of source numbers you used, e.g. [1, 2]],
  "confidence": "High" | "Medium" | "Low"
}}"""

    model = genai.GenerativeModel(GEN_MODEL)
    resp = model.generate_content(
        prompt,
        generation_config={"temperature": 0.2, "response_mime_type": "application/json"},
    )
    try:
        parsed = json.loads(resp.text)
    except (json.JSONDecodeError, ValueError):
        return {
            "answer": "Could not parse a reliable answer. Please review manually.",
            "cited_sources": [],
            "confidence": "Low",
        }
    return parsed


@app.post("/ask")
def ask(req: AskRequest):
    chunks = chunk_document(req.document)
    top_chunks = retrieve(req.question, chunks)
    result = answer(req.question, top_chunks)

    # Attach the actual source text for the cited sources so the UI can show them.
    cited = result.get("cited_sources", [])
    sources = []
    for i, c in enumerate(top_chunks, start=1):
        sources.append({
            "number": i,
            "text": c["text"],
            "score": round(c["score"], 3),
            "cited": i in cited,
        })

    return {
        "answer": result.get("answer", ""),
        "confidence": result.get("confidence", "Low"),
        "sources": sources,
    }