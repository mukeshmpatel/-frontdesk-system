import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class CustomerProfile(Base):
    __tablename__ = "cdp_customer_profiles"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(index=True)
    customer_ref: Mapped[str] = mapped_column(String(128))
    email_ciphertext: Mapped[str | None] = mapped_column(Text)
    phone_ciphertext: Mapped[str | None] = mapped_column(Text)
    email_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    phone_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    total_hotel_spend: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    total_restaurant_spend: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    hotel_nights: Mapped[int] = mapped_column(default=0)
    restaurant_visits: Mapped[int] = mapped_column(default=0)
    cohort_tags: Mapped[list] = mapped_column(JSON, default=list)
    consent_marketing: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_personalization: Mapped[bool] = mapped_column(Boolean, default=False)
    suppressed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    __table_args__ = (UniqueConstraint("tenant_id", "property_id", "customer_ref"),)


class IdentityLink(Base):
    __tablename__ = "cdp_identity_links"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(index=True)
    anonymous_id: Mapped[str] = mapped_column(String(128))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cdp_customer_profiles.id"))
    verified_source: Mapped[str] = mapped_column(String(40))
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("tenant_id", "property_id", "anonymous_id"),)


class TrackingEvent(Base):
    __tablename__ = "cdp_tracking_events"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128))
    event_name: Mapped[str] = mapped_column(String(120), index=True)
    anonymous_id: Mapped[str] = mapped_column(String(128), index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("cdp_customer_profiles.id"), index=True)
    source: Mapped[str] = mapped_column(String(40))
    properties: Mapped[dict] = mapped_column(JSON)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (
        UniqueConstraint("tenant_id", "property_id", "idempotency_key"),
        Index("cdp_event_scope_time", "tenant_id", "property_id", "occurred_at"),
    )


class Transaction(Base):
    __tablename__ = "cdp_transactions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(index=True)
    external_transaction_id: Mapped[str] = mapped_column(String(160))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cdp_customer_profiles.id"), index=True)
    amount_spent: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    department: Mapped[str] = mapped_column(String(30))
    items_purchased: Mapped[list] = mapped_column(JSON)
    business_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("tenant_id", "property_id", "external_transaction_id"),)


class ActivationRequest(Base):
    __tablename__ = "cdp_activation_requests"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cdp_customer_profiles.id"))
    channel: Mapped[str] = mapped_column(String(40), index=True)
    action: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(40), default="NEEDS_REVIEW", index=True)
    risk_level: Mapped[str] = mapped_column(String(20), default="HIGH")
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True)
    approved_by: Mapped[str | None] = mapped_column(String(160))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AuditRecord(Base):
    __tablename__ = "cdp_audit_records"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(index=True)
    actor: Mapped[str] = mapped_column(String(160))
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str] = mapped_column(String(128))
    detail: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
