
# **TrueNotify — Geo-Deferred Notifications**

Smart notification system that **prioritizes, defers, and delivers messages** based on **importance, location, and connectivity**.

---

## **Overview**

* Critical messages (OTP, payments, alerts) → **instant delivery**
* Non-critical messages → **queued**
* Delivery depends on:

  * Network connectivity
  * Geo-zones
* Messages expire via **TTL**

---

## **Features**

* **AI Classification (Ollama + Mistral)**

  * Priority: `critical`, `high`, `normal`, `low`
  * Category: `otp`, `transactional`, `social`, `marketing`, `alert`
  * Spam detection + bypass logic

* **Smart Delivery**

  * Spam → dropped
  * Critical → immediate
  * Low signal / defer zone → queued
  * Good signal → delivered

* **Geo-Zones**

  * `always_deliver`
  * `defer`
  * `critical_only`

* **Priority Queue (Redis)**

  * Sorted set: `priority × timestamp`

* **TTL Expiry**

  * OTP: 5 min
  * Transactional: 1 hr
  * Alert: 30 min
  * Social: 24 hr
  * Marketing: 12 hr

* **Drive Simulator UI**

  * Simulates movement + network changes
  * Visual queue + delivery flow

---

## **Architecture**

```
Frontend → FastAPI → AI (Ollama)
                 ↓
             Redis Queue
                 ↓
        Geo Service (Postgres)
                 ↓
            Delivery Engine
```

---

## **API**

**POST /api/notify**

```json
{
  "recipient_id": "user_123",
  "content": "Your OTP is 4821"
}
```

**POST /api/beacon**

```json
{
  "user_id": "user_123",
  "lat": 13.08,
  "lng": 80.27,
  "connectivity_score": 3
}
```

**GET /api/generate/**
**GET /api/messages/{user_id}**
**POST /api/geo/create**

---

## **Setup**

```bash
git clone <repo>
cd server

python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**.env**

```
POSTGRES_URL=postgresql+asyncpg://user:pass@localhost/db
REDIS_HOST=localhost
REDIS_PORT=6379
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral
```

Run services:

```bash
ollama run mistral
uvicorn app.main:app --reload
python ttl_worker.py
```

Open:

```
index.html
```

---

## **Demo**

* OTP in no signal → still delivered
* Social messages → queued
* Enter strong network → flushed
* Spam → dropped

---

## **Summary**

TrueNotify shows how **AI + geo-awareness + priority queues** can optimize notification delivery in real-world systems.
