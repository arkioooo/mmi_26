from app.utils.haversine import haversine
from app.api.geo import GEO_STORE as GEO_ZONES
from datetime import datetime


def _is_in_deferral_window(deferral_times):
    """Check if current time is in any of the deferral windows"""
    if not deferral_times:
        return False
    
    current_time = datetime.now().strftime("%H:%M")
    
    for window in deferral_times:
        start = window.get("start")
        end = window.get("end")
        
        if start and end:
            # Simple time comparison (HH:MM format)
            if start <= current_time <= end:
                return True
    
    return False


async def match(user_id, lat, lng):
    try:
        profiles = GEO_ZONES.get(user_id, [])

        print(f"[GEO] Loaded {len(profiles)} zone(s) for {user_id}")

        for p in profiles:
            distance = haversine(lat, lng, p["lat"], p["lng"])

            print(f"[GEO] Checking {p['label']}: {distance:.2f}m (radius: {p['radius_meters']}m)")

            if distance <= p["radius_meters"]:
                zone_type = p["zone_type"]
                deferral_times = p.get("deferral_times", [])
                
                # If in time-based deferral window, override zone_type to defer
                if _is_in_deferral_window(deferral_times):
                    print(f"[GEO] Time-based deferral active for {p['label']}")
                    zone_type = "defer"
                
                print(f"[GEO] Matched zone: {p['label']} ({zone_type})")
                return {
                    "type": zone_type,
                    "label": p["label"],
                    "deferral_times": deferral_times
                }

        print("[GEO] No zone matched -> default always_deliver")

        return {"type": "always_deliver", "label": "default"}

    except Exception as e:
        print("[GEO] Error:", e)
        return {"type": "always_deliver", "label": "default"}
