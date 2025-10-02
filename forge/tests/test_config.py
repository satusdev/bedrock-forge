import os
import keyring
from forge.utils.config import load_config

def test_config_file_load():
    config = load_config(site_name="testsite", env="local")
    assert config is not None
    assert config.admin_user is not None

def test_keyring_token_priority(monkeypatch):
    keyring.set_password("forge", "github_token", "FAKE_TOKEN")
    os.environ["GITHUB_TOKEN"] = "ENV_TOKEN"
    config = load_config(site_name="testsite", env="local")
    assert config.github_token == "FAKE_TOKEN"
    keyring.delete_password("forge", "github_token")
