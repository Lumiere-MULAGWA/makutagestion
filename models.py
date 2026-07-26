from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
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
            'id': self.id,
            'type': self.type,
            'amount_usd': self.amount_usd or 0,
            'amount_cdf': self.amount_cdf or 0,
            'description': self.description,
            'category': self.category,
            'date': self.date,
            'synced': self.synced,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'client_id': self.client_id,
        }
