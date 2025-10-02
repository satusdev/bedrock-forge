import typer
import os
import subprocess
from pathlib import Path
from datetime import datetime
from forge.utils.logging import logger
from forge.utils.errors import ForgeError
from tqdm import tqdm
import shutil
import keyring
import gettext

_ = gettext.gettext

app = typer.Typer()

def check_rclone_config(dry_run: bool = False) -> None:
    if dry_run:
        return
    try:
        subprocess.run("rclone config show", shell=True, check=True, capture_output=True)
    except subprocess.CalledProcessError:
        logger.warning(_("rclone not configured. Run 'rclone config' to set up Google Drive."))
        if typer.confirm(_("Configure now?"), default=False):
            subprocess.run("rclone config", shell=True)

def get_gdrive_creds() -> Path:
    creds_str = keyring.get_password("forge", "gdrive_service_account_json")
    if not creds_str:
        raise ForgeError(_("Google Drive service account credentials not found in keyring."))
    from tempfile import NamedTemporaryFile
    with NamedTemporaryFile(delete=False, mode="w", suffix=".json") as f:
        f.write(creds_str)
        return Path(f.name)

def run_rclone(cmd: str, gdrive_creds_file: Path = None, dry_run: bool = False, verbose: bool = False) -> str:
    if dry_run:
        logger.info(_(f"Dry run: rclone {cmd}"))
        return ""
    env = os.environ.copy()
    if gdrive_creds_file:
        env["GOOGLE_APPLICATION_CREDENTIALS"] = str(gdrive_creds_file)
    if verbose:
        cmd += " -v"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise ForgeError(_(f"rclone failed: {result.stderr}"))
    return result.stdout

def backup(
    project_dir: Path = Path.cwd(),
    db: bool = True,
    uploads: bool = True,
    gdrive: bool = False,
    gdrive_folder: str = "forge-backups",
    retention: int = 7,
    dry_run: bool = False,
    verbose: bool = False
) -> None:
    """Backup DB and/or uploads, optionally to Google Drive."""
    os.chdir(project_dir)
    backup_dir = project_dir / BACKUP_DIR
    backup_dir.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_files = []
    check_rclone_config(dry_run)
    if db:
        db_file = backup_dir / f"db_{timestamp}.sql"
        logger.info(_(f"Backing up DB to {db_file}"))
        if not dry_run:
            run_shell("ddev export-db --file " + str(db_file), dry_run)
        backup_files.append(db_file)
    if uploads:
        uploads_file = backup_dir / f"uploads_{timestamp}.tar.gz"
        logger.info(_(f"Archiving uploads to {uploads_file}"))
        if not dry_run:
            with tqdm(desc=_("Archiving uploads"), total=1, disable=not verbose) as pbar:
                shutil.make_archive(str(uploads_file).replace(".tar.gz", ""), "gztar", "web/app/uploads")
                pbar.update(1)
        backup_files.append(uploads_file)
    if gdrive:
        logger.info(_("Syncing backup(s) to Google Drive via rclone..."))
        gdrive_creds_file = get_gdrive_creds()
        for f in tqdm(backup_files, desc=_("Uploading to GDrive"), disable=not verbose):
            if not dry_run:
                run_rclone(f"rclone copy {f} gdrive:{gdrive_folder}/", gdrive_creds_file)
        os.unlink(gdrive_creds_file)  # Clean up temp creds
    # Retention: delete old backups
    files = sorted(backup_dir.glob("db_*") ) + sorted(backup_dir.glob("uploads_*"))
    if len(files) > retention * 2:
        to_delete = files[:-retention * 2]
        for f in tqdm(to_delete, desc=_("Deleting old backups"), disable=not verbose):
            logger.warning(_(f"Deleting old backup: {f}"))
            if not dry_run:
                f.unlink()

@app.command()
def backup_command(
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory")),
    db: bool = typer.Option(True, "--db/--no-db", help=_("Backup database")),
    uploads: bool = typer.Option(True, "--uploads/--no-uploads", help=_("Backup uploads")),
    gdrive: bool = typer.Option(False, "--gdrive", help=_("Backup to Google Drive")),
    gdrive_folder: str = typer.Option("forge-backups", "--gdrive-folder", help=_("Google Drive folder")),
    retention: int = typer.Option(7, "--retention", help=_("Number of backups to keep")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    backup(Path(project_dir).resolve(), db, uploads, gdrive, gdrive_folder, retention, dry_run, verbose)

@app.command()
def restore(
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory")),
    db_file: str = typer.Option(None, "--db-file", help=_("DB backup file")),
    uploads_file: str = typer.Option(None, "--uploads-file", help=_("Uploads backup file")),
    gdrive: bool = typer.Option(False, "--gdrive", help=_("Restore from Google Drive")),
    gdrive_folder: str = typer.Option("forge-backups", "--gdrive-folder", help=_("Google Drive folder")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Restore DB and/or uploads from backup (local or Google Drive)."""
    os.chdir(Path(project_dir).resolve())
    backup_dir = Path(project_dir).resolve() / BACKUP_DIR
    if gdrive:
        logger.info(_("Fetching backup(s) from Google Drive via rclone..."))
        check_rclone_config(dry_run)
        gdrive_creds_file = get_gdrive_creds()
        files_to_fetch = []
        if db_file:
            files_to_fetch.append(db_file)
        if uploads_file:
            files_to_fetch.append(uploads_file)
        for f in tqdm(files_to_fetch, desc=_("Downloading from GDrive"), disable=not verbose):
            if not dry_run:
                run_rclone(f"rclone copy gdrive:{gdrive_folder}/{f} {backup_dir}/", gdrive_creds_file)
        os.unlink(gdrive_creds_file)
    if db_file:
        db_path = backup_dir / db_file
        logger.info(_(f"Restoring DB from {db_path}"))
        if not dry_run:
            run_shell(f"ddev import-db --file {db_path}", dry_run)
    if uploads_file:
        uploads_path = backup_dir / uploads_file
        logger.info(_(f"Restoring uploads from {uploads_path}"))
        if not dry_run:
            with tqdm(desc=_("Extracting uploads"), total=1, disable=not verbose) as pbar:
                shutil.unpack_archive(uploads_path, "web/app/uploads", "gztar")
                pbar.update(1)

@app.command()
def db(
    project_dir: str = typer.Option(".", "--project-dir")
):
    """Backup only the database."""
    backup(Path(project_dir).resolve(), db=True, uploads=False)

@app.command()
def uploads(
    project_dir: str = typer.Option(".", "--project-dir")
):
    """Backup only uploads."""
    backup(Path(project_dir).resolve(), db=False, uploads=True)

@app.command()
def schedule(
    cron: str = typer.Option("0 0 * * *", "--cron", help=_("Cron expression for scheduling")),
    project_dir: str = typer.Option(".", "--project-dir", help=_("Project directory")),
    gdrive: bool = typer.Option(True, "--gdrive")
):
    """Generate crontab line for scheduling backups."""
    cmd = f"cd {project_dir} && python -m forge sync backup --gdrive={gdrive}"
    typer.echo(_(f"Add to crontab: {cron} {cmd}"))

if __name__ == "__main__":
    app()