from fastapi import APIRouter
from app.api.notify import DELIVERED_STORE
from app.services.queue_service import get_queue

router = APIRouter()


@router.get("/{user_id}")
async def get_messages(user_id: str):
    delivered = DELIVERED_STORE.get(user_id, [])
    queue = await get_queue(user_id)

    return {
        "delivered": delivered[::-1],
        "pending": queue[::-1]
    }