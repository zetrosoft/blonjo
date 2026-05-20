from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "sajen_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.ocr_worker"]
)

celery_app.conf.update(
    broker_url=settings.REDIS_URL,
    result_backend=settings.REDIS_URL,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True
)

# Set as default to ensure @shared_task works
celery_app.set_default()
