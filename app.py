import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from models import db, Transaction
from datetime import datetime

app = Flask(__name__)

# Detect Vercel environment
is_vercel = os.environ.get("VERCEL", False) or os.environ.get("VERCEL_ENV", False)

if is_vercel:
    # On Vercel: use PostgreSQL if DATABASE_URL is set, otherwise SQLite in /tmp
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        app.config["SQLALCHEMY_DATABASE_URI"] = database_url.replace("postgres://", "postgresql://")
    else:
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:////tmp/finance.db"
else:
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///finance.db"

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
    transactions = Transaction.query.order_by(Transaction.date.desc()).all()
    return jsonify([t.to_dict() for t in transactions])


@app.route("/api/transactions", methods=["POST"])
def create_transaction():
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


@app.route("/api/transactions/sync", methods=["POST"])
def sync_transactions():
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


@app.route("/api/transactions/<int:id>", methods=["DELETE"])
def delete_transaction(id):
    t = Transaction.query.get_or_404(id)
    db.session.delete(t)
    db.session.commit()
    return jsonify({"message": "Supprime"})


@app.route("/api/transactions/<int:id>", methods=["PUT"])
def update_transaction(id):
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(debug=True, host="0.0.0.0", port=port)
