from decimal import Decimal
from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from .models import CustomerProfile, TrackingEvent, Transaction


async def calculate_cohorts(session: AsyncSession, profile: CustomerProfile) -> list[str]:
    transactions = (await session.execute(
        select(Transaction.department, func.max(Transaction.amount_spent), func.count(Transaction.id))
        .where(Transaction.customer_id == profile.id)
        .group_by(Transaction.department)
    )).all()
    max_hotel = max((Decimal(str(row[1])) for row in transactions if row[0] == "hotel"), default=Decimal("0"))
    max_restaurant = max((Decimal(str(row[1])) for row in transactions if row[0] == "restaurant"), default=Decimal("0"))
    weekday_hotel = await session.scalar(
        select(func.count(Transaction.id)).where(
            Transaction.customer_id == profile.id,
            Transaction.department == "hotel",
            func.extract("isodow", Transaction.business_date).between(1, 4),
        )
    ) or 0
    luxury_events = await session.scalar(
        select(func.count(TrackingEvent.id)).where(
            TrackingEvent.customer_id == profile.id,
            func.lower(cast(TrackingEvent.properties, String)).like("%spa%")
            | func.lower(cast(TrackingEvent.properties, String)).like("%wine pairing%"),
        )
    ) or 0
    tags: list[str] = []
    if max_hotel > Decimal("500") or max_restaurant > Decimal("150"):
        tags.append("High-Net-Worth")
    if weekday_hotel >= 2:
        tags.append("Corporate-Traveler")
    if luxury_events:
        tags.append("Luxury-Wellness")
    profile.cohort_tags = tags
    return tags
