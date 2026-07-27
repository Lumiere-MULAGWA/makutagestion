import os
from urllib.parse import quote
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from models import db, Transaction
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
CORS(app)
db.init_app(app)

with app.app_context():
    db.create_all()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/transactions", methods=["GET"])
def get_transactions():
    try:
        transactions = Transaction.query.order_by(Transaction.date.desc()).all()
        return jsonify([t.to_dict() for t in transactions])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/transactions", methods=["POST"])
def create_transaction():
    try:
        data = request.json
        t = Transaction(
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
        data = request.json
        results = []
        for item in data:
            existing = Transaction.query.filter_by(client_id=item.get("client_id")).first()
            if not existing:
                t = Transaction(
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
