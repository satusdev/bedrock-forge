import json
import os
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

from sqlalchemy import create_engine, Column, String
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import OperationalError

Base = declarative_base()
SessionLocal = sessionmaker()

class ConfigModel(Base):
    __tablename__ = "config"
    key = Column(String, primary_key=True)
    value = Column(String)

@dataclass
class Config:
    site_name: Optional[str]
    env: Optional[str]
    local_db_dump_path: Optional[str]
    local_uploads_path: Optional[str]
    rclone_remote: Optional[str]
    ssh_host: Optional[str]
    ssh_user: Optional[str]
    web_user: Optional[str]
    remote_path: Optional[str]
    github_token: Optional[str]
    hetzner_token: Optional[str]
    cloudflare_token: Optional[str]
    admin_user: Optional[str]
    admin_email: Optional[str]
    github_user: Optional[str]
    server_type: Optional[str]
    region: Optional[str]

def load_config(site_name: Optional[str], env: str, db_url: Optional[str] = None) -> Config:
    """
    Load configuration from DB (if db_url provided and DB available), else from default.json and environment variables.
    """
    config_data = {}
    db_loaded = False

    # Try DB first if db_url is provided
    if db_url:
        try:
            engine = create_engine(db_url)
            SessionLocal.configure(bind=engine)
            Base.metadata.create_all(engine)
            session = SessionLocal()
            db_items = session.query(ConfigModel).all()
            if db_items:
                config_data = {item.key: item.value for item in db_items}
                db_loaded = True
            session.close()
        except OperationalError:
            db_loaded = False
        except Exception as e:
            print(f"DB config load failed: {e}")
            db_loaded = False

    # Fallback to file if DB not loaded
    if not db_loaded:
        config_path = os.path.join("forge", "config", "default.json")
        try:
            if os.path.exists(config_path):
                with open(config_path, "r") as f:
                    config_data = json.load(f)
        except Exception as e:
            raise Exception(f"Failed to load config from {config_path}: {e}")

    # Load environment variables
    load_dotenv(os.path.join("forge", "config", ".env.local"))

    import keyring

    # Try to get tokens from keyring first, fallback to env/file
    github_token = keyring.get_password("forge", "github_token") or os.getenv("GITHUB_TOKEN")
    hetzner_token = keyring.get_password("forge", "hetzner_token") or os.getenv("HETZNER_TOKEN")
    cloudflare_token = keyring.get_password("forge", "cloudflare_token") or os.getenv("CLOUDFLARE_TOKEN")

    return Config(
        site_name=site_name,
        env=env,
        local_db_dump_path=os.getenv("LOCAL_DB_DUMP_PATH"),
        local_uploads_path=os.getenv("LOCAL_UPLOADS_PATH"),
        rclone_remote=os.getenv("RCLONE_REMOTE"),
        ssh_host=os.getenv("SSH_HOST"),
        ssh_user=os.getenv("SSH_USER"),
        web_user=os.getenv("WEB_USER"),
        remote_path=os.getenv("REMOTE_PATH"),
        github_token=github_token,
        hetzner_token=hetzner_token,
        cloudflare_token=cloudflare_token,
        admin_user=config_data.get("admin_user"),
        admin_email=config_data.get("admin_email"),
        github_user=config_data.get("github_user"),
        server_type=config_data.get("server_type"),
        region=config_data.get("region")
    )
