
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from rag import RAGService

BASE = Path(__file__).resolve().parent.parent
load_dotenv(BASE / ".env")
DATA_DIR = Path(
    os.getenv("RAG_DATA_DIR", str(BASE / ".local_data"))
)
if os.getenv('GEMINI_API_KEY') and not os.getenv('GOOGLE_API_KEY'):
    os.environ['GOOGLE_API_KEY'] = os.environ['GEMINI_API_KEY']
app = FastAPI(title='Contract & Policy Intelligence API', version='2.0')
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(','),
                   allow_credentials=False, allow_methods=['GET', 'POST', 'DELETE'], allow_headers=['Content-Type'])
service = RAGService(DATA_DIR)


class TextDocument(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    kind: str = 'policy'
    text: str = Field(min_length=1, max_length=650_000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    document_ids: list[str] | None = None


def fail(exc):
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise exc


@app.get('/health')
def health():
    return {'status': 'ok', 'indexed_active_documents': len(service.catalog.list_documents()),
            'model_configured': bool(os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY'))}


@app.get('/documents')
def documents(all_versions: bool = False):
    return {'documents': service.catalog.list_documents(active_only=not all_versions)}


@app.post('/documents/text')
def add_text(request: TextDocument):
    try:
        return service.ingest(request.title, request.kind, [request.text])
    except Exception as exc:
        fail(exc)


@app.post('/documents/upload')
async def upload_document(file: UploadFile = File(...), kind: str = Form('policy')):
    name = Path(file.filename or 'uploaded.txt').name
    ext = Path(name).suffix.lower()
    if ext not in ('.pdf', '.txt'):
        raise HTTPException(400, 'Only .pdf and .txt uploads are supported')
    raw = await file.read(8_000_001)
    if len(raw) > 8_000_000:
        raise HTTPException(413, 'File must be 8 MB or less')
    try:
        if ext == '.pdf':
            import io
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw))
            if len(reader.pages) > 60:
                raise HTTPException(413, 'Maximum 60 PDF pages')
            pages = [(page.extract_text() or '') for page in reader.pages]
        else:
            pages = [raw.decode('utf-8-sig')]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, 'Could not extract text; scanned PDFs need OCR and are not supported') from exc
    try:
        return service.ingest(name, kind, pages)
    except Exception as exc:
        fail(exc)


@app.delete('/documents/{document_id}')
def remove_document(document_id: str):
    try:
        if not service.remove(document_id):
            raise HTTPException(404, 'Document not found')
        return {'deleted': document_id}
    except HTTPException:
        raise
    except Exception as exc:
        fail(exc)


@app.post('/ask')
def ask(request: AskRequest):
    try:
        return service.ask(request.question, request.document_ids)
    except Exception as exc:
        fail(exc)
