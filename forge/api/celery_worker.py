from celery import Celery

celery_app = Celery(
    "provision",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)
