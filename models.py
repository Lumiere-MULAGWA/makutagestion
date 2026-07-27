from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255), default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Transaction(db.Model):
    __tablename__ = "transactions"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    type = db.Column(db.String(10), nullable=False)
    amount_usd = db.Column(db.Float, default=0)
    amount_cdf = db.Column(db.Float, default=0)
    description = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(100), default="Autre")
    date = db.Column(db.String(10), nullable=False)
    synced = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    client_id = db.Column(db.String(100), unique=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "type": self.type,
            "amount_usd": self.amount_usd or 0,
            "amount_cdf": self.amount_cdf or 0,
            "description": self.description,
            "category": self.category,
            "date": self.date,
            "synced": self.synced,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "client_id": self.client_id,
        }
