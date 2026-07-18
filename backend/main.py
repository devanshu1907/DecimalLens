import os
import json
import asyncio
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

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

# Setup CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    text: str
    low_confidence: bool = False

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "groq_api_key_configured": bool(os.environ.get("GROQ_API_KEY") and os.environ.get("GROQ_API_KEY") != "your-groq-api-key-here"),
        "message": "DecimalLens Python FastAPI Backend is active"
    }

@app.get("/api/document/{filename}")
async def get_document(filename: str):
    """
    Serves a raw document (e.g. PDF, CSV) from the uploads directory.
    """
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Document not found")
        
    ext = safe_filename.split('.')[-1].lower()
    if ext == 'pdf':
        media_type = 'application/pdf'
    elif ext == 'csv':
        media_type = 'text/csv'
    elif ext in ['md', 'markdown']:
        media_type = 'text/markdown'
    else:
        media_type = 'text/plain'
        
    return FileResponse(file_path, media_type=media_type)

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Ingests, saves, and parses a single financial document (PDF, CSV, MD).
    Checks for layout alignment / malformed table structure.
    """
    try:
        contents = await file.read()
        
        # Save file to uploads folder
        safe_filename = os.path.basename(file.filename)
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        with open(file_path, "wb") as f:
            f.write(contents)
            
        parsed_result = parse_document(file.filename, contents)
        return {
            "filename": file.filename,
            "format": parsed_result["format"],
            "text": parsed_result["text"],
            "low_confidence": parsed_result["low_confidence"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

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
        
        for chunk in simulate_streaming_text(mock_auditor):
            yield f"event: auditor_chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"
            auditor_full_response += chunk
            await asyncio.sleep(0.001)
            
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
        
        for chunk in simulate_streaming_text(mock_forecaster):
            yield f"event: forecaster_chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"
            forecaster_full_response += chunk
            await asyncio.sleep(0.001)
            
        yield f"event: done\ndata: {json.dumps({'forecaster_response': mock_forecaster})}\n\n"
        
    else:
        # Live Groq API mode
        try:
            # 1. Send parser result
            yield f"event: parser\ndata: {json.dumps({'low_confidence': low_confidence})}\n\n"
            
            # 2. Call Auditor Agent to stream claims extraction
            yield f"event: status\ndata: {json.dumps({'status': 'Auditing document...'})}\n\n"
            
            response = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": AUDITOR_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Analyze this parsed filing text:\n\n{text}"}
                ],
                response_format={"type": "json_object"},
                stream=True
            )
            
            auditor_full_response = ""
            for chunk in response:
                content = chunk.choices[0].delta.content
                if content:
                    yield f"event: auditor_chunk\ndata: {json.dumps({'chunk': content})}\n\n"
                    auditor_full_response += content
                await asyncio.sleep(0.001)
                
            yield f"event: auditor_done\ndata: {json.dumps({'full_response': auditor_full_response})}\n\n"
            
            # 3. Perform verification in backend
            try:
                claims_data = json.loads(auditor_full_response)
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'message': f'Failed to parse JSON from Auditor Agent: {str(e)}'})}\n\n"
                return
                
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
            
            # 4. Call Forecaster Agent to stream growth projections
            yield f"event: status\ndata: {json.dumps({'status': 'Forecasting projections...'})}\n\n"
            
            forecaster_input = {
                "claims": verified_claims,
                "low_confidence_baseline": low_confidence
            }
            
            forecaster_response = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": FORECASTER_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Here is the verified financial data from the Auditor:\n\n{json.dumps(forecaster_input, indent=2)}"}
                ],
                response_format={"type": "json_object"},
                stream=True
            )
            
            forecaster_full_response = ""
            for chunk in forecaster_response:
                content = chunk.choices[0].delta.content
                if content:
                    yield f"event: forecaster_chunk\ndata: {json.dumps({'chunk': content})}\n\n"
                    forecaster_full_response += content
                await asyncio.sleep(0.001)
                
            try:
                forecaster_data = json.loads(forecaster_full_response)
            except Exception:
                forecaster_data = {"error": "Failed to parse Forecaster JSON response"}
                
            yield f"event: done\ndata: {json.dumps({'forecaster_response': forecaster_data})}\n\n"
            
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': f'Groq API error: {str(e)}'})}\n\n"


class VerifyClaimRequest(BaseModel):
    reported: str
    expression: str

class ForecastRequest(BaseModel):
    claims: list
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
        
        for chunk in simulate_streaming_text(mock_forecaster):
            yield f"event: forecaster_chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"
            await asyncio.sleep(0.001)
            
        yield f"event: done\ndata: {json.dumps({'forecaster_response': mock_forecaster})}\n\n"
        
    else:
        try:
            yield f"event: status\ndata: {json.dumps({'status': 'Forecasting projections...'})}\n\n"
            
            forecaster_input = {
                "claims": claims,
                "low_confidence_baseline": low_confidence_baseline
            }
            
            response = client.chat.completions.create(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": FORECASTER_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Here is the verified financial data from the Auditor:\n\n{json.dumps(forecaster_input, indent=2)}"}
                ],
                response_format={"type": "json_object"},
                stream=True
            )
            
            forecaster_full_response = ""
            for chunk in response:
                content = chunk.choices[0].delta.content
                if content:
                    yield f"event: forecaster_chunk\ndata: {json.dumps({'chunk': content})}\n\n"
                    forecaster_full_response += content
                await asyncio.sleep(0.001)
                
            try:
                forecaster_data = json.loads(forecaster_full_response)
            except Exception:
                forecaster_data = {"error": "Failed to parse Forecaster JSON response"}
                
            yield f"event: done\ndata: {json.dumps({'forecaster_response': forecaster_data})}\n\n"
            
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': f'Groq API error: {str(e)}'})}\n\n"

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

