"""
PitchForge Backend
==================
Flask + SQLite + JWT + Google Gemini API (free tier)

Endpoints
---------
POST /api/auth/register      — create account
POST /api/auth/login         — login + JWT
POST /api/auth/refresh       — refresh token
GET  /api/me                 — current user

POST /api/generate           — upload 3 images + business info → generate pitch message
GET  /api/messages           — list all messages for user
GET  /api/messages/<id>      — get single message
POST /api/messages/<id>/outcome — mark message as success/failure + optional note

GET  /api/health
"""

import os, uuid, base64, json, logging, requests
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import (
    JWTManager, create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity,
)
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
DB_PATH       = os.path.join(BASE_DIR, "pitchforge.db")
ALLOWED_EXT   = {"png", "jpg", "jpeg", "webp"}

GEMINI_KEY     = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-2.0-flash"
GEMINI_URL     = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
DATABASE_URL   = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

CORS_ORIGINS   = os.getenv("CORS_ORIGINS", "*")
cors_list      = [o.strip() for o in CORS_ORIGINS.split(",")] if CORS_ORIGINS != "*" else "*"
FRONTEND_URL   = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config.update(
    SECRET_KEY                    = os.getenv("SECRET_KEY", "dev-secret"),
    JWT_SECRET_KEY                = os.getenv("JWT_SECRET_KEY", "jwt-dev-secret"),
    JWT_ACCESS_TOKEN_EXPIRES      = 3600,
    JWT_REFRESH_TOKEN_EXPIRES     = 60 * 60 * 24 * 30,
    SQLALCHEMY_DATABASE_URI       = DATABASE_URL or f"sqlite:///{DB_PATH}",
    SQLALCHEMY_TRACK_MODIFICATIONS= False,
    MAX_CONTENT_LENGTH            = 30 * 1024 * 1024,
    UPLOAD_FOLDER                 = UPLOAD_FOLDER,
)

CORS(app, resources={r"/api/*": {"origins": cors_list}})
db      = SQLAlchemy(app)
jwt     = JWTManager(app)
limiter = Limiter(get_remote_address, app=app, storage_uri="memory://", default_limits=[])
log     = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class User(db.Model):
    __tablename__ = "users"
    id            = db.Column(db.Integer,     primary_key=True)
    email         = db.Column(db.String(255), unique=True, nullable=False)
    username      = db.Column(db.String(80),  unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at    = db.Column(db.DateTime,    default=lambda: datetime.now(timezone.utc))
    messages      = db.relationship("Message", backref="user", lazy=True)

    def set_password(self, pw):   self.password_hash = generate_password_hash(pw)
    def check_password(self, pw): return check_password_hash(self.password_hash, pw)
    def to_dict(self):
        total    = len(self.messages)
        successes= sum(1 for m in self.messages if m.outcome == "success")
        failures = sum(1 for m in self.messages if m.outcome == "failure")
        return {
            "id": self.id, "email": self.email, "username": self.username,
            "stats": {"total": total, "successes": successes, "failures": failures,
                      "pending": total - successes - failures},
            "created_at": self.created_at.isoformat(),
        }


class Message(db.Model):
    __tablename__  = "messages"
    id             = db.Column(db.Integer,     primary_key=True)
    user_id        = db.Column(db.Integer,     db.ForeignKey("users.id"), nullable=False)
    business_name  = db.Column(db.String(200), nullable=False)
    business_field = db.Column(db.String(200), nullable=False)
    generated_text = db.Column(db.Text,        nullable=False)
    outcome        = db.Column(db.String(20),  nullable=True)   # 'success' | 'failure' | None
    outcome_note   = db.Column(db.Text,        nullable=True)
    image_count    = db.Column(db.Integer,     default=3)
    created_at     = db.Column(db.DateTime,    default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id, "business_name": self.business_name,
            "business_field": self.business_field,
            "generated_text": self.generated_text,
            "outcome": self.outcome, "outcome_note": self.outcome_note,
            "image_count": self.image_count,
            "created_at": self.created_at.isoformat(),
        }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def allowed(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT

def get_user():
    return db.session.get(User, int(get_jwt_identity()))

def encode_image(path):
    with open(path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode()

def mime_type(path):
    ext = path.rsplit(".", 1)[-1].lower()
    return "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"

def get_outcome_context(user):
    """
    Builds a learning prompt segment from past successes and failures.
    Tells Claude what patterns have worked and failed for this specific user.
    """
    messages  = Message.query.filter_by(user_id=user.id).order_by(Message.created_at.desc()).limit(30).all()
    successes = [m for m in messages if m.outcome == "success"]
    failures  = [m for m in messages if m.outcome == "failure"]

    if not successes and not failures:
        return ""

    parts = ["Based on this user's track record with past messages:\n"]

    if successes:
        parts.append(f"MESSAGES THAT WORKED ({len(successes)} successes):")
        for m in successes[:5]:
            note = f" — Note: {m.outcome_note}" if m.outcome_note else ""
            parts.append(f"  • {m.business_field} business '{m.business_name}'{note}")
            # Show first 200 chars of winning message style
            parts.append(f"    Style: \"{m.generated_text[:200]}...\"")

    if failures:
        parts.append(f"\nMESSAGES THAT FAILED ({len(failures)} failures):")
        for m in failures[:5]:
            note = f" — Note: {m.outcome_note}" if m.outcome_note else ""
            parts.append(f"  • {m.business_field} business '{m.business_name}'{note}")
            parts.append(f"    Style: \"{m.generated_text[:200]}...\"")

    if successes:
        parts.append("\nMaintain and refine what made the successful messages work.")
    if failures:
        parts.append("Avoid the patterns and tone present in the failed messages.")

    return "\n".join(parts)


def call_gemini(images, business_name, business_field, outcome_context):
    """
    Calls Google Gemini (free tier) with the Instagram images and business info.
    Returns the generated pitch message as a string.
    """
    if not GEMINI_KEY:
        return generate_demo_message(business_name, business_field)

    learning_section = f"\n\n{outcome_context}\n" if outcome_context else ""

    prompt = f"""You are an expert social media marketing consultant writing a cold outreach DM to a business on Instagram.

Business name: {business_name}
Business field / industry: {business_field}
{learning_section}
I have provided images from their Instagram account (their profile and recent posts). Analyze them carefully.

Write a SHORT, personalized Instagram DM (under 150 words) that:

1. Opens with ONE specific, genuine compliment about something you actually see in their posts or profile — be specific, not generic. Reference something real you can see.

2. Points out ONE specific thing they could improve about their current Instagram content or posting strategy — frame this constructively, not as criticism. Reference something specific you observed.

3. Explains briefly how fixing that ONE thing could improve their reach, engagement, or customer growth — keep this concrete, 1-2 sentences max.

4. Offers ONE free post as a no-risk way to show what's possible — make this feel like a low-pressure gift, not a sales pitch.

5. Ends with a simple, easy call to action — one question or one short sentence.

Write ONLY the DM message itself. No subject line, no preamble, no explanation. Just the raw message text they can copy and send.

Keep the tone warm, human, and conversational — not corporate. Sound like a real person who genuinely noticed something about their account, not a template."""

    # Build Gemini content parts — images first, then the prompt text
    parts = []
    for path in images:
        parts.append({
            "inline_data": {
                "mime_type": mime_type(path),
                "data":      encode_image(path),
            }
        })
    parts.append({"text": prompt})

    response = requests.post(
        GEMINI_URL,
        params={"key": GEMINI_KEY},
        headers={"Content-Type": "application/json"},
        json={
            "contents": [{"parts": parts}],
            "generationConfig": {
                "maxOutputTokens": 500,
                "temperature":     0.8,
            },
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def generate_demo_message(business_name, business_field):
    """Realistic demo message when no Anthropic key is set."""
    return (
        f"Hey {business_name}! 👋\n\n"
        f"Just came across your page — really love the authenticity in your content. "
        f"The way you're showing the behind-the-scenes of your {business_field} business is genuinely refreshing.\n\n"
        f"One thing I noticed: your captions are doing a lot of the heavy lifting, "
        f"but the posting times look a little inconsistent — that alone can quietly kill reach even when the content is great.\n\n"
        f"Fixing the scheduling could realistically double your organic reach within 30 days, "
        f"just by hitting when your audience is actually online.\n\n"
        f"I'd love to put together one free post for you — fully designed, captioned, and scheduled — "
        f"so you can see the difference without any commitment.\n\n"
        f"Worth a quick chat? 🙌"
    )

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@app.route("/api/auth/register", methods=["POST"])
@limiter.limit("5 per hour")
def register():
    import re
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email")    or "").strip().lower()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "")

    errors = {}
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):  errors["email"]    = "Enter a valid email."
    if not re.match(r"^[a-zA-Z0-9_]{3,20}$", username):     errors["username"] = "3–20 chars: letters, numbers, underscore."
    if len(password) < 6:                                     errors["password"] = "At least 6 characters."
    if errors: return jsonify({"errors": errors}), 422

    if User.query.filter_by(email=email).first():    return jsonify({"errors": {"email":    "Email already registered."}}), 409
    if User.query.filter_by(username=username).first(): return jsonify({"errors": {"username": "Username taken."}}), 409

    user = User(email=email, username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({
        "user":          user.to_dict(),
        "access_token":  create_access_token(identity=str(user.id)),
        "refresh_token": create_refresh_token(identity=str(user.id)),
    }), 201


@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per hour")
def login():
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email")    or "").strip().lower()
    password = (data.get("password") or "")
    user     = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password."}), 401
    return jsonify({
        "user":          user.to_dict(),
        "access_token":  create_access_token(identity=str(user.id)),
        "refresh_token": create_refresh_token(identity=str(user.id)),
    })


@app.route("/api/auth/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    return jsonify({"access_token": create_access_token(identity=str(get_jwt_identity()))})


@app.route("/api/me", methods=["GET"])
@jwt_required()
def me():
    user = get_user()
    if not user: return jsonify({"error": "Not found."}), 404
    return jsonify({"user": user.to_dict()})

# ---------------------------------------------------------------------------
# Generate
# ---------------------------------------------------------------------------
@app.route("/api/generate", methods=["POST"])
@jwt_required()
@limiter.limit("30 per hour")
def generate():
    user = get_user()
    if not user: return jsonify({"error": "Not found."}), 404

    business_name  = (request.form.get("business_name")  or "").strip()
    business_field = (request.form.get("business_field") or "").strip()

    if not business_name:  return jsonify({"error": "Business name is required."}), 400
    if not business_field: return jsonify({"error": "Business field is required."}), 400

    # Accept 1–3 images (profile + up to 2 posts)
    uploaded_paths = []
    for key in ["image_profile", "image_post1", "image_post2"]:
        f = request.files.get(key)
        if f and allowed(f.filename):
            ext  = f.filename.rsplit(".", 1)[1].lower()
            name = f"{uuid.uuid4().hex}.{ext}"
            path = os.path.join(app.config["UPLOAD_FOLDER"], name)
            f.save(path)
            uploaded_paths.append(path)

    if not uploaded_paths:
        return jsonify({"error": "Upload at least one image (the Instagram profile screenshot)."}), 400

    # Build outcome context from past messages for this user
    outcome_context = get_outcome_context(user)

    try:
        message_text = call_gemini(uploaded_paths, business_name, business_field, outcome_context)
    except requests.exceptions.HTTPError as e:
        log.warning(f"Claude API error: {e}")
        return jsonify({"error": "AI generation failed. Check your ANTHROPIC_API_KEY."}), 502
    except Exception as e:
        log.warning(f"Generation error: {e}")
        message_text = generate_demo_message(business_name, business_field)

    # Save to DB
    msg = Message(
        user_id        = user.id,
        business_name  = business_name,
        business_field = business_field,
        generated_text = message_text,
        image_count    = len(uploaded_paths),
    )
    db.session.add(msg)
    db.session.commit()

    # Clean up uploaded files
    for path in uploaded_paths:
        try: os.remove(path)
        except: pass

    return jsonify({"message": msg.to_dict(), "user": user.to_dict()}), 201

# ---------------------------------------------------------------------------
# Messages + Outcomes
# ---------------------------------------------------------------------------
@app.route("/api/messages", methods=["GET"])
@jwt_required()
def list_messages():
    user = get_user()
    msgs = (Message.query
            .filter_by(user_id=user.id)
            .order_by(Message.created_at.desc())
            .limit(100).all())
    return jsonify({"messages": [m.to_dict() for m in msgs]})


@app.route("/api/messages/<int:msg_id>", methods=["GET"])
@jwt_required()
def get_message(msg_id):
    user = get_user()
    msg  = Message.query.filter_by(id=msg_id, user_id=user.id).first()
    if not msg: return jsonify({"error": "Not found."}), 404
    return jsonify({"message": msg.to_dict()})


@app.route("/api/messages/<int:msg_id>/outcome", methods=["POST"])
@jwt_required()
def set_outcome(msg_id):
    user    = get_user()
    msg     = Message.query.filter_by(id=msg_id, user_id=user.id).first()
    if not msg: return jsonify({"error": "Not found."}), 404

    data    = request.get_json(silent=True) or {}
    outcome = (data.get("outcome") or "").lower()
    note    = (data.get("note")    or "").strip()

    if outcome not in ("success", "failure"):
        return jsonify({"error": "outcome must be 'success' or 'failure'."}), 400

    msg.outcome      = outcome
    msg.outcome_note = note or None
    db.session.commit()

    log.info(f"User {user.id} marked message {msg_id} as {outcome}")
    return jsonify({"message": msg.to_dict(), "user": user.to_dict()})

# ---------------------------------------------------------------------------
# Health + init
# ---------------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "ai":     bool(GEMINI_KEY),
        "model":  GEMINI_MODEL if GEMINI_KEY else "demo",
        "db":     "postgres" if DATABASE_URL else "sqlite",
        "time":   datetime.now(timezone.utc).isoformat(),
    })

@app.errorhandler(413)
def too_large(e): return jsonify({"error": "Images too large. Max 30 MB total."}), 413

@app.errorhandler(404)
def not_found(e): return jsonify({"error": "Endpoint not found."}), 404

@app.errorhandler(500)
def internal(e):
    log.exception(e)
    return jsonify({"error": "Internal server error."}), 500

with app.app_context():
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    db.create_all()

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5001))
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
