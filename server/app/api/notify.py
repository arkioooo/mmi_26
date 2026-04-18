from fastapi import APIRouter
from app.services import ai_service, queue_service

router = APIRouter()

@router.post("/")
async def notify(data: dict):
    recipient_id = data.get("recipient_id", "unknown")
    content      = data.get("content", "")

    if not content.strip():
        return {"status": "error", "message": "content is required"}

    analysis = await ai_service.analyze_full(content)

    base = {
        "priority":               analysis["priority"],
        "category":               analysis["category"],
        "summary":                analysis["summary"],
        "is_spam":                analysis["is_spam"],
        "confidence":             analysis["confidence"],
        "should_bypass_deferral": analysis["should_bypass_deferral"]
    }

    if analysis["is_spam"] and analysis["confidence"] > 0.85:
        return {"status": "dropped_spam", **base}

    if analysis["should_bypass_deferral"]:
        return {"status": "sent_immediately", **base}

    await queue_service.enqueue(recipient_id, content, analysis)
    return {"status": "queued", **base}