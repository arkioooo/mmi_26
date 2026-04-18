import logging
from fastapi import FastAPI
from app.api import notify, beacon, messages, geo, generate

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = FastAPI()

app.include_router(notify.router, prefix="/api/notify")
app.include_router(beacon.router, prefix="/api/beacon")
app.include_router(messages.router, prefix="/api/messages")
app.include_router(geo.router, prefix="/api/geo")
app.include_router(generate.router, prefix="/api/generate")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)