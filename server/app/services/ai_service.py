import re
import pickle
import logging
import sys
from pathlib import Path

import joblib

logger = logging.getLogger(__name__)

# Load models on startup
MODEL_DIR = Path(__file__).parent.parent.parent.parent / "models"
spam_model = None
category_model = None
config = None

def load_models():
    global spam_model, category_model, config
    try:
        spam_model = joblib.load(MODEL_DIR / "spam_classifier.pkl")
        category_model = joblib.load(MODEL_DIR / "category_classifier.pkl")
        with open(MODEL_DIR / "config.pkl", "rb") as f:
            config = pickle.load(f)
        logger.info("✓ AI models loaded successfully from %s", MODEL_DIR)
    except Exception as e:
        logger.warning(
            "Failed to load models from %s with Python %s: %s. Falling back to rules.",
            MODEL_DIR,
            sys.executable,
            str(e)
        )
        spam_model = None
        category_model = None
        config = None

load_models()

def _get_priority_for_category(category: str) -> str:
    """Map category to priority level"""
    priority_map = (config or {}).get("PRIORITY_MAP", {
        "otp": "critical",
        "alert": "critical",
        "transactional": "high",
        "social": "normal",
        "marketing": "low"
    })
    return priority_map.get(category, "normal")


def _should_bypass(category: str, priority: str) -> bool:
    """Determine if message should bypass deferral"""
    bypass_categories = set((config or {}).get("BYPASS_CATEGORIES", ["otp", "alert"]))
    return category in bypass_categories or priority == "critical"


def _rule_category(content: str) -> str | None:
    """Catch obvious high-stakes messages before weak model labels can hide them."""
    text = content.lower()
    if any(w in text for w in ["server", "cpu", "breach", "security", "alert", "emergency", "login"]):
        return "alert"
    if any(w in text for w in ["debited", "credited", "payment", "transaction", "debit", "credit"]):
        return "transactional"
    if re.search(r"\b(otp|code|verification)\b", text) and re.search(r"\b\d{4,6}\b", text):
        return "otp"
    return None


def _spam_probability(model, probabilities) -> float:
    """Return the probability for the spam/positive class."""
    classes = list(getattr(model, "classes_", []))
    if 1 in classes:
        return float(probabilities[classes.index(1)])
    if True in classes:
        return float(probabilities[classes.index(True)])
    if "spam" in classes:
        return float(probabilities[classes.index("spam")])
    return float(max(probabilities))


def analyze_full(content: str) -> dict:
    """Analyze message using trained models or fallback to rules"""
    
    # Try to use trained models
    if spam_model is not None and category_model is not None:
        try:
            # Predict spam
            spam_proba = spam_model.predict_proba([content])[0]
            spam_confidence = _spam_probability(spam_model, spam_proba)
            spam_threshold = (config or {}).get("SPAM_THRESHOLD", 0.85)
            is_spam = spam_confidence >= spam_threshold
            confidence = spam_confidence
            
            # If not spam, predict category
            if not is_spam:
                category_pred = category_model.predict([content])[0]
                category = _rule_category(content) or str(category_pred)
            else:
                category = "marketing"
            
            priority = _get_priority_for_category(category)
            should_bypass = _should_bypass(category, priority)
            
            logger.debug("Model prediction - is_spam=%s, category=%s, priority=%s, confidence=%.2f", is_spam, category, priority, confidence)
            
            return {
                "is_spam": is_spam,
                "confidence": confidence,
                "priority": priority,
                "category": category,
                "summary": content[:60],
                "should_bypass_deferral": should_bypass
            }
        except Exception as e:
            logger.warning("Model prediction failed: %s. Falling back to rules.", str(e))
    
    # Fallback to hardcoded rules
    text = content.lower()

    # OTP
    if re.search(r"\b(otp|code|verification)\b", text) and re.search(r"\b\d{4,6}\b", text):
        return {
            "is_spam": False,
            "confidence": 0.01,
            "priority": "critical",
            "category": "otp",
            "summary": "OTP verification code",
            "should_bypass_deferral": True
        }

    # Transactional
    if any(w in text for w in ["debited", "credited", "payment", "transaction", "debit", "credit"]):
        return {
            "is_spam": False,
            "confidence": 0.05,
            "priority": "high",
            "category": "transactional",
            "summary": "Transaction or payment alert",
            "should_bypass_deferral": True
        }

    # Alerts
    if any(w in text for w in ["server", "cpu", "breach", "security", "alert", "emergency", "login"]):
        return {
            "is_spam": False,
            "confidence": 0.05,
            "priority": "critical",
            "category": "alert",
            "summary": "System or security alert",
            "should_bypass_deferral": True
        }

    # Marketing / Spam
    if any(w in text for w in ["offer", "sale", "discount", "win", "free", "click", "congratulations"]):
        return {
            "is_spam": True,
            "confidence": 0.9,
            "priority": "low",
            "category": "marketing",
            "summary": "Promotional message",
            "should_bypass_deferral": False
        }

    # Default
    return {
        "is_spam": False,
        "confidence": 0.1,
        "priority": "normal",
        "category": "social",
        "summary": content[:60],
        "should_bypass_deferral": False
    }


async def analyze(content: str) -> dict:
    return analyze_full(content)


async def check_spam(content: str) -> dict:
    result = analyze_full(content)
    return {
        "is_spam": result["is_spam"],
        "confidence": result["confidence"],
        "reason": result["summary"]
    }
