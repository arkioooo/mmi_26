from fastapi import APIRouter
from app.services import ai_service, queue_service

router = APIRouter()

DELIVERED_STORE = {}

def _get_user_delivered(user_id: str):
    if user_id not in DELIVERED_STORE:
        DELIVERED_STORE[user_id] = []
    return DELIVERED_STORE[user_id]


@router.post("/")
async def notify(data: dict):
    recipient_id = data.get("recipient_id", "user_123")
    content      = data.get("content", "")

    if not content.strip():
        return {"status": "error", "message": "content is required"}

    analysis = ai_service.analyze_full(content)

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
        delivered = _get_user_delivered(recipient_id)

        delivered.append({
            "content": content,
            "priority": analysis["priority"],
            "category": analysis["category"],
            "summary": analysis["summary"],
            "type": "bypass"
        })

        print(f"[NOTIFY] Immediate delivery -> {recipient_id}")

        return {"status": "sent_immediately", **base}

    await queue_service.enqueue(recipient_id, content, analysis)

    return {"status": "queued", **base}
