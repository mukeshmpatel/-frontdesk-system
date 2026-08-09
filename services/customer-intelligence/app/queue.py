from celery import Celery
from .config import get_settings

settings = get_settings()
celery_app = Celery("aaiq_customer_intelligence", broker=settings.redis_url, backend=settings.redis_url, include=["app.tasks"])
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_default_retry_delay=15,
    task_routes={"app.tasks.*": {"queue": "customer-intelligence"}},
)
