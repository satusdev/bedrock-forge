import typer
import os
import subprocess
import shutil
from datetime import datetime

app = typer.Typer()

BACKUP_DIR = "backups"

def get_gdrive_creds():
    import keyring
    creds = keyring.get_password("forge", "gdrive_service_account_json")
    if not creds:
        raise Exception("Google Drive service account credentials not found in keyring. Please store them with keyring.")
    # Write creds to a temp file for rclone
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, mode="w", suffix=".json") as f:
        f.write(creds)
        return f.name

def run_rclone(cmd: str, gdrive_creds_file: str = None):
    env = os.environ.copy()
    if gdrive_creds_file:
        env["GOOGLE_APPLICATION_CREDENTIALS"] = gdrive_creds_file
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise Exception(f"rclone failed: {result.stderr}")
    return result.stdout

@app.command()
def backup(
    db: bool = typer.Option(True, "--db/--no-db", help="Backup database"),
    uploads: bool = typer.Option(True, "--uploads/--no-uploads", help="Backup uploads"),
    gdrive: bool = typer.Option(False, "--gdrive", help="Backup to Google Drive"),
    gdrive_folder: str = typer.Option("forge-backups", "--gdrive-folder", help="Google Drive folder"),
    retention: int = typer.Option(7, "--retention", help="Number of backups to keep"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Dry run"),
):
    """Backup DB and/or uploads, optionally to Google Drive."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_files = []
    if db:
        db_file = f"{BACKUP_DIR}/db_{timestamp}.sql"
        typer.secho(f"Backing up DB to {db_file}", fg=typer.colors.GREEN)
        if not dry_run:
            subprocess.run("ddev export-db --file " + db_file, shell=True, check=True)
        backup_files.append(db_file)
    if uploads:
        uploads_file = f"{BACKUP_DIR}/uploads_{timestamp}.tar.gz"
        typer.secho(f"Archiving uploads to {uploads_file}", fg=typer.colors.GREEN)
        if not dry_run:
            shutil.make_archive(uploads_file.replace(".tar.gz", ""), "gztar", "web/app/uploads")
        backup_files.append(uploads_file)
    if gdrive:
        typer.secho("Syncing backup(s) to Google Drive via rclone...", fg=typer.colors.BLUE)
        gdrive_creds_file = get_gdrive_creds()
        for f in backup_files:
            if not dry_run:
                run_rclone(f"rclone copy {f} gdrive:{gdrive_folder}/", gdrive_creds_file)
    # Retention: delete old backups
    files = sorted([f for f in os.listdir(BACKUP_DIR) if f.startswith("db_") or f.startswith("uploads_")])
    if len(files) > retention * 2:
        to_delete = files[:-retention * 2]
        for f in to_delete:
            typer.secho(f"Deleting old backup: {f}", fg=typer.colors.YELLOW)
            if not dry_run:
                os.remove(os.path.join(BACKUP_DIR, f))

@app.command()
def restore(
    db_file: str = typer.Option(None, "--db-file", help="DB backup file"),
    uploads_file: str = typer.Option(None, "--uploads-file", help="Uploads backup file"),
    gdrive: bool = typer.Option(False, "--gdrive", help="Restore from Google Drive"),
    gdrive_folder: str = typer.Option("forge-backups", "--gdrive-folder", help="Google Drive folder"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Dry run"),
):
    """Restore DB and/or uploads from backup (local or Google Drive)."""
    if gdrive:
        typer.secho("Fetching backup(s) from Google Drive via rclone...", fg=typer.colors.BLUE)
        gdrive_creds_file = get_gdrive_creds()
        if db_file:
            run_rclone(f"rclone copy gdrive:{gdrive_folder}/{db_file} {BACKUP_DIR}/", gdrive_creds_file)
        if uploads_file:
            run_rclone(f"rclone copy gdrive:{gdrive_folder}/{uploads_file} {BACKUP_DIR}/", gdrive_creds_file)
    if db_file:
        typer.secho(f"Restoring DB from {db_file}", fg=typer.colors.GREEN)
        if not dry_run:
            subprocess.run(f"ddev import-db --file {db_file}", shell=True, check=True)
    if uploads_file:
        typer.secho(f"Restoring uploads from {uploads_file}", fg=typer.colors.GREEN)
        if not dry_run:
            shutil.unpack_archive(uploads_file, "web/app/uploads", "gztar")

@app.command()
def db():
    """Backup only the database."""
    backup(db=True, uploads=False)

@app.command()
def uploads():
    """Backup only uploads."""
    backup(db=False, uploads=True)
