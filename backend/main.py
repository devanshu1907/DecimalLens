import os
import re
import json
import time
import uuid
import asyncio
import logging
from collections import defaultdict
from typing import Annotated
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s – %(message)s",
)

# Setup UPLOAD_DIR
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Load local environment variables from root .env.local
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    load_dotenv()

from backend.parser import parse_document
from backend.evaluator import verify_claim
from backend.agents import (
    get_groq_client,
    DEFAULT_MODEL,
    AUDITOR_SYSTEM_PROMPT,
    FORECASTER_SYSTEM_PROMPT,
    MOCK_AUDITOR_OUTPUT,
    MOCK_FORECASTER_OUTPUT,
    simulate_streaming_text
)

app = FastAPI(title="DecimalLens API", version="1.0.0")

# ---------------------------------------------------------------------------
# Rate limiter – simple in-memory sliding-window (no external deps required).
# Throttles the expensive LLM endpoints to 20 calls per IP per 60 seconds.
# ---------------------------------------------------------------------------
class _RateLimiter:
    def __init__(self, max_calls: int, window_seconds: int):
        self.max_calls = max_calls
        self.window = window_seconds
        self._log: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, client_id: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window
        calls = [t for t in self._log[client_id] if t > cutoff]
        if len(calls) >= self.max_calls:
            self._log[client_id] = calls
            return False
        calls.append(now)
        self._log[client_id] = calls
        return True

_rate_limiter = _RateLimiter(max_calls=20, window_seconds=60)
_THROTTLED_PATHS = {"/api/analyze", "/api/upload", "/api/forecast"}

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path in _THROTTLED_PATHS:
        client_ip = request.client.host if request.client else "unknown"
        if not _rate_limiter.is_allowed(client_ip):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait before trying again."},
                headers={"Retry-After": "60"},
            )
    return await call_next(request)

# Setup CORS middleware
# Origins are read from the ALLOWED_ORIGINS env var (comma-separated).
# Defaults to localhost:3000 for local development.
_allowed_origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    text: str
    low_confidence: bool = False


class ClaimItem(BaseModel):
    """
    Typed schema for a single financial claim.
    Field-length limits prevent unbounded LLM-generated strings from
    being stored, embedded in prompts, or passed to the evaluator.
    """
    id:         str   = Field(default="",  max_length=64)
    metric:     str   = Field(default="",  max_length=256)
    reported:   str   = Field(default="",  max_length=128)
    expression: str   = Field(default="",  max_length=512)
    formula:    str   = Field(default="",  max_length=512)
    page:       int   = Field(default=1,   ge=1, le=9999)
    context:    str   = Field(default="",  max_length=2048)
    value:      float = Field(default=0.0)
    # Verification fields – populated by the backend, not required on input
    verified:      bool | None = None
    recalculated:  str  | None = None
    reason:        str  | None = None


class VerifyClaimRequest(BaseModel):
    """
    Single-claim math verification request.
    Max lengths mirror the evaluator’s internal guards.
    """
    reported:   str = Field(max_length=128)
    expression: str = Field(max_length=512)


class ForecastRequest(BaseModel):
    """
    Forecast request.  Claims are capped at 50 to prevent prompt-size
    DoS via an enormous claims array.
    """
    claims: Annotated[list[ClaimItem], Field(max_length=50)]
    low_confidence_baseline: bool = False


# ---------------------------------------------------------------------------
# LLM output sanitization
# ---------------------------------------------------------------------------

# Arithmetic expression whitelist – identical to evaluator’s inner whitelist.
# Any expression that the Auditor LLM produces which doesn’t match this is
# zeroed out before being passed to verify_claim(), preventing prompt-injection
# payloads from reaching ast.parse().
_SAFE_EXPR_RE = re.compile(r'^[\d\s\+\-\*\/\.\(\)]{1,512}$')

# Maximum document text forwarded to the Auditor LLM.  Truncating here
# prevents token-exhaustion DoS and keeps context within the model’s
# effective reasoning window.
MAX_TEXT_FOR_LLM = 50_000  # chars ~ 12,500 tokens


def _sanitize_llm_claims(claims: list) -> list:
    """
    Sanitize a list of claim dicts returned by the Auditor LLM before
    any of their fields are evaluated or re-embedded into prompts.

    - expression: must match the arithmetic-only whitelist; zeroed if not.
    - context:    truncated to 500 chars to limit Forecaster prompt size.
    - reported:   truncated to 128 chars.
    """
    sanitized = []
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        expr = str(claim.get("expression", ""))
        if not _SAFE_EXPR_RE.match(expr):
            expr = ""  # treat as unverifiable; verify_claim will flag it
        sanitized.append({
            **claim,
            "expression": expr,
            "context":  str(claim.get("context",  ""))[:500],
            "reported": str(claim.get("reported", ""))[:128],
        })
    return sanitized

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "groq_api_key_configured": bool(os.environ.get("GROQ_API_KEY") and os.environ.get("GROQ_API_KEY") != "your-groq-api-key-here"),
        "message": "DecimalLens Python FastAPI Backend is active"
    }

ALLOWED_EXTENSIONS = {"pdf", "csv", "md", "markdown", "txt"}

@app.get("/api/document/{filename}")
async def get_document(filename: str):
    """
    Serves a raw document (e.g. PDF, CSV) from the uploads directory.
    Path traversal is prevented by resolving the real path and asserting it
    remains strictly inside UPLOAD_DIR.
    """
    safe_filename = os.path.basename(filename)
    file_path = os.path.realpath(os.path.join(UPLOAD_DIR, safe_filename))
    upload_dir_real = os.path.realpath(UPLOAD_DIR)

    # Block path traversal attempts
    if not file_path.startswith(upload_dir_real + os.sep):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Document not found")

    ext = safe_filename.rsplit('.', 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=403, detail="File type not permitted")

    media_types = {
        'pdf': 'application/pdf',
        'csv': 'text/csv',
        'md': 'text/markdown',
        'markdown': 'text/markdown',
    }
    media_type = media_types.get(ext, 'text/plain')
    return FileResponse(file_path, media_type=media_type)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

# PDF magic bytes: all valid PDFs begin with "%PDF"
_PDF_MAGIC = b"%PDF"

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Ingests, saves, and parses a single financial document (PDF, CSV, MD).

    Security measures applied here:
    - Extension whitelist (unchanged).
    - 25 MB size cap (unchanged).
    - PDF magic-byte check: rejects files that claim to be PDFs but are not.
    - UUID-prefixed storage name prevents same-filename collisions between
      concurrent or sequential users (without it, user B’s upload silently
      overwrites user A’s file and the document endpoint may serve the wrong PDF).
    """
    try:
        safe_filename = os.path.basename(file.filename or "upload")
        ext = safe_filename.rsplit('.', 1)[-1].lower() if '.' in safe_filename else ""

        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

        # Read with size guard — avoid loading multi-GB files into memory
        contents = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File too large. Maximum allowed size is 25 MB.")

        # Magic-byte validation for PDFs – extension spoofing guard
        if ext == "pdf" and not contents.startswith(_PDF_MAGIC):
            raise HTTPException(status_code=400, detail="File does not appear to be a valid PDF.")

        # UUID-prefix the stored filename to prevent collision when multiple
        # users upload files with the same name.
        stored_filename = f"{uuid.uuid4().hex}_{safe_filename}"
        file_path = os.path.join(UPLOAD_DIR, stored_filename)
        with open(file_path, "wb") as f:
            f.write(contents)

        parsed_result = parse_document(safe_filename, contents)
        return {
            "filename": safe_filename,          # display name (original)
            "stored_filename": stored_filename,  # server-side name for /api/document/
            "format": parsed_result["format"],
            "text": parsed_result["text"],
            "low_confidence": parsed_result["low_confidence"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Document upload failed for file %r", locals().get("safe_filename", "unknown"))
        raise HTTPException(status_code=500, detail="Failed to process document. Please try again.")

async def generate_analysis_stream(text: str, low_confidence: bool):
    client = get_groq_client()
    
    if client is None:
        # Fallback Mock Mode: Simulates LLM streaming when no valid key is configured
        print("GROQ_API_KEY not configured or placeholder detected. Running in offline mock mode.")
        
        # 1. Send parser result
        yield f"event: parser\ndata: {json.dumps({'low_confidence': low_confidence})}\n\n"
        await asyncio.sleep(0.5)
        
        # 2. Yield Auditor chunks
        auditor_full_response = ""
        mock_auditor = MOCK_AUDITOR_OUTPUT.copy()
        
        yield f"event: status\ndata: {json.dumps({'status': 'Auditing document (Mock Mode)...'})}\n\n"
        
        async for chunk in simulate_streaming_text(mock_auditor):
            yield f"event: auditor_chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"
            auditor_full_response += chunk
            
        yield f"event: auditor_done\ndata: {json.dumps({'full_response': auditor_full_response})}\n\n"
        await asyncio.sleep(0.5)
        
        # 3. Perform verification in backend
        try:
            claims_data = json.loads(auditor_full_response)
        except Exception:
            claims_data = mock_auditor
            
        claims = claims_data.get("claims", [])
        verified_claims = []
        for claim in claims:
            expr = claim.get("expression", "")
            reported = claim.get("reported", "")
            ver_res = verify_claim(reported, expr)
            
            verified_claim = {
                **claim,
                "verified": ver_res["verified"],
                "recalculated": ver_res["recalculated"],
                "reason": ver_res["reason"]
            }
            verified_claims.append(verified_claim)
            
        yield f"event: verified_claims\ndata: {json.dumps({'claims': verified_claims})}\n\n"
        await asyncio.sleep(0.5)
        
        # 4. Yield Forecaster chunks
        forecaster_full_response = ""
        mock_forecaster = MOCK_FORECASTER_OUTPUT.copy()
        
        # Adjust confidence level if all claims happen to be verified
        if all(c["verified"] for c in verified_claims) and not low_confidence:
            mock_forecaster["confidence"] = "High"
            mock_forecaster["risk_assessment"] = "All calculations are verified and clean."
            for p in mock_forecaster["projections"]:
                p["risk_weight"] = "Low Risk"
                p["projected_operating_income"] = p["projected_operating_income"].replace("*", "")
        else:
            mock_forecaster["confidence"] = "Low"
            # Ensure the risk explanation is consistent
            if low_confidence:
                mock_forecaster["risk_assessment"] += " Layout parsing warning was flagged due to malformed tables in the source document."
        
        yield f"event: status\ndata: {json.dumps({'status': 'Forecasting projections (Mock Mode)...'})}\n\n"
        
        async for chunk in simulate_streaming_text(mock_forecaster):
            yield f"event: forecaster_chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"
            forecaster_full_response += chunk
            
        yield f"event: done\ndata: {json.dumps({'forecaster_response': mock_forecaster})}\n\n"
        
    else:
        # Live Groq API mode
        try:
            # 1. Send parser result
            yield f"event: parser\ndata: {json.dumps({'low_confidence': low_confidence})}\n\n"
            
            # 2. Call Auditor Agent to stream claims extraction
            yield f"event: status\ndata: {json.dumps({'status': 'Auditing document...'})}\n\n"
            
            # Use await: AsyncOpenAI.chat.completions.create is a coroutine,
            # so this never blocks the event loop.
            # Truncate text to MAX_TEXT_FOR_LLM chars before embedding in the prompt.
            # This prevents token-exhaustion DoS and keeps the model’s reasoning
            # window focused on the most relevant content.
            text_for_llm = text[:MAX_TEXT_FOR_LLM]
            response = await client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": AUDITOR_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Analyze this parsed filing text:\n\n{text_for_llm}"}
                ],
                response_format={"type": "json_object"},
                stream=True
            )
            
            auditor_full_response = ""
            # async for: AsyncOpenAI streaming is an async iterator;
            # iterating it without async for would block on each network read.
            async for chunk in response:
                content = chunk.choices[0].delta.content
                if content:
                    yield f"event: auditor_chunk\ndata: {json.dumps({'chunk': content})}\n\n"
                    auditor_full_response += content
                
            yield f"event: auditor_done\ndata: {json.dumps({'full_response': auditor_full_response})}\n\n"
            
            # 3. Perform verification in backend
            try:
                claims_data = json.loads(auditor_full_response)
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'message': 'Auditor returned malformed JSON. Please try again.'})}\n\n"
                logger.error("Failed to parse Auditor JSON: %s", e)
                return
                
            claims = claims_data.get("claims", [])
            # Sanitize all expression/context/reported fields that came from
            # the LLM before any evaluation or re-embedding in prompts.
            # This is the prompt-injection firewall between Auditor output
            # and the Python evaluator / Forecaster prompt.
            claims = _sanitize_llm_claims(claims)
            verified_claims = []
            for claim in claims:
                expr = claim.get("expression", "")
                reported = claim.get("reported", "")
                ver_res = verify_claim(reported, expr)
                
                verified_claim = {
                    **claim,
                    "verified": ver_res["verified"],
                    "recalculated": ver_res["recalculated"],
                    "reason": ver_res["reason"]
                }
                verified_claims.append(verified_claim)
                
            yield f"event: verified_claims\ndata: {json.dumps({'claims': verified_claims})}\n\n"
            
            # 4. Call Forecaster Agent to stream growth projections
            yield f"event: status\ndata: {json.dumps({'status': 'Forecasting projections...'})}\n\n"
            
            forecaster_input = {
                "claims": verified_claims,
                "low_confidence_baseline": low_confidence
            }
            
            forecaster_response = await client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": FORECASTER_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Here is the verified financial data from the Auditor:\n\n{json.dumps(forecaster_input, indent=2)}"}
                ],
                response_format={"type": "json_object"},
                stream=True
            )
            
            forecaster_full_response = ""
            async for chunk in forecaster_response:
                content = chunk.choices[0].delta.content
                if content:
                    yield f"event: forecaster_chunk\ndata: {json.dumps({'chunk': content})}\n\n"
                    forecaster_full_response += content
                
            try:
                forecaster_data = json.loads(forecaster_full_response)
            except Exception:
                forecaster_data = {"error": "Failed to parse Forecaster JSON response"}
                
            yield f"event: done\ndata: {json.dumps({'forecaster_response': forecaster_data})}\n\n"
            
        except Exception as e:
            logger.exception("Groq API error in analysis stream")
            yield f"event: error\ndata: {json.dumps({'message': 'An error occurred while contacting the AI service. Please try again.'})}\n\n"


class VerifyClaimRequest(BaseModel):
    """
    Single-claim math verification request.
    Max lengths mirror the evaluator’s internal guards.
    """
    reported:   str = Field(max_length=128)
    expression: str = Field(max_length=512)


class ForecastRequest(BaseModel):
    """
    Forecast request.  Claims are capped at 50 to prevent prompt-size
    DoS via an enormous claims array.
    """
    claims: Annotated[list[ClaimItem], Field(max_length=50)]
    low_confidence_baseline: bool = False

async def generate_forecast_stream(claims: list, low_confidence_baseline: bool):
    import copy
    client = get_groq_client()
    
    if client is None:
        print("GROQ_API_KEY not configured or placeholder detected. Running in offline mock mode.")
        mock_forecaster = copy.deepcopy(MOCK_FORECASTER_OUTPUT)
        
        # Adjust confidence level if all claims happen to be verified
        if all(c.get("verified", False) for c in claims) and not low_confidence_baseline:
            mock_forecaster["confidence"] = "High"
            mock_forecaster["risk_assessment"] = "All calculations are verified and clean."
            projections = []
            for p in mock_forecaster["projections"]:
                projections.append({
                    "year": p["year"],
                    "projected_revenue": p["projected_revenue"],
                    "projected_operating_income": p["projected_operating_income"].replace("*", ""),
                    "risk_weight": "Low Risk"
                })
            mock_forecaster["projections"] = projections
        else:
            mock_forecaster["confidence"] = "Low"
            if low_confidence_baseline:
                mock_forecaster["risk_assessment"] += " Layout parsing warning was flagged due to malformed tables in the source document."
                
        yield f"event: status\ndata: {json.dumps({'status': 'Forecasting projections (Mock Mode)...'})}\n\n"
        
        async for chunk in simulate_streaming_text(mock_forecaster):
            yield f"event: forecaster_chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"
            
        yield f"event: done\ndata: {json.dumps({'forecaster_response': mock_forecaster})}\n\n"
        
    else:
        try:
            yield f"event: status\ndata: {json.dumps({'status': 'Forecasting projections...'})}\n\n"
            
            forecaster_input = {
                "claims": claims,
                "low_confidence_baseline": low_confidence_baseline
            }
            
            response = await client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": FORECASTER_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Here is the verified financial data from the Auditor:\n\n{json.dumps(forecaster_input, indent=2)}"}
                ],
                response_format={"type": "json_object"},
                stream=True
            )
            
            forecaster_full_response = ""
            async for chunk in response:
                content = chunk.choices[0].delta.content
                if content:
                    yield f"event: forecaster_chunk\ndata: {json.dumps({'chunk': content})}\n\n"
                    forecaster_full_response += content
                
            try:
                forecaster_data = json.loads(forecaster_full_response)
            except Exception:
                forecaster_data = {"error": "Failed to parse Forecaster JSON response"}
                
            yield f"event: done\ndata: {json.dumps({'forecaster_response': forecaster_data})}\n\n"
            
        except Exception as e:
            logger.exception("Groq API error in forecast stream")
            yield f"event: error\ndata: {json.dumps({'message': 'An error occurred while contacting the AI service. Please try again.'})}\n\n"

@app.post("/api/verify-claim")
async def verify_claim_endpoint(request: VerifyClaimRequest):
    """
    Deterministically verifies the math behind a single claim.
    """
    res = verify_claim(request.reported, request.expression)
    return res

@app.post("/api/forecast")
async def forecast_endpoint(request: ForecastRequest):
    """
    Streams growth projections based on an input list of verified claims.
    """
    return StreamingResponse(
        generate_forecast_stream(request.claims, request.low_confidence_baseline),
        media_type="text/event-stream"
    )

@app.post("/api/analyze")
async def analyze_document(request: AnalyzeRequest):
    """
    Streams the dual-agent auditing and forecasting response.
    """
    return StreamingResponse(
        generate_analysis_stream(request.text, request.low_confidence),
        media_type="text/event-stream"
    )

