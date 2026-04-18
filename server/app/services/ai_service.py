import httpx
import json
import re

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL      = "mistral"

SYSTEM_PROMPT = """You are a notification classifier. Analyze the notification text and return ONLY a valid JSON object. No explanation, no markdown, no backticks — raw JSON only.

Return exactly this structure:
{
  "is_spam": false,
  "confidence": 0.1,
  "priority": "normal",
  "category": "social",
  "summary": "short summary here",
  "should_bypass_deferral": false
}

Rules:
- is_spam: true for promotional or manipulative messages (free/win/discount/click bait)
- confidence: your spam confidence as a float 0.0-1.0
- priority: one of "critical", "high", "normal", "low"
- category: one of "otp", "transactional", "social", "marketing", "alert"
- summary: one plain sentence under 12 words, no inner quotes
- should_bypass_deferral: true for OTPs, payment debits, security/login alerts, server emergencies
- priority=critical + should_bypass_deferral=true for: OTPs, 2FA codes, payment alerts, login alerts, server/CPU alerts
- priority=high for: transactional confirmations, meeting reminders, delivery updates
- priority=normal for: social interactions, general updates
- priority=low for: marketing, newsletters, promotions"""


async def analyze_full(content: str) -> dict:
    prompt = f"{SYSTEM_PROMPT}\n\nNotification text: {content}\n\nJSON:"

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(OLLAMA_URL, json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 200
                }
            })
            response.raise_for_status()
            raw = response.json().get("response", "").strip()

        # Strip markdown fences Mistral sometimes adds
        raw = re.sub(r"^```json\s*|^```\s*|```$", "", raw, flags=re.MULTILINE).strip()

        # Extract first JSON object in case model adds trailing text
        match = re.search(r"\{.*?\}", raw, re.DOTALL)
        if match:
            raw = match.group(0)

        result = json.loads(raw)

        # Validate required keys exist
        required = ["is_spam", "confidence", "priority", "category", "summary", "should_bypass_deferral"]
        for key in required:
            if key not in result:
                raise ValueError(f"Missing key: {key}")

        # Sanitise types defensively
        result["is_spam"]                = bool(result["is_spam"])
        result["confidence"]             = float(result["confidence"])
        result["should_bypass_deferral"] = bool(result["should_bypass_deferral"])
        result["priority"]               = str(result["priority"]).lower()
        result["category"]               = str(result["category"]).lower()
        result["summary"]                = str(result["summary"])

        return result

    except Exception as e:
        print(f"[AI_SERVICE] Ollama/Mistral failed: {e} — using heuristic fallback")
        return _heuristic_fallback(content)


def _heuristic_fallback(content: str) -> dict:
    text = content.lower()

    if re.search(r"\botp\b", text) or re.search(r"\b\d{4,6}\b", text):
        return {
            "is_spam": False, "confidence": 0.01,
            "priority": "critical", "category": "otp",
            "summary": "OTP verification code",
            "should_bypass_deferral": True
        }
    if any(w in text for w in ["debited", "credited", "payment", "transaction", "debit", "credit"]):
        return {
            "is_spam": False, "confidence": 0.05,
            "priority": "high", "category": "transactional",
            "summary": "Transaction or payment alert",
            "should_bypass_deferral": True
        }
    if any(w in text for w in ["server", "cpu", "breach", "security", "alert", "emergency"]):
        return {
            "is_spam": False, "confidence": 0.05,
            "priority": "critical", "category": "alert",
            "summary": "System or security alert",
            "should_bypass_deferral": True
        }
    if any(w in text for w in ["offer", "sale", "discount", "win", "free", "click", "congratulations"]):
        return {
            "is_spam": True, "confidence": 0.9,
            "priority": "low", "category": "marketing",
            "summary": "Promotional message",
            "should_bypass_deferral": False
        }
    return {
        "is_spam": False, "confidence": 0.1,
        "priority": "normal", "category": "social",
        "summary": content[:60],
        "should_bypass_deferral": False
    }


async def check_spam(content: str) -> dict:
    result = await analyze_full(content)
    return {"is_spam": result["is_spam"], "confidence": result["confidence"], "reason": result["summary"]}

async def analyze(content: str) -> dict:
    return await analyze_full(content)