import typer
import json
import os
from pathlib import Path
from ..utils.config_manager import get_config_manager, setup_credentials_interactive
from ..utils.errors import ForgeError
from ..utils.logging import logger
from ..provision.core import ServerType, DeploymentMethod, WebServer
import gettext

_ = gettext.gettext

app = typer.Typer(name="config", help=_("Manage Forge configuration"))


@app.command()
def setup(
    interactive: bool = typer.Option(True, "--interactive/--no-interactive", help=_("Run interactive setup")),
    hetzner_token: str = typer.Option(None, "--hetzner-token", help=_("Set Hetzner API token")),
    cloudflare_token: str = typer.Option(None, "--cloudflare-token", help=_("Set Cloudflare API token")),
    default_ssh_key: str = typer.Option(None, "--default-ssh-key", help=_("Set default SSH key path")),
    default_ssh_user: str = typer.Option(None, "--default-ssh-user", help=_("Set default SSH user")),
    verbose: bool = typer.Option(False, "--verbose")
):
    """Set up Forge configuration."""
    config_manager = get_config_manager()
    global_config = config_manager.load_global_config()

    if interactive:
        setup_credentials_interactive()
        return

    # Set individual configurations if provided
    updated = False

    if hetzner_token:
        config_manager.set_credential('hetzner_token', hetzner_token, 'hetzner')
        typer.echo(_("✓ Hetzner token configured"))
        updated = True

    if cloudflare_token:
        config_manager.set_credential('cloudflare_token', cloudflare_token)
        typer.echo(_("✓ Cloudflare token configured"))
        updated = True

    if default_ssh_key:
        global_config.default_ssh_key = default_ssh_key
        typer.echo(_("✓ Default SSH key set to {ssh_key}").format(ssh_key=default_ssh_key))
        updated = True

    if default_ssh_user:
        global_config.default_ssh_user = default_ssh_user
        typer.echo(_("✓ Default SSH user set to {user}").format(user=default_ssh_user))
        updated = True

    if updated:
        config_manager.save_global_config()
        typer.echo(_("✓ Configuration updated successfully"))
    else:
        typer.echo(_("No configuration changes made. Use --help to see available options."))


@app.command()
def show(
    provider: str = typer.Option(None, "--provider", help=_("Show provider-specific configuration")),
    global_only: bool = typer.Option(False, "--global", help=_("Show only global configuration"))
):
    """Show current configuration."""
    config_manager = get_config_manager()
    global_config = config_manager.load_global_config()

    typer.echo(_("=== Global Configuration ==="))
    typer.echo(f"Default SSH User: {global_config.default_ssh_user}")
    typer.echo(f"Default SSH Key: {global_config.default_ssh_key}")
    typer.echo(f"Default SSH Port: {global_config.default_ssh_port}")
    typer.echo(f"Default Provider: {global_config.default_provider.value}")
    typer.echo(f"Default Deployment Method: {global_config.default_deployment_method.value}")
    typer.echo(f"Default Web Server: {global_config.default_web_server.value}")

    if global_config.global_credentials:
        typer.echo(_("\n=== Global Credentials ==="))
        for key, value in global_config.global_credentials.items():
            masked_value = "*" * len(value) if value else "Not set"
            typer.echo(f"{key}: {masked_value}")

    if not global_only and provider:
        provider_config = config_manager.load_provider_config(provider)
        typer.echo(_("\n=== {provider} Configuration ===").format(provider=provider.title()))
        typer.echo(f"Provider Type: {provider_config.provider_type.value}")
        typer.echo(f"Supported Regions: {', '.join(provider_config.regions)}")
        typer.echo(f"Supported Server Types: {', '.join(provider_config.server_types)}")
        typer.echo(f"Deployment Methods: {', '.join([m.value for m in provider_config.deployment_methods])}")

        if provider_config.credentials:
            typer.echo(_("\nCredentials:"))
            for key, value in provider_config.credentials.items():
                masked_value = "*" * len(value) if value else "Not set"
                typer.echo(f"  {key}: {masked_value}")

        if provider_config.defaults:
            typer.echo(_("\nDefaults:"))
            for key, value in provider_config.defaults.items():
                typer.echo(f"  {key}: {value}")

    elif not global_only:
        typer.echo(_("\n=== Available Providers ==="))
        for name in global_config.providers.keys():
            typer.echo(f"- {name}")


@app.command()
def set_credential(
    key: str = typer.Argument(..., help=_("Credential key (e.g., hetzner_token)")),
    value: str = typer.Argument(..., help=_("Credential value")),
    provider: str = typer.Option(None, "--provider", help=_("Provider name (leave empty for global)"))
):
    """Set a credential value."""
    config_manager = get_config_manager()
    config_manager.set_credential(key, value, provider)

    if provider:
        typer.echo(_("✓ Credential '{key}' set for provider '{provider}'").format(key=key, provider=provider))
    else:
        typer.echo(_("✓ Global credential '{key}' set").format(key=key))


@app.command()
def get_credential(
    key: str = typer.Argument(..., help=_("Credential key")),
    provider: str = typer.Option(None, "--provider", help=_("Provider name"))
):
    """Get a credential value."""
    config_manager = get_config_manager()
    value = config_manager.get_credential(key, provider)

    if value:
        masked_value = "*" * len(value)
        if provider:
            typer.echo(_("{provider}/{key}: {value}").format(provider=provider, key=key, value=masked_value))
        else:
            typer.echo(_("{key}: {value}").format(key=key, value=masked_value))
    else:
        typer.echo(_("Credential not found: {key}").format(key=key))


@app.command()
def list_providers():
    """List available providers and their capabilities."""
    config_manager = get_config_manager()
    global_config = config_manager.load_global_config()

    typer.echo(_("=== Available Providers ==="))
    for name, provider_config in global_config.providers.items():
        typer.echo(f"\n{name}:")
        typer.echo(f"  Type: {provider_config.provider_type.value}")
        typer.echo(f"  Deployment Methods: {', '.join([m.value for m in provider_config.deployment_methods])}")
        if provider_config.regions:
            typer.echo(f"  Regions: {', '.join(provider_config.regions)}")
        if provider_config.server_types:
            typer.echo(f"  Server Types: {', '.join(provider_config.server_types)}")


@app.command()
def export(
    output_file: str = typer.Option(None, "--output", "-o", help=_("Output file (default: stdout)")),
    include_credentials: bool = typer.Option(False, "--include-credentials", help=_("Include credential values"))
):
    """Export configuration to JSON."""
    config_manager = get_config_manager()
    global_config = config_manager.load_global_config()

    # Convert to dictionary for JSON serialization
    data = {
        'default_ssh_user': global_config.default_ssh_user,
        'default_ssh_key': global_config.default_ssh_key,
        'default_ssh_port': global_config.default_ssh_port,
        'default_provider': global_config.default_provider.value,
        'default_deployment_method': global_config.default_deployment_method.value,
        'default_web_server': global_config.default_web_server.value,
        'project_defaults': global_config.project_defaults,
        'providers': {}
    }

    # Add provider configurations
    for name, provider_config in global_config.providers.items():
        provider_data = {
            'provider_type': provider_config.provider_type.value,
            'defaults': provider_config.defaults,
            'regions': provider_config.regions,
            'server_types': provider_config.server_types,
            'deployment_methods': [m.value for m in provider_config.deployment_methods]
        }

        # Include credentials only if requested
        if include_credentials:
            provider_data['credentials'] = provider_config.credentials

        data['providers'][name] = provider_data

    # Include global credentials only if requested
    if include_credentials:
        data['global_credentials'] = global_config.global_credentials

    # Output the configuration
    config_json = json.dumps(data, indent=2)

    if output_file:
        output_path = Path(output_file)
        output_path.write_text(config_json)
        typer.echo(_("Configuration exported to {file}").format(file=output_path))
    else:
        typer.echo(config_json)


@app.command()
def import_config(
    input_file: str = typer.Argument(..., help=_("JSON configuration file to import")),
    merge: bool = typer.Option(True, "--merge/--replace", help=_("Merge with existing config or replace"))
):
    """Import configuration from JSON file."""
    input_path = Path(input_file)
    if not input_path.exists():
        raise ForgeError(f"Configuration file not found: {input_file}")

    try:
        with open(input_path) as f:
            data = json.load(f)

        config_manager = get_config_manager()

        if not merge:
            # Replace entire configuration
            # This would require more careful implementation to handle all cases
            typer.echo(_("Warning: Full replacement not yet implemented. Merging instead."))

        # Import global settings
        global_config = config_manager.load_global_config()

        if 'default_ssh_user' in data:
            global_config.default_ssh_user = data['default_ssh_user']
        if 'default_ssh_key' in data:
            global_config.default_ssh_key = data['default_ssh_key']
        if 'default_ssh_port' in data:
            global_config.default_ssh_port = data['default_ssh_port']
        if 'default_provider' in data:
            global_config.default_provider = ServerType(data['default_provider'])
        if 'default_deployment_method' in data:
            global_config.default_deployment_method = DeploymentMethod(data['default_deployment_method'])
        if 'default_web_server' in data:
            global_config.default_web_server = WebServer(data['default_web_server'])
        if 'global_credentials' in data:
            global_config.global_credentials.update(data['global_credentials'])
        if 'project_defaults' in data:
            global_config.project_defaults.update(data['project_defaults'])

        # Import provider configurations
        if 'providers' in data:
            for name, provider_data in data['providers'].items():
                provider_config = config_manager.load_provider_config(name)

                if 'provider_type' in provider_data:
                    provider_config.provider_type = ServerType(provider_data['provider_type'])
                if 'credentials' in provider_data:
                    provider_config.credentials.update(provider_data['credentials'])
                if 'defaults' in provider_data:
                    provider_config.defaults.update(provider_data['defaults'])
                if 'regions' in provider_data:
                    provider_config.regions = provider_data['regions']
                if 'server_types' in provider_data:
                    provider_config.server_types = provider_data['server_types']
                if 'deployment_methods' in provider_data:
                    provider_config.deployment_methods = [
                        DeploymentMethod(method) for method in provider_data['deployment_methods']
                    ]

                config_manager.save_provider_config(name, provider_config)

        config_manager.save_global_config()
        typer.echo(_("✓ Configuration imported successfully from {file}").format(file=input_file))

    except json.JSONDecodeError as e:
        raise ForgeError(f"Invalid JSON in configuration file: {e}")
    except Exception as e:
        raise ForgeError(f"Failed to import configuration: {e}")


@app.command()
def reset():
    """Reset configuration to defaults."""
    if typer.confirm(_("This will reset all Forge configuration to defaults. Continue?")):
        config_manager = get_config_manager()

        # Remove configuration files
        if config_manager.global_config_file.exists():
            config_manager.global_config_file.unlink()

        for provider_file in config_manager.providers_dir.glob("*.json"):
            provider_file.unlink()

        # Reset in-memory config
        config_manager._global_config = None
        config_manager._provider_configs = {}

        typer.echo(_("✓ Configuration reset to defaults"))


if __name__ == "__main__":
    app()