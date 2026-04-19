
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

* **AI Classification (Spam + Priority Classifiers)**

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

## **API Endpoints**

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


Run services:

```bash
uvicorn app.main:app --reload
python -m http.server 3000
```

Open:

```
http://[::1]:3000/
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
