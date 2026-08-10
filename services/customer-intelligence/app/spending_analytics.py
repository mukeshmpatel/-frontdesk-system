from fastapi import APIRouter, Depends, status
from .auth import require_service_key
from .queue import celery_app
from .schemas import TransactionIn

router = APIRouter(prefix="/api/transactions", tags=["spending"], dependencies=[Depends(require_service_key)])


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def ingest_transaction(transaction: TransactionIn) -> dict:
    job = celery_app.send_task("app.tasks.process_transaction", args=[transaction.model_dump(mode="json")])
    return {"accepted": True, "job_id": job.id, "external_transaction_id": transaction.external_transaction_id}
