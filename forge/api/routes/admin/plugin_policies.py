"""
Plugin policy API routes.

Global defaults plus per-project overrides and drift detection.
"""
import json
from pathlib import Path
from typing import List, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ....db import get_db, User
from ....db.models.project import Project
from ....db.models.project_server import ProjectServer
from ....db.models.wp_site_management import WPSiteState
from ....db.models.plugin_policy import PluginPolicy, ProjectPluginPolicy
from ...deps import get_current_active_user

router = APIRouter()


class PluginPolicyBase(BaseModel):
    name: str = "Default Policy"
    allowed_plugins: List[str] = Field(default_factory=list)
    required_plugins: List[str] = Field(default_factory=list)
    blocked_plugins: List[str] = Field(default_factory=list)
    pinned_versions: Dict[str, str] = Field(default_factory=dict)
    notes: Optional[str] = None


class PluginPolicyResponse(PluginPolicyBase):
    id: int
    is_default: bool = True


class ProjectPolicyResponse(PluginPolicyBase):
    id: int
    project_id: int
    inherit_default: bool = True


class ProjectPolicyUpdate(PluginPolicyBase):
    inherit_default: bool = True


class EffectivePolicyResponse(PluginPolicyBase):
    project_id: int
    source: str


class PluginDriftResponse(BaseModel):
    project_server_id: int
    project_id: int
    environment: Optional[str] = None
    scanned_at: Optional[str] = None
    missing_required: List[str] = Field(default_factory=list)
    blocked_installed: List[str] = Field(default_factory=list)
    disallowed_installed: List[str] = Field(default_factory=list)
    version_mismatches: Dict[str, str] = Field(default_factory=dict)


class PluginBundleResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    required_plugins: List[str] = Field(default_factory=list)
    pinned_versions: Dict[str, str] = Field(default_factory=dict)


def _parse_list(value: Optional[str]) -> List[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _parse_dict(value: Optional[str]) -> Dict[str, str]:
    if not value:
        return {}
    try:
        data = json.loads(value)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _serialize_list(value: List[str]) -> str:
    return json.dumps(sorted(set(value)))


def _serialize_dict(value: Dict[str, str]) -> str:
    return json.dumps(value)


def _load_bundles() -> Dict[str, dict]:
    config_path = Path(__file__).resolve().parents[3] / "config" / "vendor-plugin-bundles.json"
    if not config_path.exists():
        return {}
    try:
        data = json.loads(config_path.read_text())
    except json.JSONDecodeError:
        return {}
    return data.get("bundles", {})


def _merge_policy(default_policy: PluginPolicy, project_policy: Optional[ProjectPluginPolicy]) -> dict:
    base = {
        "allowed_plugins": _parse_list(default_policy.allowed_plugins),
        "required_plugins": _parse_list(default_policy.required_plugins),
        "blocked_plugins": _parse_list(default_policy.blocked_plugins),
        "pinned_versions": _parse_dict(default_policy.pinned_versions),
        "notes": default_policy.notes,
        "name": default_policy.name,
    }

    if not project_policy:
        return base

    if not project_policy.inherit_default:
        return {
            "allowed_plugins": _parse_list(project_policy.allowed_plugins),
            "required_plugins": _parse_list(project_policy.required_plugins),
            "blocked_plugins": _parse_list(project_policy.blocked_plugins),
            "pinned_versions": _parse_dict(project_policy.pinned_versions),
            "notes": project_policy.notes,
            "name": default_policy.name,
        }

    merged = {
        "allowed_plugins": sorted(set(base["allowed_plugins"] + _parse_list(project_policy.allowed_plugins))),
        "required_plugins": sorted(set(base["required_plugins"] + _parse_list(project_policy.required_plugins))),
        "blocked_plugins": sorted(set(base["blocked_plugins"] + _parse_list(project_policy.blocked_plugins))),
        "pinned_versions": {
            **base["pinned_versions"],
            **_parse_dict(project_policy.pinned_versions)
        },
        "notes": project_policy.notes or base["notes"],
        "name": default_policy.name,
    }
    return merged


async def _get_project_or_404(project_id: int, db: AsyncSession, current_user: User) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.get("/global", response_model=PluginPolicyResponse)
async def get_global_policy(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(PluginPolicy).where(PluginPolicy.owner_id == current_user.id, PluginPolicy.is_default == True)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        policy = PluginPolicy(owner_id=current_user.id, name="Default Policy", is_default=True)
        db.add(policy)
        await db.commit()
        await db.refresh(policy)

    return PluginPolicyResponse(
        id=policy.id,
        name=policy.name,
        is_default=policy.is_default,
        allowed_plugins=_parse_list(policy.allowed_plugins),
        required_plugins=_parse_list(policy.required_plugins),
        blocked_plugins=_parse_list(policy.blocked_plugins),
        pinned_versions=_parse_dict(policy.pinned_versions),
        notes=policy.notes
    )


@router.put("/global", response_model=PluginPolicyResponse)
async def update_global_policy(
    payload: PluginPolicyBase,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(PluginPolicy).where(PluginPolicy.owner_id == current_user.id, PluginPolicy.is_default == True)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        policy = PluginPolicy(owner_id=current_user.id, is_default=True)
        db.add(policy)

    policy.name = payload.name
    policy.allowed_plugins = _serialize_list(payload.allowed_plugins)
    policy.required_plugins = _serialize_list(payload.required_plugins)
    policy.blocked_plugins = _serialize_list(payload.blocked_plugins)
    policy.pinned_versions = _serialize_dict(payload.pinned_versions)
    policy.notes = payload.notes

    await db.commit()
    await db.refresh(policy)

    return PluginPolicyResponse(
        id=policy.id,
        name=policy.name,
        is_default=policy.is_default,
        allowed_plugins=_parse_list(policy.allowed_plugins),
        required_plugins=_parse_list(policy.required_plugins),
        blocked_plugins=_parse_list(policy.blocked_plugins),
        pinned_versions=_parse_dict(policy.pinned_versions),
        notes=policy.notes
    )


@router.get("/projects/{project_id}", response_model=ProjectPolicyResponse)
async def get_project_policy(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    await _get_project_or_404(project_id, db, current_user)
    result = await db.execute(
        select(ProjectPluginPolicy).where(ProjectPluginPolicy.project_id == project_id)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project policy not found")

    return ProjectPolicyResponse(
        id=policy.id,
        project_id=policy.project_id,
        inherit_default=policy.inherit_default,
        name="Project Override",
        allowed_plugins=_parse_list(policy.allowed_plugins),
        required_plugins=_parse_list(policy.required_plugins),
        blocked_plugins=_parse_list(policy.blocked_plugins),
        pinned_versions=_parse_dict(policy.pinned_versions),
        notes=policy.notes
    )


@router.put("/projects/{project_id}", response_model=ProjectPolicyResponse)
async def upsert_project_policy(
    project_id: int,
    payload: ProjectPolicyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    await _get_project_or_404(project_id, db, current_user)
    result = await db.execute(
        select(ProjectPluginPolicy).where(ProjectPluginPolicy.project_id == project_id)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        policy = ProjectPluginPolicy(project_id=project_id)
        db.add(policy)

    policy.inherit_default = payload.inherit_default
    policy.allowed_plugins = _serialize_list(payload.allowed_plugins)
    policy.required_plugins = _serialize_list(payload.required_plugins)
    policy.blocked_plugins = _serialize_list(payload.blocked_plugins)
    policy.pinned_versions = _serialize_dict(payload.pinned_versions)
    policy.notes = payload.notes

    await db.commit()
    await db.refresh(policy)

    return ProjectPolicyResponse(
        id=policy.id,
        project_id=policy.project_id,
        inherit_default=policy.inherit_default,
        name="Project Override",
        allowed_plugins=_parse_list(policy.allowed_plugins),
        required_plugins=_parse_list(policy.required_plugins),
        blocked_plugins=_parse_list(policy.blocked_plugins),
        pinned_versions=_parse_dict(policy.pinned_versions),
        notes=policy.notes
    )


@router.get("/projects/{project_id}/effective", response_model=EffectivePolicyResponse)
async def get_effective_policy(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    await _get_project_or_404(project_id, db, current_user)
    result = await db.execute(
        select(PluginPolicy).where(PluginPolicy.owner_id == current_user.id, PluginPolicy.is_default == True)
    )
    default_policy = result.scalar_one_or_none()
    if not default_policy:
        default_policy = PluginPolicy(owner_id=current_user.id, name="Default Policy", is_default=True)
        db.add(default_policy)
        await db.commit()
        await db.refresh(default_policy)

    result = await db.execute(
        select(ProjectPluginPolicy).where(ProjectPluginPolicy.project_id == project_id)
    )
    project_policy = result.scalar_one_or_none()

    merged = _merge_policy(default_policy, project_policy)
    source = "project_override" if project_policy else "default"

    return EffectivePolicyResponse(
        project_id=project_id,
        source=source,
        name=merged["name"],
        allowed_plugins=merged["allowed_plugins"],
        required_plugins=merged["required_plugins"],
        blocked_plugins=merged["blocked_plugins"],
        pinned_versions=merged["pinned_versions"],
        notes=merged.get("notes")
    )


@router.get("/bundles", response_model=List[PluginBundleResponse])
async def list_plugin_bundles(
    current_user: User = Depends(get_current_active_user)
):
    bundles = _load_bundles()
    return [
        PluginBundleResponse(
            id=bundle_id,
            name=bundle.get("name", bundle_id),
            description=bundle.get("description"),
            required_plugins=bundle.get("required_plugins", []),
            pinned_versions=bundle.get("pinned_versions", {})
        )
        for bundle_id, bundle in bundles.items()
    ]


@router.post("/global/bundles/{bundle_id}", response_model=PluginPolicyResponse)
async def apply_bundle_to_global_policy(
    bundle_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    bundles = _load_bundles()
    bundle = bundles.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bundle not found")

    result = await db.execute(
        select(PluginPolicy).where(PluginPolicy.owner_id == current_user.id, PluginPolicy.is_default == True)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        policy = PluginPolicy(owner_id=current_user.id, is_default=True, name="Default Policy")
        db.add(policy)

    required = sorted(set(_parse_list(policy.required_plugins) + bundle.get("required_plugins", [])))
    pinned = {**_parse_dict(policy.pinned_versions), **bundle.get("pinned_versions", {})}

    policy.required_plugins = _serialize_list(required)
    policy.pinned_versions = _serialize_dict(pinned)

    await db.commit()
    await db.refresh(policy)

    return PluginPolicyResponse(
        id=policy.id,
        name=policy.name,
        is_default=policy.is_default,
        allowed_plugins=_parse_list(policy.allowed_plugins),
        required_plugins=_parse_list(policy.required_plugins),
        blocked_plugins=_parse_list(policy.blocked_plugins),
        pinned_versions=_parse_dict(policy.pinned_versions),
        notes=policy.notes
    )


@router.post("/projects/{project_id}/bundles/{bundle_id}", response_model=ProjectPolicyResponse)
async def apply_bundle_to_project_policy(
    project_id: int,
    bundle_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    await _get_project_or_404(project_id, db, current_user)
    bundles = _load_bundles()
    bundle = bundles.get(bundle_id)
    if not bundle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bundle not found")

    result = await db.execute(
        select(ProjectPluginPolicy).where(ProjectPluginPolicy.project_id == project_id)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        policy = ProjectPluginPolicy(project_id=project_id)
        db.add(policy)

    required = sorted(set(_parse_list(policy.required_plugins) + bundle.get("required_plugins", [])))
    pinned = {**_parse_dict(policy.pinned_versions), **bundle.get("pinned_versions", {})}

    policy.required_plugins = _serialize_list(required)
    policy.pinned_versions = _serialize_dict(pinned)

    await db.commit()
    await db.refresh(policy)

    return ProjectPolicyResponse(
        id=policy.id,
        project_id=policy.project_id,
        inherit_default=policy.inherit_default,
        name="Project Override",
        allowed_plugins=_parse_list(policy.allowed_plugins),
        required_plugins=_parse_list(policy.required_plugins),
        blocked_plugins=_parse_list(policy.blocked_plugins),
        pinned_versions=_parse_dict(policy.pinned_versions),
        notes=policy.notes
    )


@router.get("/project-servers/{project_server_id}/drift", response_model=PluginDriftResponse)
async def get_plugin_drift(
    project_server_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(ProjectServer)
        .join(Project)
        .where(ProjectServer.id == project_server_id)
        .where(Project.owner_id == current_user.id)
    )
    project_server = result.scalar_one_or_none()
    if not project_server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project-server not found")

    policy_result = await db.execute(
        select(PluginPolicy).where(PluginPolicy.owner_id == current_user.id, PluginPolicy.is_default == True)
    )
    default_policy = policy_result.scalar_one_or_none()
    if not default_policy:
        default_policy = PluginPolicy(owner_id=current_user.id, name="Default Policy", is_default=True)
        db.add(default_policy)
        await db.commit()
        await db.refresh(default_policy)

    project_policy_result = await db.execute(
        select(ProjectPluginPolicy).where(ProjectPluginPolicy.project_id == project_server.project_id)
    )
    project_policy = project_policy_result.scalar_one_or_none()

    effective = _merge_policy(default_policy, project_policy)

    state_result = await db.execute(
        select(WPSiteState).where(WPSiteState.project_server_id == project_server_id)
    )
    state = state_result.scalar_one_or_none()

    installed_plugins = []
    if state and state.plugins:
        try:
            installed_plugins = json.loads(state.plugins)
        except json.JSONDecodeError:
            installed_plugins = []

    installed_slugs = [p.get("name") for p in installed_plugins if p.get("name")]
    installed_versions = {p.get("name"): p.get("version") for p in installed_plugins if p.get("name")}

    required = effective["required_plugins"]
    allowed = effective["allowed_plugins"]
    blocked = effective["blocked_plugins"]
    pinned = effective["pinned_versions"]

    missing_required = [p for p in required if p not in installed_slugs]
    blocked_installed = [p for p in installed_slugs if p in blocked]

    disallowed_installed = []
    if allowed:
        disallowed_installed = [p for p in installed_slugs if p not in allowed and p not in required]

    version_mismatches = {}
    for slug, pinned_version in pinned.items():
        current = installed_versions.get(slug)
        if current and pinned_version and current != pinned_version:
            version_mismatches[slug] = current

    return PluginDriftResponse(
        project_server_id=project_server_id,
        project_id=project_server.project_id,
        environment=project_server.environment.value if project_server.environment else None,
        scanned_at=state.last_scanned_at.isoformat() if state and state.last_scanned_at else None,
        missing_required=missing_required,
        blocked_installed=blocked_installed,
        disallowed_installed=disallowed_installed,
        version_mismatches=version_mismatches
    )
