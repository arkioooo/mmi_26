"""
TTL Worker — run alongside FastAPI to clean expired messages from Redis.
Usage:  python ttl_worker.py
"""
import asyncio, json, time, os
import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
INTERVAL   = 60


async def cleanup(r):
    now, dropped = int(time.time()), 0
    for key in await r.keys("queue:*"):
        for raw in await r.zrange(key, 0, -1):
            try:
                m   = json.loads(raw)
                age = now - m.get("enqueued_at", now)
                if age > m.get("ttl", 86400):
                    await r.zrem(key, raw)
                    dropped += 1
                    print(f"[TTL] Expired from {key}: {m.get('content','')[:40]}")
            except Exception:
                await r.zrem(key, raw)
                dropped += 1
    print(f"[TTL] Run complete — dropped {dropped}")


async def main():
    r = aioredis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    print(f"[TTL] Worker running every {INTERVAL}s")
    while True:
        try:
            await cleanup(r)
        except Exception as e:
            print(f"[TTL] Error: {e}")
        await asyncio.sleep(INTERVAL)

if __name__ == "__main__":
    asyncio.run(main())