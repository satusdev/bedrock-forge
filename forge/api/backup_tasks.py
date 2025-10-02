from celery import Celery
import subprocess

celery_app = Celery(
    "backup",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)

@celery_app.task
def scheduled_backup(db=True, uploads=True, gdrive=True, gdrive_folder="forge-backups"):
    cmd = f"python3 -m forge.commands.sync backup --db={db} --uploads={uploads} --gdrive={gdrive} --gdrive-folder={gdrive_folder}"
    subprocess.run(cmd, shell=True, check=True)
