import typer
from typing import Optional, Dict, Any, Callable
from pathlib import Path
from forge.utils.logging import logger
from forge.utils.errors import ForgeError
from tqdm import tqdm
import gettext
import json
import subprocess

_ = gettext.gettext

app = typer.Typer()

def get_base_dir() -> Path:
    """Get the base directory for projects."""
    return Path.cwd()

class WorkflowState:
    """Manage workflow state and progress."""

    def __init__(self, workflow_name: str):
        self.workflow_name = workflow_name
        self.completed_steps = []
        self.failed_steps = []
        self.data = {}

    def add_completed_step(self, step: str):
        self.completed_steps.append(step)

    def add_failed_step(self, step: str, error: str):
        self.failed_steps.append({"step": step, "error": error})

    def save_state(self, file_path: Path):
        """Save workflow state to file."""
        state = {
            "workflow_name": self.workflow_name,
            "completed_steps": self.completed_steps,
            "failed_steps": self.failed_steps,
            "data": self.data
        }
        with open(file_path, 'w') as f:
            json.dump(state, f, indent=2)

    def load_state(self, file_path: Path) -> bool:
        """Load workflow state from file."""
        if not file_path.exists():
            return False
        try:
            with open(file_path, 'r') as f:
                state = json.load(f)
                self.workflow_name = state.get("workflow_name", self.workflow_name)
                self.completed_steps = state.get("completed_steps", [])
                self.failed_steps = state.get("failed_steps", [])
                self.data = state.get("data", {})
                return True
        except Exception as e:
            logger.warning(f"Failed to load workflow state: {e}")
            return False

def execute_forge_command(command: str, dry_run: bool = False, verbose: bool = False) -> bool:
    """Execute a forge command and return success status."""
    if dry_run:
        logger.info(f"Dry run: Would execute '{command}'")
        return True

    try:
        if verbose:
            logger.info(f"Executing: {command}")
        result = subprocess.run(
            ["python3", "-m", "forge"] + command.split(),
            cwd=get_base_dir(),
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )

        if verbose and result.stdout:
            logger.info(f"Command output: {result.stdout}")

        if result.returncode != 0:
            error_msg = result.stderr.strip() if result.stderr else "Command failed"
            logger.error(f"Command failed: {error_msg}")
            return False

        return True

    except subprocess.TimeoutExpired:
        logger.error(f"Command timed out: {command}")
        return False
    except Exception as e:
        logger.error(f"Error executing command: {e}")
        return False

def full_project_workflow(
    project_name: str,
    remote_host: str,
    ssh_user: str,
    ssh_key: str,
    domain: str,
    monitor_url: str,
    dry_run: bool = False,
    verbose: bool = False,
    skip_steps: str = "",
    resume: bool = False
) -> None:
    """Run full workflow: create → provision → deploy → backup → monitor."""

    workflow_name = f"full_project_{project_name}"
    state = WorkflowState(workflow_name)
    state_file = get_base_dir() / ".forge" / "workflows" / f"{workflow_name}.json"

    # Create workflow directory
    state_file.parent.mkdir(parents=True, exist_ok=True)

    # Load state if resuming
    if resume and state.load_state(state_file):
        logger.info(f"Resuming workflow from step {len(state.completed_steps) + 1}")

    # Define workflow steps
    steps = [
        {
            "name": "create",
            "description": "Create local project",
            "command": f"local create-project {project_name}",
            "required": True
        },
        {
            "name": "provision",
            "description": "Provision server",
            "command": f"provision create --project {project_name} --domain {domain} --host {remote_host} --ssh-user {ssh_user} --ssh-key {ssh_key}",
            "required": True
        },
        {
            "name": "deploy",
            "description": "Deploy to server",
            "command": f"deploy {project_name} production --host {remote_host} --user {ssh_user} --key {ssh_key}",
            "required": True
        },
        {
            "name": "backup",
            "description": "Create backup",
            "command": f"sync backup {project_name} production",
            "required": False
        },
        {
            "name": "monitor",
            "description": "Setup monitoring",
            "command": f"monitor add {project_name} {monitor_url}",
            "required": False
        }
    ]

    # Filter steps to skip
    if skip_steps:
        skip_list = [s.strip() for s in skip_steps.split(",") if s.strip()]
        steps = [step for step in steps if step["name"] not in skip_list]

    # Skip already completed steps if resuming
    if resume:
        steps = [step for step in steps if step["name"] not in state.completed_steps]

    logger.info(_("Starting full-project workflow..."))
    logger.info(f"Steps to execute: {[step['name'] for step in steps]}")

    failed = False
    with tqdm(steps, desc=_("Workflow steps"), disable=not verbose) as pbar:
        for step in pbar:
            pbar.set_description(step["description"])
            step_name = step["name"]

            try:
                logger.info(_(f"Running step: {step_name} - {step['description']}"))

                success = execute_forge_command(
                    step["command"],
                    dry_run=dry_run,
                    verbose=verbose
                )

                if success:
                    state.add_completed_step(step_name)
                    logger.info(_(f"✅ Step '{step_name}' completed successfully"))
                else:
                    state.add_failed_step(step_name, "Command execution failed")
                    logger.error(_(f"❌ Step '{step_name}' failed"))

                    if step["required"]:
                        logger.error(_(f"Required step '{step_name}' failed. Stopping workflow."))
                        failed = True
                        break
                    else:
                        logger.warning(_(f"Optional step '{step_name}' failed. Continuing workflow."))

                # Save state after each step
                state.save_state(state_file)

            except Exception as e:
                error_msg = str(e)
                state.add_failed_step(step_name, error_msg)
                logger.error(_(f"❌ Step '{step_name}' failed with exception: {error_msg}"))

                if step["required"]:
                    logger.error(_(f"Required step '{step_name}' failed. Stopping workflow."))
                    failed = True
                    break
                else:
                    logger.warning(_(f"Optional step '{step_name}' failed. Continuing workflow."))

                # Save state after failure
                state.save_state(state_file)

    # Final summary
    logger.info(_("=== Workflow Summary ==="))
    logger.info(f"Completed steps: {len(state.completed_steps)}")
    logger.info(f"Failed steps: {len(state.failed_steps)}")

    if state.completed_steps:
        logger.info("✅ Completed:")
        for step in state.completed_steps:
            logger.info(f"  - {step}")

    if state.failed_steps:
        logger.error("❌ Failed:")
        for failure in state.failed_steps:
            logger.error(f"  - {failure['step']}: {failure['error']}")

    if failed:
        logger.error(_("❌ Workflow completed with errors."))
        logger.info(f"To resume: forge workflow full-project {project_name} ... --resume")
        raise ForgeError(_("Workflow failed"))
    else:
        logger.info(_("🎉 Full-project workflow completed successfully!"))

        # Clean up state file on success
        if state_file.exists():
            state_file.unlink()

@app.command()
def full_project(
    project_name: str = typer.Argument(..., help=_("Project name")),
    remote_host: str = typer.Argument(..., help=_("Remote host")),
    ssh_user: str = typer.Argument(..., help=_("SSH user")),
    ssh_key: str = typer.Argument(..., help=_("SSH private key")),
    domain: str = typer.Argument(..., help=_("Domain")),
    monitor_url: str = typer.Argument(..., help=_("URL to monitor")),
    skip: str = typer.Option("", "--skip", help=_("Skip steps (create, provision, deploy, backup, monitor) - comma separated")),
    resume: bool = typer.Option(False, "--resume", help=_("Resume from last failed step")),
    dry_run: bool = typer.Option(False, "--dry-run"),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Run complete project workflow from creation to monitoring."""
    full_project_workflow(project_name, remote_host, ssh_user, ssh_key, domain, monitor_url, dry_run, verbose, skip, resume)

@app.command()
def list_workflows(
    verbose: bool = typer.Option(False, "--verbose")
):
    """List all workflow states."""
    workflow_dir = get_base_dir() / ".forge" / "workflows"
    if not workflow_dir.exists():
        logger.info("No workflow states found.")
        return

    logger.info("=== Workflow States ===")
    for state_file in workflow_dir.glob("*.json"):
        try:
            with open(state_file, 'r') as f:
                state = json.load(f)
                name = state.get("workflow_name", "Unknown")
                completed = len(state.get("completed_steps", []))
                failed = len(state.get("failed_steps", []))

                status = "✅ Complete" if failed == 0 and completed > 0 else "❌ Failed" if failed > 0 else "⏸️ In Progress"
                logger.info(f"{name}: {status} ({completed} completed, {failed} failed)")

                if verbose:
                    logger.info(f"  Completed: {', '.join(state.get('completed_steps', []))}")
                    if state.get('failed_steps'):
                        for failure in state['failed_steps']:
                            logger.info(f"  Failed: {failure['step']} - {failure['error']}")
        except Exception as e:
            logger.warning(f"Could not read workflow state {state_file}: {e}")

@app.command()
def clear_workflows(
    workflow_name: str = typer.Argument(None, help=_("Specific workflow to clear (optional)")),
    all: bool = typer.Option(False, "--all", help=_("Clear all workflow states"))
):
    """Clear workflow states."""
    workflow_dir = get_base_dir() / ".forge" / "workflows"
    if not workflow_dir.exists():
        logger.info("No workflow states found.")
        return

    if all:
        for state_file in workflow_dir.glob("*.json"):
            state_file.unlink()
        logger.info("All workflow states cleared.")
    elif workflow_name:
        state_file = workflow_dir / f"{workflow_name}.json"
        if state_file.exists():
            state_file.unlink()
            logger.info(f"Workflow '{workflow_name}' state cleared.")
        else:
            logger.error(f"Workflow '{workflow_name}' state not found.")
    else:
        logger.error("Please specify a workflow name or use --all flag.")

if __name__ == "__main__":
    app()