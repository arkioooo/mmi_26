from app.core.redis import r
import json
import time

async def flush(user_id: str, zone_type: str) -> list:
    raw_messages = await r.zrange(f"queue:{user_id}", 0, -1)

    parsed = []
    expired = []
    now = int(time.time())

    for raw in raw_messages:
        try:
            m = json.loads(raw)
            enqueued_at = m.get("enqueued_at", now)
            ttl = m.get("ttl", 86400)

            if now - enqueued_at > ttl:
                # Message has expired — remove it silently
                expired.append(raw)
            else:
                parsed.append((raw, m))
        except Exception:
            expired.append(raw)

    # Remove expired messages
    for raw in expired:
        await r.zrem(f"queue:{user_id}", raw)

    if expired:
        print(f"[DELIVERY] Expired and dropped {len(expired)} message(s) for {user_id}")

    # Apply zone filter
    filtered = []
    kept = []

    for raw, m in parsed:
        if zone_type == "critical_only" and m.get("priority") != "critical":
            kept.append(raw)  # not delivered yet — stay in queue
        else:
            filtered.append((raw, m))

    # Remove delivered messages from queue
    for raw, _ in filtered:
        await r.zrem(f"queue:{user_id}", raw)

    delivered = [m for _, m in filtered]

    print(f"[DELIVERY] Flushed {len(delivered)} message(s) for {user_id} | zone={zone_type} | kept={len(kept)} | expired={len(expired)}")

    return delivered