from pydantic import BaseModel
from dotenv import load_dotenv
import json
import os

class Config(BaseModel):
    site_name: str | None = None
    env: str | None = None
    local_db_dump_path: str | None = None
    local_uploads_path: str | None = None
    rclone_remote: str | None = None
    ssh_host: str | None = None
    ssh_user: str | None = None
    web_user: str | None = None
    remote_path: str | None = None
    github_token: str | None = None
    hetzner_token: str | None = None
    cloudflare_token: str | None = None

import os

def load_config(site_name: str = None, env: str = None) -> Config:
    config_dir = os.path.join(os.path.dirname(__file__), "../config")
    load_dotenv(os.path.join(config_dir, f".env.{env}") if env else os.path.join(config_dir, ".env.local"))
    with open(os.path.join(config_dir, "default.json")) as f:
        config = json.load(f)
    if site_name and env:
        return Config(**config.get("sites", {}).get(site_name, {}).get(env, {}), site_name=site_name, env=env)
    return Config()
