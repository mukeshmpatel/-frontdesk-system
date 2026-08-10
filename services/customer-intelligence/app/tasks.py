import asyncio
import hashlib
import secrets
from datetime import datetime
from decimal import Decimal
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from .cohorts import calculate_cohorts
from .database import SessionLocal
from .models import AuditRecord, CustomerProfile, IdentityLink, TrackingEvent, Transaction
from .queue import celery_app


def run(coroutine):
    return asyncio.run(coroutine)


async def _process_tracking_event(payload: dict) -> dict:
    async with SessionLocal() as session:
        existing = await session.scalar(select(TrackingEvent).where(
            TrackingEvent.tenant_id == payload["tenant_id"],
            TrackingEvent.property_id == payload["property_id"],
            TrackingEvent.idempotency_key == payload["idempotency_key"],
        ))
        if existing:
            return {"status": "DUPLICATE", "event_id": str(existing.id)}
        customer_id = payload.get("customer_id")
        if customer_id:
            profile = await session.get(CustomerProfile, customer_id)
            if not profile or str(profile.tenant_id) != payload["tenant_id"] or str(profile.property_id) != payload["property_id"]:
                raise ValueError("Customer is not authorized for the supplied tenant/property scope.")
            link = await session.scalar(select(IdentityLink).where(
                IdentityLink.tenant_id == payload["tenant_id"],
                IdentityLink.property_id == payload["property_id"],
                IdentityLink.anonymous_id == payload["anonymous_id"],
            ))
            if link and str(link.customer_id) != customer_id:
                raise ValueError("Anonymous identity is already linked to a different verified customer.")
            if not link:
                session.add(IdentityLink(
                    tenant_id=payload["tenant_id"], property_id=payload["property_id"],
                    anonymous_id=payload["anonymous_id"], customer_id=customer_id,
                    verified_source=payload["source"],
                ))
            await session.execute(update(TrackingEvent).where(
                TrackingEvent.tenant_id == payload["tenant_id"],
                TrackingEvent.property_id == payload["property_id"],
                TrackingEvent.anonymous_id == payload["anonymous_id"],
                TrackingEvent.customer_id.is_(None),
            ).values(customer_id=customer_id))
        event = TrackingEvent(
            tenant_id=payload["tenant_id"], property_id=payload["property_id"],
            idempotency_key=payload["idempotency_key"], event_name=payload["event_name"],
            anonymous_id=payload["anonymous_id"], customer_id=customer_id,
            source=payload["source"], properties=payload["properties"],
            occurred_at=datetime.fromisoformat(payload["timestamp"].replace("Z", "+00:00")),
        )
        session.add(event)
        session.add(AuditRecord(
            tenant_id=payload["tenant_id"], property_id=payload["property_id"],
            actor="event-worker", event_type="CDP_EVENT_INGESTED",
            entity_type="tracking_event", entity_id=str(event.id),
            detail={"event_name": payload["event_name"], "identity_stitched": bool(customer_id)},
        ))
        if customer_id:
            await calculate_cohorts(session, profile)
        await session.commit()
        return {"status": "PROCESSED", "event_id": str(event.id)}


@celery_app.task(name="app.tasks.process_tracking_event", bind=True, autoretry_for=(ConnectionError,), retry_backoff=True, max_retries=5)
def process_tracking_event(self, payload: dict) -> dict:
    try:
        return run(_process_tracking_event(payload))
    except IntegrityError:
        return {"status": "DUPLICATE", "idempotency_key": payload["idempotency_key"]}


async def _process_transaction(payload: dict) -> dict:
    async with SessionLocal() as session:
        existing = await session.scalar(select(Transaction).where(
            Transaction.tenant_id == payload["tenant_id"],
            Transaction.property_id == payload["property_id"],
            Transaction.external_transaction_id == payload["external_transaction_id"],
        ))
        if existing:
            return {"status": "DUPLICATE", "transaction_id": str(existing.id)}
        profile = await session.get(CustomerProfile, payload["customer_id"])
        if not profile or str(profile.tenant_id) != payload["tenant_id"] or str(profile.property_id) != payload["property_id"]:
            raise ValueError("Customer is not authorized for the supplied tenant/property scope.")
        amount = Decimal(payload["amount_spent"])
        transaction = Transaction(
            tenant_id=payload["tenant_id"], property_id=payload["property_id"],
            external_transaction_id=payload["external_transaction_id"],
            customer_id=payload["customer_id"], amount_spent=amount,
            department=payload["department"], items_purchased=payload["items_purchased"],
            business_date=datetime.fromisoformat(payload["business_date"].replace("Z", "+00:00")),
            source=payload["source"],
        )
        session.add(transaction)
        if payload["department"] == "hotel":
            profile.total_hotel_spend += amount
            profile.hotel_nights += 1
        else:
            profile.total_restaurant_spend += amount
            profile.restaurant_visits += 1
        tags = await calculate_cohorts(session, profile)
        invitation_due = payload["department"] == "restaurant" and profile.total_restaurant_spend >= Decimal("200")
        session.add(AuditRecord(
            tenant_id=payload["tenant_id"], property_id=payload["property_id"],
            actor="transaction-worker", event_type="CDP_TRANSACTION_INGESTED",
            entity_type="transaction", entity_id=str(transaction.id),
            detail={"department": payload["department"], "amount": str(amount), "cohorts": tags, "loyalty_invitation_due": invitation_due},
        ))
        await session.commit()
        return {
            "status": "PROCESSED", "transaction_id": str(transaction.id),
            "cohort_tags": tags, "loyalty_invitation_due": invitation_due,
            "suggested_discount_code": f"AAIQ-{secrets.token_hex(4).upper()}" if invitation_due else None,
        }


@celery_app.task(name="app.tasks.process_transaction", bind=True, autoretry_for=(ConnectionError,), retry_backoff=True, max_retries=5)
def process_transaction(self, payload: dict) -> dict:
    try:
        return run(_process_transaction(payload))
    except IntegrityError:
        return {"status": "DUPLICATE", "external_transaction_id": payload["external_transaction_id"]}
