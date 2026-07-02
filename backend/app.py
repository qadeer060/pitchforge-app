"""
PitchForge Backend
==================
Flask + SQLite + JWT + Google Gemini (free tier)

Endpoints
---------
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
GET  /api/me

POST /api/generate           — upload images + business info → pitch message
GET  /api/messages           — list user's messages
POST /api/messages/<id>/outcome — mark success or failure

GET  /api/health
"""

import os, uuid, base64, logging, requests, re
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

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
DB_PATH       = os.path.join(BASE_DIR, "pitchforge.db")
ALLOWED_EXT   = {"png", "jpg", "jpeg", "webp"}

GEMINI_KEY    = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL  = "gemini-2.0-flash"
GEMINI_URL    = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

DATABASE_URL  = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

CORS_ORIGINS  = os.getenv("CORS_ORIGINS", "*")
cors_list     = [o.strip() for o in CORS_ORIGINS.split(",")] if CORS_ORIGINS != "*" else "*"

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config.update(
    SECRET_KEY                     = os.getenv("SECRET_KEY", "dev-secret-changeme"),
    JWT_SECRET_KEY                 = os.getenv("JWT_SECRET_KEY", "jwt-secret-changeme"),
    JWT_ACCESS_TOKEN_EXPIRES       = 3600,
    JWT_REFRESH_TOKEN_EXPIRES      = 60 * 60 * 24 * 30,
    SQLALCHEMY_DATABASE_URI        = DATABASE_URL or f"sqlite:///{DB_PATH}",
    SQLALCHEMY_TRACK_MODIFICATIONS = False,
    MAX_CONTENT_LENGTH             = 30 * 1024 * 1024,
    UPLOAD_FOLDER                  = UPLOAD_FOLDER,
)

CORS(app, resources={r"/api/*": {"origins": cors_list}})
db      = SQLAlchemy(app)
jwt     = JWTManager(app)
limiter = Limiter(get_remote_address, app=app, storage_uri="memory://", default_limits=[])
logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

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
        total     = len(self.messages)
        successes = sum(1 for m in self.messages if m.outcome == "success")
        failures  = sum(1 for m in self.messages if m.outcome == "failure")
        return {
            "id": self.id, "email": self.email, "username": self.username,
            "stats": {
                "total": total, "successes": successes,
                "failures": failures, "pending": total - successes - failures,
            },
            "created_at": self.created_at.isoformat(),
        }


class Message(db.Model):
    __tablename__  = "messages"
    id             = db.Column(db.Integer,     primary_key=True)
    user_id        = db.Column(db.Integer,     db.ForeignKey("users.id"), nullable=False)
    business_name  = db.Column(db.String(200), nullable=False)
    business_field = db.Column(db.String(200), nullable=False)
    custom_goal    = db.Column(db.String(400), nullable=True)
    generated_text = db.Column(db.Text,        nullable=False)
    outcome        = db.Column(db.String(20),  nullable=True)
    outcome_note   = db.Column(db.Text,        nullable=True)
    created_at     = db.Column(db.DateTime,    default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "business_name": self.business_name,
            "business_field": self.business_field,
            "custom_goal": self.custom_goal,
            "generated_text": self.generated_text,
            "outcome": self.outcome,
            "outcome_note": self.outcome_note,
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

def get_mime(path):
    ext = path.rsplit(".", 1)[-1].lower()
    return "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"

def build_outcome_context(user):
    """Pull last 30 messages and build a learning block for the prompt."""
    msgs      = Message.query.filter_by(user_id=user.id).order_by(Message.created_at.desc()).limit(30).all()
    successes = [m for m in msgs if m.outcome == "success"]
    failures  = [m for m in msgs if m.outcome == "failure"]
    if not successes and not failures:
        return ""

    lines = ["Based on this salesperson's track record:\n"]
    if successes:
        lines.append(f"MESSAGES THAT GOT REPLIES ({len(successes)}):")
        for m in successes[:5]:
            note = f" — {m.outcome_note}" if m.outcome_note else ""
            lines.append(f"  • {m.business_field} / {m.business_name}{note}")
            lines.append(f"    Opening style: \"{m.generated_text[:180]}...\"")
        lines.append("Reinforce and refine what made these work.\n")
    if failures:
        lines.append(f"MESSAGES THAT GOT NO REPLY ({len(failures)}):")
        for m in failures[:5]:
            note = f" — {m.outcome_note}" if m.outcome_note else ""
            lines.append(f"  • {m.business_field} / {m.business_name}{note}")
            lines.append(f"    Opening style: \"{m.generated_text[:180]}...\"")
        lines.append("Avoid patterns from these messages.\n")
    return "\n".join(lines)

# ---------------------------------------------------------------------------
# AI generation
# ---------------------------------------------------------------------------
PITCH_PROMPT_DEFAULT = """You are an expert social media marketer writing a cold Instagram DM for a freelancer pitching to this business.

Business name: {business_name}
Industry: {business_field}
{context}
I've attached screenshots from their Instagram account — their profile page and up to 2 recent posts. Study them carefully before writing.

Write a SHORT personalised Instagram DM (under 150 words) that does exactly these 4 things:

1. ONE specific compliment — reference something real and visible in their actual posts or profile. Not generic praise.
2. ONE specific improvement — something constructive you noticed they could do better. Be specific, not vague.
3. ONE sentence on how fixing that would help their reach or growth.
4. Offer ONE free post — low pressure, framed as a gift not a sales pitch. End with one simple question.

Rules:
- Write ONLY the message. No intro, no subject line, no explanation, no "Here's the DM:".
- Sound like a real human, not a template or a robot.
- Warm and conversational tone throughout."""

PITCH_PROMPT_CUSTOM = """You are an expert outreach specialist writing a cold Instagram DM on behalf of someone with a specific goal.

Business name: {business_name}
Industry: {business_field}
Your goal / offer: {custom_goal}
{context}
I've attached screenshots from their Instagram account — their profile page and up to 2 recent posts. Study them carefully before writing.

Write a SHORT personalised Instagram DM (under 150 words) that does exactly these 4 things:

1. ONE specific compliment — reference something real and visible in their actual posts or profile. Not generic praise.
2. ONE specific improvement — something constructive you noticed they could do better. Be specific, not vague.
3. ONE sentence on how fixing that would help their reach or growth.
4. Naturally lead into your goal: {custom_goal} — make it feel relevant to what you just said, not bolted on. End with one simple question.

Rules:
- Write ONLY the message. No intro, no subject line, no explanation, no "Here's the DM:".
- Sound like a real human, not a template or a robot.
- Warm and conversational tone throughout.
- The offer or ask must feel like a natural extension of the compliment and improvement, not a separate pitch."""


def generate_with_gemini(image_paths, business_name, business_field, outcome_context, custom_goal=""):
    """Call Gemini with images + prompt. Falls back to demo if no key."""
    if not GEMINI_KEY:
        return demo_message(business_name, business_field, custom_goal)

    parts = []
    for path in image_paths:
        parts.append({
            "inline_data": {
                "mime_type": get_mime(path),
                "data":      encode_image(path),
            }
        })

    if custom_goal:
        prompt_text = PITCH_PROMPT_CUSTOM.format(
            business_name  = business_name,
            business_field = business_field,
            custom_goal    = custom_goal,
            context        = f"\n{outcome_context}\n" if outcome_context else "",
        )
    else:
        prompt_text = PITCH_PROMPT_DEFAULT.format(
            business_name  = business_name,
            business_field = business_field,
            context        = f"\n{outcome_context}\n" if outcome_context else "",
        )

    parts.append({"text": prompt_text})

    resp = requests.post(
        GEMINI_URL,
        params  = {"key": GEMINI_KEY},
        headers = {"Content-Type": "application/json"},
        json    = {
            "contents": [{"parts": parts}],
            "generationConfig": {"maxOutputTokens": 500, "temperature": 0.85},
        },
        timeout = 60,
    )
    resp.raise_for_status()
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


def demo_message(business_name, business_field, custom_goal=""):
    if custom_goal:
        return (
            f"Hey {business_name}! 👋\n\n"
            f"Just came across your page — love the energy in your {business_field} content. "
            f"The way you're showing up consistently really stands out.\n\n"
            f"One thing I noticed: your captions are strong but the posting schedule looks a bit inconsistent "
            f"— that alone can quietly cut your reach in half even when the content is great.\n\n"
            f"Fixing the timing could realistically double your organic reach within a month.\n\n"
            f"Reason I'm reaching out — {custom_goal}. Given what I see on your page I think there could be a real fit here.\n\n"
            f"Would you be open to a quick chat about it? 🙌"
        )
    return (
        f"Hey {business_name}! 👋\n\n"
        f"Just came across your page — love the energy in your {business_field} content. "
        f"The behind-the-scenes stuff especially stands out.\n\n"
        f"One thing I noticed: your captions are strong but the posting schedule looks inconsistent "
        f"— that alone can quietly cut your reach in half.\n\n"
        f"Fixing the timing could realistically double your organic reach within a month "
        f"just by hitting when your audience is actually scrolling.\n\n"
        f"I'd love to put together one free post for you — fully designed and captioned — "
        f"so you can see what I mean without any commitment.\n\n"
        f"Would that be worth a look? 🙌"
    )

# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@app.route("/api/auth/register", methods=["POST"])
@limiter.limit("5 per hour")
def register():
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email")    or "").strip().lower()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "")

    errors = {}
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        errors["email"] = "Enter a valid email."
    if not re.match(r"^[a-zA-Z0-9_]{3,20}$", username):
        errors["username"] = "3–20 chars: letters, numbers, underscore."
    if len(password) < 6:
        errors["password"] = "At least 6 characters."
    if errors:
        return jsonify({"errors": errors}), 422

    if User.query.filter_by(email=email).first():
        return jsonify({"errors": {"email": "Email already registered."}}), 409
    if User.query.filter_by(username=username).first():
        return jsonify({"errors": {"username": "Username taken."}}), 409

    user = User(email=email, username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    log.info(f"Registered: {username}")

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
    return jsonify({
        "access_token": create_access_token(identity=str(get_jwt_identity()))
    })


@app.route("/api/me", methods=["GET"])
@jwt_required()
def me():
    user = get_user()
    if not user:
        return jsonify({"error": "Not found."}), 404
    return jsonify({"user": user.to_dict()})

# ---------------------------------------------------------------------------
# Generate route
# ---------------------------------------------------------------------------
@app.route("/api/generate", methods=["POST"])
@jwt_required()
@limiter.limit("30 per hour")
def generate():
    user = get_user()
    if not user:
        return jsonify({"error": "Not found."}), 404

    business_name  = (request.form.get("business_name")  or "").strip()
    business_field = (request.form.get("business_field") or "").strip()
    custom_goal    = (request.form.get("custom_goal")    or "").strip()

    if not business_name:
        return jsonify({"error": "Business name is required."}), 400
    if not business_field:
        return jsonify({"error": "Business field is required."}), 400

    saved_paths = []
    for key in ["image_profile", "image_post1", "image_post2"]:
        f = request.files.get(key)
        if f and allowed(f.filename):
            ext  = f.filename.rsplit(".", 1)[1].lower()
            name = f"{uuid.uuid4().hex}.{ext}"
            path = os.path.join(app.config["UPLOAD_FOLDER"], name)
            f.save(path)
            saved_paths.append(path)

    if not saved_paths:
        return jsonify({"error": "Upload at least the profile screenshot."}), 400

    outcome_context = build_outcome_context(user)

    try:
        text = generate_with_gemini(saved_paths, business_name, business_field, outcome_context, custom_goal)
    except requests.exceptions.HTTPError as e:
        log.warning(f"Gemini error: {e}")
        text = demo_message(business_name, business_field, custom_goal)
    except Exception as e:
        log.warning(f"Generation error: {e}")
        text = demo_message(business_name, business_field, custom_goal)
    finally:
        for path in saved_paths:
            try: os.remove(path)
            except: pass

    msg = Message(
        user_id        = user.id,
        business_name  = business_name,
        business_field = business_field,
        custom_goal    = custom_goal or None,
        generated_text = text,
    )
    db.session.add(msg)
    db.session.commit()

    return jsonify({"message": msg.to_dict(), "user": user.to_dict()}), 201

# ---------------------------------------------------------------------------
# Messages + outcome routes
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


@app.route("/api/messages/<int:msg_id>/outcome", methods=["POST"])
@jwt_required()
def set_outcome(msg_id):
    user = get_user()
    msg  = Message.query.filter_by(id=msg_id, user_id=user.id).first()
    if not msg:
        return jsonify({"error": "Not found."}), 404

    data    = request.get_json(silent=True) or {}
    outcome = (data.get("outcome") or "").lower()
    note    = (data.get("note")    or "").strip()

    if outcome not in ("success", "failure"):
        return jsonify({"error": "outcome must be 'success' or 'failure'."}), 400

    msg.outcome      = outcome
    msg.outcome_note = note or None
    db.session.commit()
    log.info(f"Message {msg_id} marked {outcome}")
    return jsonify({"message": msg.to_dict(), "user": user.to_dict()})

# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "ai":     bool(GEMINI_KEY),
        "model":  GEMINI_MODEL if GEMINI_KEY else "demo-mode",
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

# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------
with app.app_context():
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    db.create_all()
    # Migrate existing databases — add custom_goal column if it doesn't exist yet
    try:
        with db.engine.connect() as conn:
            conn.execute(db.text("ALTER TABLE messages ADD COLUMN custom_goal VARCHAR(400)"))
            conn.commit()
            log.info("Migration: added custom_goal column to messages table.")
    except Exception:
        pass  # Column already exists — nothing to do

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5001))
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
