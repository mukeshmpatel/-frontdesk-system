from fastapi import APIRouter, Depends, status
from .auth import require_service_key
from .queue import celery_app
from .schemas import TrackingEventIn

router = APIRouter(prefix="/api/events", tags=["tracking"], dependencies=[Depends(require_service_key)])


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def ingest_event(event: TrackingEventIn) -> dict:
    job = celery_app.send_task("app.tasks.process_tracking_event", args=[event.model_dump(mode="json")])
    return {"accepted": True, "job_id": job.id, "idempotency_key": event.idempotency_key}
