"""Forge API routes package."""
from fastapi import APIRouter

# Import individual routers
from .admin.activity import router as activity_router
from .admin.auth import router as auth_router
from .admin.users import router as users_router
from .admin.dashboard import router as dashboard_router
from .admin.projects import router as projects_router
from .admin.backups import router as backups_router
from .admin.github import router as github_router
from .admin.gdrive import router as gdrive_router
from .admin.clients import router as clients_router
from .admin.websocket import router as websocket_router
from .admin.servers import router as servers_router
from .admin.sync import router as sync_router
from .admin.monitors import router as monitors_router
from .admin.local import router as local_router
from .admin.project_servers import router as project_servers_router
from .admin.credentials import router as credentials_router
from .admin.cyberpanel import router as cyberpanel_router
from .admin.invoices import router as invoices_router
from .admin.subscriptions import router as subscriptions_router
from .admin.domains import router as domains_router
from .admin.ssl import router as ssl_router
from .admin.packages import router as packages_router
from .admin.deployments import router as deployments_router
from .admin.schedules import router as schedules_router
from .admin.settings import router as settings_router
from .admin.migrations import router as migrations_router
from .admin.analytics import router as analytics_router
from .admin.plugin_policies import router as plugin_policies_router

# New routes - Phase 2-3
from .public.status_page import router as status_page_router
from .admin.wp_management import router as wp_management_router
from .client.client_auth import router as client_auth_router
from .client.client_portal import router as client_portal_router
from .admin.cloudflare import router as cloudflare_router
from .admin.user_management import router as user_management_router
from .admin.role_management import router as role_management_router
from .admin.tags import router as tags_router
from .admin.project_deploy import router as project_deploy_router
from .admin.import_projects import router as import_projects_router

# Create aggregated router
api_router = APIRouter()

# Auth routes (no prefix, these are the main auth endpoints)
api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users_router, prefix="/users", tags=["Users"])

# Register all other routers with prefixes
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(projects_router, prefix="/projects", tags=["Projects"])
api_router.include_router(backups_router, prefix="/backups", tags=["Backups"])
api_router.include_router(github_router, prefix="/github", tags=["GitHub"])
api_router.include_router(gdrive_router, prefix="/gdrive", tags=["Google Drive"])
api_router.include_router(clients_router, prefix="/clients", tags=["Clients"])
api_router.include_router(websocket_router, tags=["WebSocket"])
api_router.include_router(servers_router, prefix="/servers", tags=["Servers"])
api_router.include_router(sync_router, prefix="/sync", tags=["Sync"])
api_router.include_router(monitors_router, prefix="/monitors", tags=["Monitors"])
api_router.include_router(local_router, prefix="/local", tags=["Local Development"])
api_router.include_router(project_servers_router, prefix="/projects", tags=["Project Servers"])
api_router.include_router(credentials_router, prefix="/credentials", tags=["Credentials"])
api_router.include_router(cyberpanel_router, prefix="/cyberpanel", tags=["CyberPanel"])
api_router.include_router(invoices_router, prefix="/invoices", tags=["Invoices"])
api_router.include_router(subscriptions_router, prefix="/subscriptions", tags=["Subscriptions"])
api_router.include_router(domains_router, prefix="/domains", tags=["Domains"])
api_router.include_router(ssl_router, prefix="/ssl", tags=["SSL Certificates"])
api_router.include_router(packages_router, prefix="/packages", tags=["Hosting Packages"])
api_router.include_router(deployments_router, prefix="/deployments", tags=["Deployments"])
api_router.include_router(schedules_router, prefix="/schedules", tags=["Schedules"])
api_router.include_router(settings_router, prefix="/settings", tags=["Settings"])
api_router.include_router(migrations_router, prefix="/migrations", tags=["Migrations"])
api_router.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])
api_router.include_router(plugin_policies_router, prefix="/plugin-policies", tags=["Plugin Policies"])
api_router.include_router(cloudflare_router, prefix="/cloudflare", tags=["Cloudflare"])

# New routes - Phase 2-3
api_router.include_router(status_page_router, prefix="/status", tags=["Status Page"])
api_router.include_router(wp_management_router, prefix="/wp", tags=["WP Management"])
api_router.include_router(client_auth_router, prefix="/client/auth", tags=["Client Auth"])
api_router.include_router(client_portal_router, prefix="/client", tags=["Client Portal"])
api_router.include_router(activity_router, prefix="/activity", tags=["Activity Feed"])
api_router.include_router(user_management_router, prefix="/users", tags=["User Management"])
api_router.include_router(role_management_router, prefix="/rbac", tags=["Role Management"])
api_router.include_router(tags_router, prefix="/tags", tags=["Tags"])
api_router.include_router(project_deploy_router, prefix="/projects", tags=["Project Deploy"])
api_router.include_router(import_projects_router, prefix="/servers", tags=["Import Projects"])

# Notification channels
from .admin.notifications import router as notifications_router
api_router.include_router(notifications_router, prefix="/notifications", tags=["Notifications"])

# Rclone configuration
from .admin.rclone_config import router as rclone_config_router
api_router.include_router(rclone_config_router, prefix="/rclone", tags=["Rclone Configuration"])

__all__ = ["api_router"]




