import os
import secrets
from urllib.parse import quote
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from models import db, User, Transaction
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(
    __name__,
    static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), "static"),
    template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates"),
)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))

database_url = os.environ.get("DATABASE_URL", "")
if database_url:
    database_url = database_url.replace("postgres://", "postgresql://")
    database_url = database_url.split("?")[0]
    parts = database_url.split("@", 1)
    if len(parts) == 2:
        prefix = parts[0]
        suffix = parts[1]
        colon_idx = prefix.rfind(":")
        if colon_idx > 0:
            user = prefix[:colon_idx]
            password = prefix[colon_idx + 1:]
            password = password.strip("[]")
            encoded_password = quote(password, safe="")
            database_url = f"{user}:{encoded_password}@{suffix}"
    database_url += "?sslmode=require"
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
else:
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:////tmp/finance.db"

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
CORS(app, supports_credentials=True)
db.init_app(app)

with app.app_context():
    db.create_all()


def get_user_id():
    return session.get("user_id")


def require_auth():
    uid = get_user_id()
    if not uid:
        return None
    return uid


# ======================== AUTH ========================

@app.route("/api/auth/register", methods=["POST"])
def register():
    try:
        data = request.json
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")
        name = data.get("name", "")

        if not email or not password:
            return jsonify({"error": "Email et mot de passe requis"}), 400
        if len(password) < 4:
            return jsonify({"error": "Mot de passe trop court (4 min)"}), 400

        existing = User.query.filter_by(email=email).first()
        if existing:
            return jsonify({"error": "Cet email est deja utilise"}), 409

        user = User(email=email, name=name)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        session["user_id"] = user.id
        return jsonify({"user": user.to_dict(), "message": "Compte cree avec succes"}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/api/auth/login", methods=["POST"])
def login():
    try:
        data = request.json
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")

        if not email or not password:
            return jsonify({"error": "Email et mot de passe requis"}), 400

        user = User.query.filter_by(email=email).first()
        if not user or not user.check_password(password):
            return jsonify({"error": "Email ou mot de passe incorrect"}), 401

        session["user_id"] = user.id
        return jsonify({"user": user.to_dict(), "message": "Connexion reussie"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Deconnexion reussie"})


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    uid = get_user_id()
    if not uid:
        return jsonify({"user": None})
    user = User.query.get(uid)
    if not user:
        session.clear()
        return jsonify({"user": None})
    return jsonify({"user": user.to_dict()})


# ======================== TRANSACTIONS ========================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/transactions", methods=["GET"])
def get_transactions():
    try:
        uid = get_user_id()
        q = Transaction.query
        if uid:
            q = q.filter_by(user_id=uid)
        transactions = q.order_by(Transaction.date.desc()).all()
        return jsonify([t.to_dict() for t in transactions])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/transactions", methods=["POST"])
def create_transaction():
    try:
        uid = get_user_id()
        data = request.json
        t = Transaction(
            user_id=uid,
            type=data["type"],
            amount_usd=data.get("amount_usd", 0),
            amount_cdf=data.get("amount_cdf", 0),
            description=data["description"],
            category=data.get("category", "Autre"),
            date=data["date"],
            synced=True,
            client_id=data.get("client_id", ""),
        )
        db.session.add(t)
        db.session.commit()
        return jsonify(t.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/api/transactions/sync", methods=["POST"])
def sync_transactions():
    try:
        uid = get_user_id()
        data = request.json
        results = []
        for item in data:
            existing = Transaction.query.filter_by(client_id=item.get("client_id")).first()
            if not existing:
                t = Transaction(
                    user_id=uid,
                    type=item["type"],
                    amount_usd=item.get("amount_usd", 0),
                    amount_cdf=item.get("amount_cdf", 0),
                    description=item["description"],
                    category=item.get("category", "Autre"),
                    date=item["date"],
                    synced=True,
                    client_id=item.get("client_id", ""),
                )
                db.session.add(t)
                db.session.flush()
                results.append(t.to_dict())
        db.session.commit()
        return jsonify(results), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/api/transactions/<int:id>", methods=["DELETE"])
def delete_transaction(id):
    try:
        t = Transaction.query.get_or_404(id)
        db.session.delete(t)
        db.session.commit()
        return jsonify({"message": "Supprime"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/api/transactions/<int:id>", methods=["PUT"])
def update_transaction(id):
    try:
        t = Transaction.query.get_or_404(id)
        data = request.json
        t.type = data.get("type", t.type)
        t.amount_usd = data.get("amount_usd", t.amount_usd)
        t.amount_cdf = data.get("amount_cdf", t.amount_cdf)
        t.description = data.get("description", t.description)
        t.category = data.get("category", t.category)
        t.date = data.get("date", t.date)
        db.session.commit()
        return jsonify(t.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(debug=True, host="0.0.0.0", port=port)
