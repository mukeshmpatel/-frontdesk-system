from contextlib import asynccontextmanager
from fastapi import FastAPI
from .database import engine
from .models import Base
from .spending_analytics import router as spending_router
from .tracking import router as tracking_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="AAIQ Customer & Marketing Intelligence",
    version="1.0.0",
    description="Property-scoped customer behavior, spending intelligence, consent, and approval-controlled activation.",
    lifespan=lifespan,
)
app.include_router(tracking_router)
app.include_router(spending_router)


@app.get("/healthz")
async def health() -> dict:
    return {"status": "healthy", "service": "aaiq-customer-intelligence", "activation_default": "DRY_RUN"}
