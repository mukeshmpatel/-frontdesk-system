from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from .models import ActivationRequest, CustomerProfile, TrackingEvent, Transaction


async def decision_summary(session: AsyncSession, tenant_id, property_id) -> dict:
    scope = (tenant_id, property_id)
    customers = await session.scalar(select(func.count(CustomerProfile.id)).where(CustomerProfile.tenant_id == scope[0], CustomerProfile.property_id == scope[1])) or 0
    events = await session.scalar(select(func.count(TrackingEvent.id)).where(TrackingEvent.tenant_id == scope[0], TrackingEvent.property_id == scope[1])) or 0
    revenue = await session.scalar(select(func.coalesce(func.sum(Transaction.amount_spent), 0)).where(Transaction.tenant_id == scope[0], Transaction.property_id == scope[1])) or 0
    approvals = await session.scalar(select(func.count(ActivationRequest.id)).where(ActivationRequest.tenant_id == scope[0], ActivationRequest.property_id == scope[1], ActivationRequest.status == "NEEDS_REVIEW")) or 0
    return {"customers": customers, "events": events, "attributed_revenue": float(revenue), "pending_approvals": approvals}
