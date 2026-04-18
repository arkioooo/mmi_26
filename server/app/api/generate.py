from fastapi import APIRouter
import random

router = APIRouter()

# In-memory session store (per user)
# In production → Redis
used_messages = {}


# --- MORE MESSAGES ---

MESSAGES = [

    # OTP Variants
    {"content": "Use 664921 as your verification code.", "sender": "Microsoft"},
    {"content": "OTP: 1183 for transaction approval.", "sender": "ICICI"},
    {"content": "Your login code is 552901. Do not share.", "sender": "Facebook"},

    # Banking / Financial noise
    {"content": "₹5,000 withdrawn from ATM. Balance: ₹21,340.", "sender": "SBI"},
    {"content": "Auto-debit of ₹999 processed for Netflix.", "sender": "HDFCBank"},
    {"content": "UPI collect request from Rahul for ₹250.", "sender": "PhonePe"},
    {"content": "Refund of ₹420 processed. Will reflect in 2 days.", "sender": "AmazonPay"},

    # Security realism
    {"content": "We noticed unusual activity. Please verify your account.", "sender": "PayPal"},
    {"content": "New login from Safari on iPhone.", "sender": "Apple"},
    {"content": "Account locked after multiple failed attempts.", "sender": "GitHub"},

    # Infra / DevOps alerts
    {"content": "Pod restart loop detected in cluster-prod.", "sender": "Kubernetes"},
    {"content": "High latency detected in API gateway.", "sender": "NewRelic"},
    {"content": "Memory usage crossed 92% on node-3.", "sender": "Grafana"},
    {"content": "Deployment failed: rollback initiated.", "sender": "CI/CD"},

    # Social (more human)
    {"content": "Karthik replied: 'Send me the doc once ready.'", "sender": "WhatsApp"},
    {"content": "Priya mentioned you in a comment.", "sender": "Instagram"},
    {"content": "You were tagged in a photo.", "sender": "Facebook"},
    {"content": "New connection request from Rohan.", "sender": "LinkedIn"},

    # Delivery realism
    {"content": "Rider is nearby. Please be ready to receive.", "sender": "Swiggy"},
    {"content": "Your order has been delayed by 5 mins.", "sender": "Zomato"},
    {"content": "Shipment picked up from warehouse.", "sender": "Ekart"},
    {"content": "Out for delivery — OTP may be required.", "sender": "Delhivery"},

    # Ride / mobility
    {"content": "Driver arriving in 2 minutes.", "sender": "Uber"},
    {"content": "Trip completed. Rate your driver.", "sender": "Ola"},
    {"content": "Your ride has been cancelled by driver.", "sender": "Uber"},

    # Work / productivity realism
    {"content": "PR approved. Ready to merge.", "sender": "GitHub"},
    {"content": "Build completed successfully.", "sender": "Jenkins"},
    {"content": "You were assigned a new task.", "sender": "Jira"},
    {"content": "Reminder: 1:1 with manager at 4 PM.", "sender": "Calendar"},

    # Calendar variations
    {"content": "Event starting now: Sprint Planning.", "sender": "Google Calendar"},
    {"content": "Upcoming: Demo in 30 minutes.", "sender": "Outlook"},
    {"content": "Meeting rescheduled to 3:30 PM.", "sender": "Calendar"},

    # Marketing (more realistic spam patterns)
    {"content": "Flat ₹500 off on your next order. Use code SAVE500.", "sender": "Swiggy"},
    {"content": "Hurry! Only 2 hours left for this deal.", "sender": "Amazon"},
    {"content": "Unlock premium at just ₹1 for first month.", "sender": "Spotify"},
    {"content": "You're pre-approved for a loan. Check eligibility.", "sender": "LoanApp"},

    # Slightly deceptive spam (important for AI testing)
    {"content": "Your account will be suspended. Verify now.", "sender": "SecureApp"},
    {"content": "Final reminder: claim your reward today.", "sender": "Promo"},
    {"content": "Update KYC immediately to avoid service block.", "sender": "BankAlert"},

    # System / device
    {"content": "Update available. Restart required.", "sender": "System"},
    {"content": "WiFi disconnected.", "sender": "Android"},
    {"content": "Bluetooth device connected.", "sender": "System"},
    {"content": "App crashed unexpectedly.", "sender": "System"},

    # Weather / environment
    {"content": "Thunderstorm warning in your area.", "sender": "Weather"},
    {"content": "AQI is unhealthy today. Limit outdoor activity.", "sender": "Weather"},
    {"content": "Temperature expected to hit 38°C.", "sender": "Weather"},

    # Misc human noise (very important realism)
    {"content": "Hey, call me when you're free.", "sender": "Unknown"},
    {"content": "Reached safely. Thanks!", "sender": "Mom"},
    {"content": "Where are you?", "sender": "Friend"},
    {"content": "Running 10 mins late.", "sender": "Colleague"},

    # Edge-case formatting (for robustness testing)
    {"content": "OTP-442211. Do not share!", "sender": "AxisBank"},
    {"content": "Txn alert: Rs. 1999 debited.", "sender": "SBI"},
    {"content": "[ALERT] CPU spike detected!!!", "sender": "Monitoring"},
    {"content": "SALE!!! 90% OFF!!! CLICK NOW!!!", "sender": "SpamX"},
]


@router.get("/")
async def generate(user_id: str = "user_123"):
    global used_messages

    # Initialize session if not exists
    if user_id not in used_messages:
        used_messages[user_id] = set()

    available = [
        i for i in range(len(MESSAGES))
        if i not in used_messages[user_id]
    ]

    # If all messages used → reset (new ride)
    if not available:
        print("[GENERATE] All messages used — resetting session")
        used_messages[user_id].clear()
        available = list(range(len(MESSAGES)))

    idx = random.choice(available)
    used_messages[user_id].add(idx)

    msg = MESSAGES[idx]

    print(f"[GENERATE] Generated (unique): {msg['content']}")

    return msg