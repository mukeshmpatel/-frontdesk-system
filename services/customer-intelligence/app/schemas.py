from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator

SAFE_PROPERTY_KEYS = {
    "page_url", "page_title", "search_term", "room_type", "menu_category",
    "campaign", "referrer", "currency", "value", "business_date", "nights",
}


class TrackingEventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tenant_id: UUID
    property_id: UUID
    idempotency_key: str = Field(min_length=8, max_length=128)
    event_name: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]{1,119}$")
    anonymous_id: str = Field(min_length=8, max_length=128)
    customer_id: UUID | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: Literal["WEBSITE", "PWA", "WIFI", "PMS", "POS", "MANUAL"] = "WEBSITE"
    properties: dict[str, Any] = Field(default_factory=dict)

    @field_validator("properties")
    @classmethod
    def prevent_pii(cls, value: dict[str, Any]) -> dict[str, Any]:
        rejected = set(value) - SAFE_PROPERTY_KEYS
        if rejected:
            raise ValueError(f"Unsupported or sensitive properties: {', '.join(sorted(rejected))}")
        return value


class TransactionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tenant_id: UUID
    property_id: UUID
    external_transaction_id: str = Field(min_length=4, max_length=160)
    customer_id: UUID
    amount_spent: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    department: Literal["hotel", "restaurant"]
    items_purchased: list[str] = Field(default_factory=list, max_length=100)
    business_date: datetime
    source: Literal["PMS", "POS", "MANUAL"]


class ActivationApproval(BaseModel):
    approved_by: str = Field(min_length=3, max_length=160)
    approval_reason: str = Field(min_length=8, max_length=1000)
