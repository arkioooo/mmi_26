from fastapi import APIRouter
from app.services import geo_service, delivery_service
from app.api.notify import DELIVERED_STORE

router = APIRouter()


def _get_user_delivered(user_id: str):
    if user_id not in DELIVERED_STORE:
        DELIVERED_STORE[user_id] = []
    return DELIVERED_STORE[user_id]


@router.post("/")
async def beacon(data: dict):
    user_id = data.get("user_id", "user_123")
    lat = data.get("lat")
    lng = data.get("lng")
    connectivity_score = data.get("connectivity_score", 0)

    if lat is None or lng is None:
        return {"status": "invalid_location"}

    print(f"[BEACON] User {user_id} at ({lat}, {lng}) | conn={connectivity_score}")

    zone = await geo_service.match(user_id, lat, lng)
    deferral_active = zone.get("type") == "defer" and zone.get("deferral_times")
    print("[BEACON] Zone:", zone)
    if deferral_active:
        print(f"[BEACON] Time-based deferral active: {zone.get('deferral_times')}")

    can_deliver = (
        connectivity_score >= 2 and
        zone["type"] != "defer"
    )

    print("[BEACON] Can deliver:", can_deliver)

    delivered_messages = []

    if can_deliver:
        delivered_messages = await delivery_service.flush(user_id, zone["type"])

        delivered_store = _get_user_delivered(user_id)

        for msg in delivered_messages:
            delivered_store.append({
                "content": msg.get("content"),
                "priority": msg.get("priority"),
                "category": msg.get("category"),
                "summary": msg.get("summary"),
                "type": "flush" if not msg.get("is_digest") else "digest"
            })

        print(f"[BEACON] Stored {len(delivered_messages)} delivered message(s)")

    return {
        "status": "processed",
        "zone": zone,
        "delivered": can_deliver,
        "messages": delivered_messages
    }

@router.get("/delivered/{user_id}")
async def get_delivered(user_id: str):
    return {"messages": DELIVERED_STORE.get(user_id, [])}