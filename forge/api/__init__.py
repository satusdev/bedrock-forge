from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from forge.provision.cyberpanel import (
    install_cyberpanel,
)
from forge.api.celery_worker import celery_app
import paramiko

app = FastAPI()

class ProvisionRequest(BaseModel):
    server_ip: str
    ssh_user: str
    ssh_key: str
    ssh_port: int = 22
    domain: str
    ssl: bool = False
    hardening: bool = False
    dry_run: bool = False
    verbose: bool = False

@app.get("/health")
def health():
    return {"status": "ok"}

from celery.result import AsyncResult

@celery_app.task
def celery_provision_task(req_dict):
    import paramiko
    req = ProvisionRequest(**req_dict)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        req.server_ip,
        username=req.ssh_user,
        key_filename=req.ssh_key,
        port=req.ssh_port,
        timeout=10,
    )
    try:
        install_cyberpanel(
            req.server_ip, req.ssh_user, req.ssh_key, req.dry_run, req.verbose, req.ssh_port
        )
        # TODO: Implement SSL and hardening functions
        # if req.ssl:
        #     provision_ssl_via_certbot(client, req.domain, req.dry_run, req.verbose)
        # if req.hardening:
        #     provision_hardening(client, req.dry_run, req.verbose)
    finally:
        client.close()
    return "provisioning complete"

@app.post("/provision")
def provision(req: ProvisionRequest):
    task = celery_provision_task.delay(req.dict())
    return {"status": "provisioning started", "task_id": task.id}

@app.get("/provision/status/{task_id}")
def provision_status(task_id: str):
    result = AsyncResult(task_id, app=celery_app)
    return {"task_id": task_id, "status": result.status, "result": result.result if result.ready() else None}
