import time
from app.services.queue_service import get_queue, clear_queue

DIGEST_THRESHOLD = 3

PRIORITY_ORDER = {
    "critical": 4,
    "high": 3,
    "normal": 2,
    "low": 1
}


def _build_digest(messages):
    categories = {}

    for m in messages:
        cat = m.get("category", "other")
        categories[cat] = categories.get(cat, 0) + 1

    parts = [f"{v} {k}" for k, v in categories.items()]
    summary = ", ".join(parts)

    return {
        "content": f"You have {len(messages)} new notifications: {summary}",
        "priority": "high",
        "category": "digest",
        "summary": "Batch notification summary",
        "is_digest": True
    }


async def flush(user_id: str, zone_type: str) -> list:
    queue = await get_queue(user_id)

    now = int(time.time())

    valid_messages = []
    expired_count = 0

    for m in queue:
        enqueued_at = m.get("enqueued_at", now)
        ttl = m.get("ttl", 86400)

        if now - enqueued_at > ttl:
            expired_count += 1
        else:
            valid_messages.append(m)

    if expired_count:
        print(f"[DELIVERY] Expired {expired_count} message(s)")

    to_deliver = []
    to_keep = []

    for m in valid_messages:
        if zone_type == "critical_only" and m.get("priority") != "critical":
            to_keep.append(m)
        else:
            to_deliver.append(m)

    remaining_queue = to_keep
    await clear_queue(user_id)
    queue = await get_queue(user_id)
    queue.extend(remaining_queue)

    delivered = to_deliver

    if len(delivered) > DIGEST_THRESHOLD:
        delivered.sort(
            key=lambda x: PRIORITY_ORDER.get(x.get("priority", "low"), 1),
            reverse=True
        )

        top_messages = delivered[:2]
        remaining = delivered[2:]

        digest = _build_digest(remaining)

        final_output = top_messages + [digest]

        print(f"[DELIVERY] Digest created for {len(delivered)} messages")

        return final_output

    print(f"[DELIVERY] Delivered {len(delivered)} message(s)")
    return delivered
