from app.core.redis import r
import json
import time

PRIORITY_WEIGHT = {
    "critical": 4,
    "high": 3,
    "normal": 2,
    "low": 1
}

TTL_MAP = {
    "otp": 300,
    "transactional": 3600,
    "alert": 1800,
    "social": 86400,
    "marketing": 43200
}

async def enqueue(user_id: str, content: str, analysis: dict):
    now = int(time.time())

    message = {
        "content": content,
        "priority": analysis["priority"],
        "category": analysis["category"],
        "summary": analysis["summary"],
        "enqueued_at": now,
        "ttl": TTL_MAP.get(analysis["category"], 86400)
    }

    score = PRIORITY_WEIGHT[analysis["priority"]] * 1000000000 + now

    await r.zadd(
        f"queue:{user_id}",
        {json.dumps(message): score}
    )

async def flush(user_id: str, zone_type: str) -> list:
    raw_messages = await r.zrange(f"queue:{user_id}", 0, -1)
    now = int(time.time())
    expired, to_deliver, to_keep = [], [], []

    for raw in raw_messages:
        try:
            m = json.loads(raw)
            age = now - m.get("enqueued_at", now)
            if age > m.get("ttl", 86400):
                expired.append(raw)
            elif zone_type == "critical_only" and m.get("priority") != "critical":
                to_keep.append(raw)
            else:
                to_deliver.append((raw, m))
        except Exception:
            expired.append(raw)

    for raw in expired:
        await r.zrem(f"queue:{user_id}", raw)
    for raw, _ in to_deliver:
        await r.zrem(f"queue:{user_id}", raw)

    delivered = [m for _, m in to_deliver]
    print(f"[DELIVERY] user={user_id} zone={zone_type} delivered={len(delivered)} kept={len(to_keep)} expired={len(expired)}")
    return delivered