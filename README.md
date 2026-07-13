# AI Document Assistant

A full-stack RAG application that answers questions about a document using only that document with source citations, a confidence level, and a human-review escalation path for low-confidence answers.

## What it does

- Paste in any document (contract, policy, report)
- Ask a question in plain language
- The app retrieves the most relevant passages, answers using only those passages, and shows:
  - the answer, grounded in the document
  - the source snippets it used (so the answer is verifiable)
  - a confidence level, with an escalation prompt when confidence is low

## Screenshots

Answer with grounded sources and confidence for a sample NDA Contract:

![Answer with sources](Screenshots/Answer_sources%20.png)

Source citations: showing which passages the answer used


## How it works (RAG pipeline)

1. **Chunk** the document into passages
2. **Embed** the passages and the question (Gemini text-embedding-004)
3. **Retrieve** the top passages by cosine similarity
4. **Answer** using only the retrieved passages, with citations and a confidence estimate

## Stack

- Frontend: React (Vite)
- Backend: FastAPI, NumPy for similarity search
- Model: Google Gemini (generation + embeddings)

## Why it's designed this way

- **Citations for trust.** Every answer shows the exact source passages, because in a real setting people can't act on an answer they can't verify.
- **Grounded, not open-ended.** The model answers only from the document and says so when the answer isn't there — reducing hallucination.
- **Confidence routes to humans.** Low-confidence answers surface a review prompt instead of being presented as certain.

## Running locally

**Backend** (from the project root):

```bash
cd backend
pip install -r ../requirements.txt
uvicorn app:app --reload --port 8001
```

**Frontend:**

```bash
cd doc-qa-ui
npm install
npm run dev
```

Requires a `GEMINI_API_KEY` environment variable set where the backend runs.