import os
import json
import time
from openai import OpenAI

# Initialize client using Groq compatible base URL
def get_groq_client():
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None
    # Strip quotes if any
    key = key.strip("'\"")
    if not key.startswith("gsk_"):
        return None
    return OpenAI(
        api_key=key,
        base_url="https://api.groq.com/openai/v1"
    )

# Model configuration
DEFAULT_MODEL = "llama-3.3-70b-specdec"

# Auditor Agent System Prompt
AUDITOR_SYSTEM_PROMPT = """You are the Auditor Agent, a key component of DecimalLens.
Your task is to scan the ingested financial document text, locate numeric financial claims, and extract them into a structured JSON object.

Extract a list of 3 to 6 major numeric claims from the text. Focus on revenue, profits, operating margins, or line items with clear arithmetic relationships.

For each claim, you must extract:
1. `id`: A unique identifier (e.g., "claim-1", "claim-2").
2. `metric`: The financial line item name and period (e.g., "Total Revenue (Q4 2025)").
3. `reported`: The value as written in the text (e.g., "$142,500,000", "24.50%", "$45.2M").
4. `value`: The numeric value of the reported claim standardized to a float/int (e.g. 142500000, 0.245, 45200000).
5. `formula`: A human-readable description of how the number is derived from other items or footnotes (e.g., "Revenue ($142,500,000) - COGS ($80,400,000)"). If it is a base item, list its component breakdown if available (e.g. "$45,200,000 (US) + $97,300,000 (Intl)").
6. `expression`: A raw, simple math expression representing the calculation using plain numeric values, suitable for direct mathematical evaluation in Python (e.g., "45200000 + 97300000", "62100000 - 80400000", "34600000 / 142500000").
7. `page`: The page number (integer) where this claim or its calculation is located.
8. `context`: The direct textual citation or sentence from the document containing this claim.

You MUST respond strictly with a JSON object containing a `claims` array. Do not include any markdown wrap (except standard JSON structure) or extra conversational text outside the JSON.

Example JSON output structure:
{
  "claims": [
    {
      "id": "claim-1",
      "metric": "Total Revenue (Q4 2025)",
      "reported": "$142,500,000",
      "value": 142500000,
      "formula": "$45,200,000 (US) + $97,300,000 (Intl)",
      "expression": "45200000 + 97300000",
      "page": 3,
      "context": "For the quarter, our international market sectors generated $97,300,000 in revenues, representing a substantial growth path, while US domestic revenues stabilized at $45,200,000."
    }
  ]
}
"""

# Forecaster Agent System Prompt
FORECASTER_SYSTEM_PROMPT = """You are the Forecaster Agent, a key component of DecimalLens.
Your task is to receive the verified financial claims from the Auditor Agent and generate a 3-year growth projection and risk assessment.

You MUST analyze the verification status of the input metrics:
- If ANY claim used as a baseline for projections has `verified: false`, you MUST set the overall `confidence` to "Low", tag the affected years as "High Risk", and output a warning explaining that the calculations are built on top of arithmetic errors or unverified metrics.
- If all baseline claims have `verified: true`, you can set the overall `confidence` to "High".

Generate exactly 3 years of projections (FY 2026, FY 2027, FY 2028). For each year, estimate:
1. `year`: e.g., "FY 2026 (Est)"
2. `projected_revenue`: The projected revenue string (e.g., "$154,600,000").
3. `projected_operating_income`: The projected operating income string (e.g. "$37,500,000").
4. `risk_weight`: The risk category ("Low Risk", "Medium Risk", "High Risk (Math Error)" or "High Risk (Mismatched Claim)").

You MUST respond strictly with a JSON object containing:
1. `confidence`: "High" or "Low"
2. `projections`: An array containing the 3-year projections.
3. `risk_assessment`: A detailed explanation of why the confidence was flagged and the downstream impact of any arithmetic errors.

Do not include any conversational text outside the JSON.
"""

# High-fidelity mock responses for fallback mode
MOCK_AUDITOR_OUTPUT = {
  "claims": [
    {
      "id": "claim-1",
      "metric": "Total Revenue (Q4 2025)",
      "reported": "$142,500,000",
      "value": 142500000,
      "formula": "$45,200,000 (US) + $97,300,000 (Intl)",
      "expression": "45200000 + 97300000",
      "page": 3,
      "context": "For the quarter, our international market sectors generated $97,300,000 in revenues, while US domestic revenues stabilized at $45,200,000."
    },
    {
      "id": "claim-2",
      "metric": "Gross Profit",
      "reported": "$62,100,000",
      "value": 62100000,
      "formula": "Revenue ($142,500,000) - COGS ($80,400,000)",
      "expression": "142500000 - 80400000",
      "page": 3,
      "context": "COGS stood at $80,400,000, leaving Gross Profit at $62,100,000."
    },
    {
      "id": "claim-3",
      "metric": "Operating Income",
      "reported": "$34,912,500",
      "value": 34912500,
      "formula": "Gross Profit ($62,100,000) - R&D ($15,400,000) - SG&A ($12,100,000)",
      "expression": "62100000 - 15400000 - 12100000",
      "page": 3,
      "context": "R&D investments totaled $15,400,000, and SG&A expenses were reported at $12,100,000. Operating Income was reported at $34,912,500."
    },
    {
      "id": "claim-4",
      "metric": "Operating Margin",
      "reported": "24.50%",
      "value": 0.2450,
      "formula": "Operating Income ($34,912,500) / Revenue ($142,500,000)",
      "expression": "34912500 / 142500000",
      "page": 3,
      "context": "Operating margin is calculated as Operating Income over Total Revenue, yielding 24.50%."
    }
  ]
}

MOCK_FORECASTER_OUTPUT = {
  "confidence": "Low",
  "projections": [
    {
      "year": "FY 2026 (Est)",
      "projected_revenue": "$154,600,000",
      "projected_operating_income": "$37,500,000*",
      "risk_weight": "High Risk (Math Error)"
    },
    {
      "year": "FY 2027 (Est)",
      "projected_revenue": "$167,700,000",
      "projected_operating_income": "$40,700,000*",
      "risk_weight": "High Risk (Math Error)"
    },
    {
      "year": "FY 2028 (Est)",
      "projected_revenue": "$182,000,000",
      "projected_operating_income": "$44,100,000*",
      "risk_weight": "High Risk (Math Error)"
    }
  ],
  "risk_assessment": "The Forecaster Agent has intercepted unverified math assertions for Operating Income (Claim 3) and Operating Margin (Claim 4). Downstream financial models have been adjusted to reflect high risk. Operating Income calculations have been adjusted down by 0.9% to account for structural reporting errors identified in the initial filing."
}

def simulate_streaming_text(data_dict: dict):
    """
    Simulates a character-by-character or word-by-word streaming stream from a dict,
    mimicking LLM latency.
    """
    json_str = json.dumps(data_dict, indent=2)
    chunk_size = 8
    for i in range(0, len(json_str), chunk_size):
        yield json_str[i:i+chunk_size]
        time.sleep(0.015)
