from fastapi import APIRouter

router = APIRouter()

GEO_STORE = {
    "user_123": [
        {
            "label": "home",
            "lat": 13.0827,
            "lng": 80.2707,
            "radius_meters": 300,
            "zone_type": "always_deliver"
        },
        {
            "label": "office",
            "lat": 13.0900,
            "lng": 80.2800,
            "radius_meters": 200,
            "zone_type": "critical_only"
        }
    ]
}


def _get_user_zones(user_id: str):
    if user_id not in GEO_STORE:
        GEO_STORE[user_id] = []
    return GEO_STORE[user_id]


def _same_zone(a: dict, b: dict):
    if a.get("lat") is None or a.get("lng") is None or b.get("lat") is None or b.get("lng") is None:
        return False
    return (
        str(a.get("label", "")).strip().lower() == str(b.get("label", "")).strip().lower()
        and round(float(a.get("lat", 0)), 6) == round(float(b.get("lat", 0)), 6)
        and round(float(a.get("lng", 0)), 6) == round(float(b.get("lng", 0)), 6)
    )


@router.post("/create")
async def create_geo(data: dict):
    user_id = data.get("user_id", "user_123")

    zone = {
        "label": data.get("label", "custom"),
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "radius_meters": data.get("radius_meters", 200),
        "zone_type": data.get("zone_type", "always_deliver")
    }
    
    # Add optional deferral times (e.g., quiet hours)
    if "deferral_times" in data and data["deferral_times"]:
        zone["deferral_times"] = data["deferral_times"]

    if zone["lat"] is None or zone["lng"] is None:
        return {"status": "error", "message": "lat/lng required"}

    zones = _get_user_zones(user_id)
    existing_idx = next((idx for idx, existing in enumerate(zones) if _same_zone(existing, zone)), None)
    if existing_idx is None:
        zones.append(zone)
    else:
        zones[existing_idx] = zone

    print(f"[GEO] Added zone → {zone['label']} for {user_id}")
    if zone.get("deferral_times"):
        print(f"[GEO] Deferral times: {zone['deferral_times']}")

    return {
        "status": "created",
        "zone": zone
    }


@router.post("/quiet-hours")
async def update_quiet_hours(data: dict):
    user_id = data.get("user_id", "user_123")
    zone = {
        "label": data.get("label", "custom"),
        "lat": data.get("lat"),
        "lng": data.get("lng")
    }
    deferral_times = data.get("deferral_times", [])

    zones = _get_user_zones(user_id)
    existing = next((z for z in zones if _same_zone(z, zone)), None)
    if existing is None:
        existing = {
            "label": zone["label"],
            "lat": zone["lat"],
            "lng": zone["lng"],
            "radius_meters": data.get("radius_meters", 200),
            "zone_type": data.get("zone_type", "always_deliver")
        }
        zones.append(existing)

    existing["deferral_times"] = deferral_times
    return {
        "status": "updated",
        "zone": existing
    }


@router.get("/{user_id}")
async def get_geo(user_id: str):
    zones = _get_user_zones(user_id)

    return {
        "profiles": zones
    }
