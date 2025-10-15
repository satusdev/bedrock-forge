"""
CDN Management Utility for Bedrock Forge.

Provides comprehensive CDN integration and optimization for WordPress sites
with support for multiple CDN providers including Cloudflare, AWS CloudFront,
Fastly, KeyCDN, and custom CDN solutions.
"""

import json
import asyncio
import subprocess
import requests
import hashlib
import re
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import tempfile
import os

from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.shell import run_shell
from ..constants import *
from ..models.project import Project


class CDNProvider(Enum):
    """CDN provider enumeration."""
    CLOUDFLARE = "cloudflare"
    AWS_CLOUDFRONT = "aws_cloudfront"
    FASTLY = "fastly"
    KEYCDN = "keycdn"
    CUSTOM = "custom"
    NONE = "none"


class CDNStatus(Enum):
    """CDN status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    PENDING = "pending"


class CacheLevel(Enum):
    """CDN cache level enumeration."""
    BYPASS = "bypass"
    BASIC = "basic"
    STANDARD = "standard"
    AGGRESSIVE = "aggressive"
    CUSTOM = "custom"


@dataclass
class CDNConfig:
    """CDN configuration."""
    provider: CDNProvider
    enabled: bool
    domain: str
    zone_id: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    account_id: Optional[str] = None
    cache_level: CacheLevel = CacheLevel.STANDARD
    ttl: int = 86400  # 24 hours default
    compression: bool = True
    minify: bool = True
    brotli: bool = True
    custom_settings: Dict[str, Any] = None

    def __post_init__(self):
        if self.custom_settings is None:
            self.custom_settings = {}


@dataclass
class CDNStats:
    """CDN statistics."""
    provider: CDNProvider
    domain: str
    requests_served: int
    bandwidth_saved: int
    cache_hit_rate: float
    avg_response_time: float
    errors: int
    unique_visitors: int
    cached_requests: int
    uncached_requests: int
    timestamp: datetime


@dataclass
class CDNRule:
    """CDN cache rule."""
    name: str
    url_pattern: str
    cache_level: CacheLevel
    ttl: int
    browser_ttl: int
    edge_ttl: int
    bypass_cache_on_cookie: bool
    bypass_cache_on_query_string: bool
    custom_headers: Dict[str, str] = None
    enabled: bool = True

    def __post_init__(self):
        if self.custom_headers is None:
            self.custom_headers = {}


@dataclass
class CDNOptimizationResult:
    """Result of CDN optimization."""
    configs_updated: int
    rules_added: int
    domains_configured: int
    ssl_certificates: int
    performance_improvement: float
    bandwidth_savings: int
    recommendations: List[str]
    optimization_time: float


class CDNManager:
    """Main CDN management class."""

    def __init__(self, project: Project):
        """Initialize CDN manager."""
        self.project = project
        self.project_dir = Path(project.directory)
        self.cdn_config_path = self.project_dir / ".ddev" / "cdn_config.json"
        self.cdn_stats_path = self.project_dir / ".ddev" / "cdn_stats.db"
        self._init_database()
        self._load_cdn_config()

    def _init_database(self) -> None:
        """Initialize CDN statistics database."""
        import sqlite3

        with sqlite3.connect(self.cdn_stats_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS cdn_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    requests_served INTEGER DEFAULT 0,
                    bandwidth_saved INTEGER DEFAULT 0,
                    cache_hit_rate REAL DEFAULT 0.0,
                    avg_response_time REAL DEFAULT 0.0,
                    errors INTEGER DEFAULT 0,
                    unique_visitors INTEGER DEFAULT 0,
                    cached_requests INTEGER DEFAULT 0,
                    uncached_requests INTEGER DEFAULT 0,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS cdn_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    url_pattern TEXT NOT NULL,
                    cache_level TEXT NOT NULL,
                    ttl INTEGER,
                    browser_ttl INTEGER,
                    edge_ttl INTEGER,
                    bypass_cache_on_cookie BOOLEAN DEFAULT 0,
                    bypass_cache_on_query_string BOOLEAN DEFAULT 0,
                    custom_headers TEXT,
                    enabled BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS cdn_optimization_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider TEXT NOT NULL,
                    configs_updated INTEGER DEFAULT 0,
                    rules_added INTEGER DEFAULT 0,
                    domains_configured INTEGER DEFAULT 0,
                    ssl_certificates INTEGER DEFAULT 0,
                    performance_improvement REAL DEFAULT 0.0,
                    bandwidth_savings INTEGER DEFAULT 0,
                    recommendations TEXT,
                    optimization_time REAL DEFAULT 0.0,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_cdn_stats_timestamp
                ON cdn_stats(timestamp);
            """)

    def _load_cdn_config(self) -> None:
        """Load CDN configuration from file."""
        if self.cdn_config_path.exists():
            try:
                with open(self.cdn_config_path, 'r') as f:
                    config_data = json.load(f)
                    self.cdn_configs = self._parse_cdn_configs(config_data)
            except Exception as e:
                logger.error(f"Failed to load CDN config: {e}")
                self.cdn_configs = {}
        else:
            self.cdn_configs = {}

    def _parse_cdn_configs(self, config_data: Dict) -> Dict[str, CDNConfig]:
        """Parse CDN configuration data."""
        configs = {}
        for domain, domain_config in config_data.items():
            try:
                provider = CDNProvider(domain_config.get('provider', 'none'))
                config = CDNConfig(
                    provider=provider,
                    enabled=domain_config.get('enabled', False),
                    domain=domain,
                    zone_id=domain_config.get('zone_id'),
                    api_key=domain_config.get('api_key'),
                    api_secret=domain_config.get('api_secret'),
                    account_id=domain_config.get('account_id'),
                    cache_level=CacheLevel(domain_config.get('cache_level', 'standard')),
                    ttl=domain_config.get('ttl', CDN_CACHE_TTL),
                    compression=domain_config.get('compression', True),
                    minify=domain_config.get('minify', True),
                    brotli=domain_config.get('brotli', True),
                    custom_settings=domain_config.get('custom_settings', {})
                )
                configs[domain] = config
            except Exception as e:
                logger.error(f"Failed to parse CDN config for {domain}: {e}")

        return configs

    async def analyze_cdn_setup(self, detailed: bool = False) -> Dict[str, Any]:
        """Analyze current CDN setup and performance."""
        logger.info("Analyzing CDN setup...")

        try:
            analysis = {
                'cdn_configs': {},
                'cdn_stats': {},
                'plugin_status': await self._check_cdn_plugins(),
                'server_config': await self._check_server_cdn_config(),
                'domain_analysis': await self._analyze_domains(),
                'recommendations': [],
                'timestamp': datetime.now().isoformat()
            }

            # Analyze each CDN configuration
            for domain, config in self.cdn_configs.items():
                analysis['cdn_configs'][domain] = {
                    'provider': config.provider.value,
                    'enabled': config.enabled,
                    'cache_level': config.cache_level.value,
                    'ttl': config.ttl,
                    'compression': config.compression,
                    'minify': config.minify,
                    'brotli': config.brotli
                }

                # Get CDN statistics if available
                stats = await self._get_cdn_stats(config)
                if stats:
                    analysis['cdn_stats'][domain] = {
                        'requests_served': stats.requests_served,
                        'bandwidth_saved': stats.bandwidth_saved,
                        'cache_hit_rate': stats.cache_hit_rate,
                        'avg_response_time': stats.avg_response_time,
                        'errors': stats.errors
                    }

            # Generate recommendations
            analysis['recommendations'] = self._generate_cdn_recommendations(analysis)

            if detailed:
                analysis['detailed_analysis'] = await self._get_detailed_cdn_analysis()

            return analysis

        except Exception as e:
            raise ForgeError(f"CDN setup analysis failed: {str(e)}")

    async def _check_cdn_plugins(self) -> Dict[str, bool]:
        """Check status of CDN plugins."""
        plugins = {
            'cloudflare': False,
            'wp_offload_media': False,
            'wp_super_cache': False,
            'w3_total_cache': False
        }

        try:
            # Check installed plugins
            cmd = f"cd {self.project_dir} && ddev wp plugin list --status=active"
            result = run_shell(cmd, dry_run=False)

            if result:
                active_plugins = result.lower()
                for plugin in plugins:
                    if plugin.replace('_', '-') in active_plugins:
                        plugins[plugin] = True

        except Exception as e:
            logger.error(f"Failed to check CDN plugins: {e}")

        return plugins

    async def _check_server_cdn_config(self) -> Dict[str, Any]:
        """Check server-level CDN configuration."""
        server_config = {
            'nginx_proxy_cache': False,
            'apache_mod_cache': False,
            'varnish_cache': False,
            'ssl_termination': False,
            'gzip_compression': False,
            'brotli_compression': False
        }

        try:
            # Check for Nginx configuration
            nginx_config_path = self.project_dir / ".ddev" / "nginx" / "nginx-site.conf"
            if nginx_config_path.exists():
                with open(nginx_config_path, 'r') as f:
                    nginx_config = f.read()
                    if 'proxy_cache_path' in nginx_config:
                        server_config['nginx_proxy_cache'] = True
                    if 'gzip on' in nginx_config:
                        server_config['gzip_compression'] = True

        except Exception as e:
            logger.error(f"Failed to check server CDN config: {e}")

        return server_config

    async def _analyze_domains(self) -> Dict[str, Any]:
        """Analyze domains for CDN setup."""
        domains = {}

        try:
            # Get site URL
            cmd = f"cd {self.project_dir} && ddev wp option get siteurl"
            result = run_shell(cmd, dry_run=False)
            if result:
                site_url = result.strip()
                from urllib.parse import urlparse
                parsed = urlparse(site_url)
                domain = parsed.netloc

                # Check DNS configuration
                dns_info = await self._check_dns_configuration(domain)
                domains[domain] = {
                    'site_url': site_url,
                    'dns_configured': dns_info.get('configured', False),
                    'dns_provider': dns_info.get('provider'),
                    'cdn_records': dns_info.get('cdn_records', []),
                    'ssl_certificate': await self._check_ssl_certificate(domain)
                }

        except Exception as e:
            logger.error(f"Failed to analyze domains: {e}")

        return domains

    async def _check_dns_configuration(self, domain: str) -> Dict[str, Any]:
        """Check DNS configuration for CDN."""
        dns_info = {
            'configured': False,
            'provider': 'unknown',
            'cdn_records': []
        }

        try:
            # Check for common CDN CNAME records
            common_cdn_records = [
                'cdn.cloudflare.com',
                'cloudfront.net',
                'fastly.net',
                'keycdn.com'
            ]

            import subprocess
            try:
                # Use dig to check DNS records
                cmd = f"dig +short CNAME {domain}"
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)

                if result.returncode == 0:
                    cname = result.stdout.strip()
                    for cdn_record in common_cdn_records:
                        if cdn_record in cname:
                            dns_info['configured'] = True
                            dns_info['provider'] = cdn_record.split('.')[0]
                            dns_info['cdn_records'].append(cname)
                            break

            except subprocess.TimeoutExpired:
                logger.warning(f"DNS check timed out for {domain}")

        except Exception as e:
            logger.error(f"Failed to check DNS configuration: {e}")

        return dns_info

    async def _check_ssl_certificate(self, domain: str) -> Dict[str, Any]:
        """Check SSL certificate status."""
        ssl_info = {
            'valid': False,
            'issuer': 'unknown',
            'expiry_date': None,
            'days_until_expiry': None
        }

        try:
            import ssl
            import socket
            from datetime import datetime

            context = ssl.create_default_context()
            with socket.create_connection((domain, 443), timeout=10) as sock:
                with context.wrap_socket(sock, server_hostname=domain) as ssock:
                    cert = ssock.getpeercert()
                    ssl_info['valid'] = True
                    ssl_info['issuer'] = cert.get('issuer', [])

                    # Parse expiry date
                    for field, value in cert.get('subject', []):
                        if field[0] == 'notAfter':
                            ssl_info['expiry_date'] = value
                            expiry_date = datetime.strptime(value, '%b %d %H:%M:%S %Y %Z')
                            ssl_info['days_until_expiry'] = (expiry_date - datetime.now()).days
                            break

        except Exception as e:
            logger.error(f"Failed to check SSL certificate for {domain}: {e}")

        return ssl_info

    async def _get_cdn_stats(self, config: CDNConfig) -> Optional[CDNStats]:
        """Get CDN statistics for a specific configuration."""
        if not config.enabled:
            return None

        try:
            if config.provider == CDNProvider.CLOUDFLARE:
                return await self._get_cloudflare_stats(config)
            elif config.provider == CDNProvider.AWS_CLOUDFRONT:
                return await self._get_cloudfront_stats(config)
            elif config.provider == CDNProvider.FASTLY:
                return await self._get_fastly_stats(config)
            else:
                return None

        except Exception as e:
            logger.error(f"Failed to get CDN stats for {config.provider}: {e}")
            return None

    async def _get_cloudflare_stats(self, config: CDNConfig) -> Optional[CDNStats]:
        """Get Cloudflare statistics."""
        if not config.api_key or not config.zone_id:
            return None

        try:
            url = f"https://api.cloudflare.com/client/v4/zones/{config.zone_id}/analytics/dashboard"
            headers = {
                'Authorization': f'Bearer {config.api_key}',
                'Content-Type': 'application/json'
            }

            response = requests.get(url, headers=headers, timeout=30)
            if response.status_code == 200:
                data = response.json()
                return CDNStats(
                    provider=CDNProvider.CLOUDFLARE,
                    domain=config.domain,
                    requests_served=data.get('requests', {}).get('all', 0),
                    bandwidth_saved=data.get('bandwidth', {}).get('cached', 0),
                    cache_hit_rate=data.get('cache', {}).get('hit_rate', 0.0),
                    avg_response_time=data.get('threats', {}).get('avg_response_time', 0.0),
                    errors=data.get('requests', {}).get('threat', 0),
                    unique_visitors=data.get('requests', {}).get('uniques', {}).get('all', 0),
                    cached_requests=data.get('requests', {}).get('cached', 0),
                    uncached_requests=data.get('requests', {}).get('uncached', 0),
                    timestamp=datetime.now()
                )

        except Exception as e:
            logger.error(f"Failed to get Cloudflare stats: {e}")

        return None

    async def _get_cloudfront_stats(self, config: CDNConfig) -> Optional[CDNStats]:
        """Get AWS CloudFront statistics."""
        # Simplified implementation - would require AWS SDK
        return None

    async def _get_fastly_stats(self, config: CDNConfig) -> Optional[CDNStats]:
        """Get Fastly statistics."""
        # Simplified implementation - would require Fastly API
        return None

    async def _get_detailed_cdn_analysis(self) -> Dict[str, Any]:
        """Get detailed CDN analysis."""
        detailed = {
            'performance_metrics': await self._get_performance_metrics(),
            'optimization_opportunities': await self._identify_optimization_opportunities(),
            'cost_analysis': await self._analyze_cdn_costs(),
            'security_analysis': await self._analyze_cdn_security()
        }

        return detailed

    async def _get_performance_metrics(self) -> Dict[str, Any]:
        """Get CDN performance metrics."""
        metrics = {
            'response_times': [],
            'cache_efficiency': {},
            'geographic_distribution': {}
        }

        # Implementation would gather detailed performance metrics
        return metrics

    async def _identify_optimization_opportunities(self) -> List[str]:
        """Identify CDN optimization opportunities."""
        opportunities = []

        try:
            # Check for common optimization opportunities
            for domain, config in self.cdn_configs.items():
                if not config.enabled:
                    opportunities.append(f"Enable CDN for domain: {domain}")
                    continue

                if config.cache_level == CacheLevel.BASIC:
                    opportunities.append(f"Upgrade cache level from Basic to Standard for: {domain}")

                if not config.compression:
                    opportunities.append(f"Enable compression for: {domain}")

                if not config.minify:
                    opportunities.append(f"Enable minification for: {domain}")

        except Exception as e:
            logger.error(f"Failed to identify optimization opportunities: {e}")

        return opportunities

    async def _analyze_cdn_costs(self) -> Dict[str, Any]:
        """Analyze CDN costs and savings."""
        cost_analysis = {
            'current_costs': {},
            'potential_savings': {},
            'cost_per_request': {},
            'bandwidth_costs': {}
        }

        # Implementation would analyze CDN costs
        return cost_analysis

    async def _analyze_cdn_security(self) -> Dict[str, Any]:
        """Analyze CDN security configuration."""
        security = {
            'ssl_status': {},
            'firewall_rules': {},
            'ddos_protection': {},
            'security_headers': {}
        }

        # Implementation would analyze security settings
        return security

    def _generate_cdn_recommendations(self, analysis: Dict[str, Any]) -> List[str]:
        """Generate CDN optimization recommendations."""
        recommendations = []

        # Plugin recommendations
        plugins = analysis.get('plugin_status', {})
        if not any(plugins.values()):
            recommendations.append("Install a CDN plugin (Cloudflare, WP Offload Media)")
        elif plugins.get('cloudflare') and not plugins.get('wp_offload_media'):
            recommendations.append("Install WP Offload Media for better file optimization")

        # Domain recommendations
        domains = analysis.get('domain_analysis', {})
        for domain, domain_info in domains.items():
            if not domain_info.get('dns_configured'):
                recommendations.append(f"Configure DNS for CDN on domain: {domain}")

            ssl_info = domain_info.get('ssl_certificate', {})
            if ssl_info.get('days_until_expiry', 0) < 30:
                recommendations.append(f"SSL certificate expires soon for {domain}")

        # Configuration recommendations
        cdn_configs = analysis.get('cdn_configs', {})
        if not cdn_configs:
            recommendations.append("Set up CDN configuration for your site")
        else:
            for domain, config in cdn_configs.items():
                if not config.get('enabled'):
                    recommendations.append(f"Enable CDN for domain: {domain}")

                if config.get('ttl', 0) < 3600:
                    recommendations.append(f"Increase cache TTL to at least 1 hour for: {domain}")

        # Performance recommendations
        cdn_stats = analysis.get('cdn_stats', {})
        for domain, stats in cdn_stats.items():
            if stats.get('cache_hit_rate', 0) < 70:
                recommendations.append(f"Low cache hit rate ({stats['cache_hit_rate']:.1f}%) for {domain}")

            if stats.get('avg_response_time', 0) > 500:
                recommendations.append(f"High response time ({stats['avg_response_time']:.0f}ms) for {domain}")

        # General recommendations
        recommendations.append("Set up automatic SSL certificate renewal")
        recommendations.append("Configure CDN edge caching rules")
        recommendations.append("Implement CDN cache warming for critical pages")
        recommendations.append("Monitor CDN performance and costs regularly")

        return recommendations

    async def setup_cdn(
        self,
        provider: str,
        domain: str,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        account_id: Optional[str] = None,
        preset: str = "basic"
    ) -> CDNOptimizationResult:
        """Set up CDN configuration."""
        logger.info(f"Setting up CDN with provider: {provider}")

        start_time = datetime.now()
        result = CDNOptimizationResult(
            configs_updated=0,
            rules_added=0,
            domains_configured=0,
            ssl_certificates=0,
            performance_improvement=0.0,
            bandwidth_savings=0,
            recommendations=[],
            optimization_time=0.0

        )

        try:
            # Validate provider
            try:
                cdn_provider = CDNProvider(provider)
            except ValueError:
                raise ForgeError(f"Invalid CDN provider: {provider}")

            # Create CDN configuration
            config = CDNConfig(
                provider=cdn_provider,
                enabled=True,
                domain=domain,
                api_key=api_key,
                api_secret=api_secret,
                account_id=account_id,
                cache_level=CacheLevel.STANDARD,
                ttl=CDN_CACHE_TTL,
                compression=True,
                minify=True,
                brotli=True
            )

            # Add configuration
            self.cdn_configs[domain] = config
            result.configs_updated += 1

            # Configure domain
            if cdn_provider == CDNProvider.CLOUDFLARE:
                await self._setup_cloudflare_domain(config)
                result.domains_configured += 1

            # Add standard cache rules
            rules = await self._get_default_cache_rules(cdn_provider)
            for rule in rules:
                await self._add_cache_rule(rule)
                result.rules_added += 1

            # Apply optimizations
            await self._apply_cdn_optimizations(config)

            # Generate recommendations
            result.recommendations = self._generate_post_setup_recommendations(cdn_provider)

            # Save configuration
            await self._save_cdn_config()

            result.optimization_time = (datetime.now() - start_time).total_seconds()

            logger.info(f"CDN setup completed in {result.optimization_time:.2f}s")
            return result

        except Exception as e:
            raise ForgeError(f"CDN setup failed: {str(e)}")

    async def _setup_cloudflare_domain(self, config: CDNConfig) -> None:
        """Set up Cloudflare domain configuration."""
        if not config.api_key or not config.zone_id:
            raise ForgeError("Cloudflare API key and zone ID are required")

        try:
            # Configure zone settings
            url = f"https://api.cloudflare.com/client/v4/zones/{config.zone_id}/settings"
            headers = {
                'Authorization': f'Bearer {config.api_key}',
                'Content-Type': 'application/json'
            }

            # Enable compression
            compression_data = {'value': 'on'}
            response = requests.patch(f"{url}/compression", headers=headers, json=compression_data)

            # Enable brotli
            brotli_data = {'value': 'on'}
            response = requests.patch(f"{url}/brotli", headers=headers, json=brotli_data)

            # Enable minify
            minify_data = {'value': 'on'}
            response = requests.patch(f"{url}/minify", headers=headers, json=minify_data)

        except Exception as e:
            logger.error(f"Failed to setup Cloudflare domain: {e}")

    async def _get_default_cache_rules(self, provider: CDNProvider) -> List[CDNRule]:
        """Get default cache rules for a provider."""
        rules = []

        if provider == CDNProvider.CLOUDFLARE:
            # Static assets cache rule
            rules.append(CDNRule(
                name="Static Assets",
                url_pattern="*.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)",
                cache_level=CacheLevel.AGGRESSIVE,
                ttl=31536000,  # 1 year
                browser_ttl=604800,  # 1 week
                edge_ttl=2592000,  # 30 days
                bypass_cache_on_cookie=False,
                bypass_cache_on_query_string=False,
                custom_headers={
                    'Cache-Control': 'public, max-age=31536000, immutable'
                }
            ))

            # HTML cache rule
            rules.append(CDNRule(
                name="HTML Pages",
                url_pattern="*.html",
                cache_level=CacheLevel.STANDARD,
                ttl=3600,  # 1 hour
                browser_ttl=7200,  # 2 hours
                edge_ttl=3600,  # 1 hour
                bypass_cache_on_cookie=True,
                bypass_cache_on_query_string=False,
                custom_headers={
                    'Cache-Control': 'public, max-age=3600'
                }
            ))

        return rules

    async def _add_cache_rule(self, rule: CDNRule) -> None:
        """Add cache rule to database."""
        import sqlite3

        with sqlite3.connect(self.cdn_stats_path) as conn:
            conn.execute("""
                INSERT INTO cdn_rules (
                    name, provider, domain, url_pattern, cache_level,
                    ttl, browser_ttl, edge_ttl, bypass_cache_on_cookie,
                    bypass_cache_on_query_string, custom_headers
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                rule.name,
                "configured",
                "default",
                rule.url_pattern,
                rule.cache_level.value,
                rule.ttl,
                rule.browser_ttl,
                rule.edge_ttl,
                rule.bypass_cache_on_cookie,
                rule.bypass_cache_on_query_string,
                json.dumps(rule.custom_headers) if rule.custom_headers else None
            ))

    async def _apply_cdn_optimizations(self, config: CDNConfig) -> None:
        """Apply CDN optimizations."""
        try:
            # Add CDN constants to wp-config.php
            await self._add_cdn_constants(config)

            # Install and configure CDN plugin
            await self._setup_cdn_plugin(config)

        except Exception as e:
            logger.error(f"Failed to apply CDN optimizations: {e}")

    async def _add_cdn_constants(self, config: CDNConfig) -> None:
        """Add CDN constants to wp-config.php."""
        try:
            wp_config_path = self.project_dir / "web" / "wp-config.php"
            if not wp_config_path.exists():
                return

            # Read current wp-config.php
            with open(wp_config_path, 'r') as f:
                content = f.read()

            # Add CDN constants if not present
            cdn_constants = f"""
// CDN Configuration
define('WP_HOME_URL', '{config.domain}');
define('WP_SITEURL', '{config.domain}');

// CDN settings
define('CDN_ENABLED', true);
define('CDN_DOMAIN', '{config.domain}');
define('CDN_CACHE_LEVEL', '{config.cache_level.value}');
"""

            if 'define(\'CDN_ENABLED\'' not in content:
                with open(wp_config_path, 'a') as f:
                    f.write(cdn_constants)

        except Exception as e:
            logger.error(f"Failed to add CDN constants: {e}")

    async def _setup_cdn_plugin(self, config: CDNConfig) -> None:
        """Set up CDN plugin."""
        try:
            if config.provider == CDNProvider.CLOUDFLARE:
                # Install Cloudflare plugin
                cmd = f"cd {self.project_dir} && ddev wp plugin install cloudflare --activate"
                run_shell(cmd, dry_run=False)

            elif config.provider == CDNProvider.AWS_CLOUDFRONT:
                # Install W3 Total Cache for CloudFront
                cmd = f"cd {self.project_dir} && ddev wp plugin install w3-total-cache --activate"
                run_shell(cmd, dry_run=False)

        except Exception as e:
            logger.error(f"Failed to setup CDN plugin: {e}")

    def _generate_post_setup_recommendations(self, provider: CDNProvider) -> List[str]:
        """Generate post-setup recommendations."""
        recommendations = [
            "Test CDN configuration with different content types",
            "Monitor CDN performance and hit rates",
            "Set up cache warming for critical pages",
            "Configure custom cache rules for dynamic content",
            "Implement CDN analytics and monitoring",
            "Review CDN costs and optimize usage",
            "Set up CDN security features (DDoS protection, WAF)",
            "Configure CDN edge locations for global performance",
            "Test failover and redundancy configurations"
        ]

        if provider == CDNProvider.CLOUDFLARE:
            recommendations.extend([
                "Configure Cloudflare Workers for edge computing",
                "Set up Cloudflare Page Rules for advanced routing",
                "Configure Cloudflare Firewall rules",
                "Set up Cloudflare Argo Smart Routing"
            ])

        return recommendations

    async def _save_cdn_config(self) -> None:
        """Save CDN configuration to file."""
        config_data = {}
        for domain, config in self.cdn_configs.items():
            config_data[domain] = {
                'provider': config.provider.value,
                'enabled': config.enabled,
                'zone_id': config.zone_id,
                'api_key': config.api_key,
                'api_secret': config.api_secret,
                'account_id': config.account_id,
                'cache_level': config.cache_level.value,
                'ttl': config.ttl,
                'compression': config.compression,
                'minify': config.minify,
                'brotli': config.brotli,
                'custom_settings': config.custom_settings
            }

        with open(self.cdn_config_path, 'w') as f:
            json.dump(config_data, f, indent=2)

    async def clear_cdn_cache(self, domain: Optional[str] = None, pattern: Optional[str] = None) -> bool:
        """Clear CDN cache for specified domain."""
        try:
            cleared = False

            for config_domain, config in self.cdn_configs.items():
                if domain and config_domain != domain:
                    continue

                if not config.enabled:
                    continue

                if config.provider == CDNProvider.CLOUDFLARE:
                    # Clear Cloudflare cache
                    if config.api_key and config.zone_id:
                        url = f"https://api.cloudflare.com/client/v4/zones/{config.zone_id}/purge_cache"
                        headers = {
                            'Authorization': f'Bearer {config.api_key}',
                            'Content-Type': 'application/json'
                        }

                        purge_data = {'purge_everything': True}
                        response = requests.delete(url, headers=headers, json=purge_data)
                        if response.status_code == 200:
                            cleared = True
                            logger.info(f"Cleared Cloudflare cache for: {config_domain}")

                # Add other providers as needed

            return cleared

        except Exception as e:
            logger.error(f"Failed to clear CDN cache: {e}")
            return False

    async def get_cdn_health(self) -> Dict[str, Any]:
        """Get CDN health status."""
        try:
            analysis = await self.analyze_cdn_performance()

            health_score = 100
            issues = []
            warnings = []

            # Check CDN configurations
            cdn_configs = analysis.get('cdn_configs', {})
            if not cdn_configs:
                health_score -= 30
                issues.append("No CDN configuration found")
            else:
                enabled_configs = sum(1 for cfg in cdn_configs.values() if cfg.get('enabled'))
                if enabled_configs == 0:
                    health_score -= 25
                    issues.append("No CDN configurations enabled")
                elif enabled_configs < len(cdn_configs):
                    health_score -= 10
                    warnings.append(f"Only {enabled_configs}/{len(cdn_configs)} CDN configs enabled")

            # Check DNS configuration
            domains = analysis.get('domain_analysis', {})
            unconfigured_domains = sum(1 for domain_info in domains.values()
                                     if not domain_info.get('dns_configured'))
            if unconfigured_domains > 0:
                health_score -= unconfigured_domains * 15
                issues.append(f"{unconfigured_domains} domains not configured for CDN")

            # Check SSL certificates
            expiring_soon = sum(1 for domain_info in domains.values()
                               if domain_info.get('ssl_certificate', {}).get('days_until_expiry', 999) < 30)
            if expiring_soon > 0:
                health_score -= expiring_soon * 5
                warnings.append(f"{expiring_soon} SSL certificates expiring soon")

            # Check performance
            cdn_stats = analysis.get('cdn_stats', {})
            for domain, stats in cdn_stats.items():
                hit_rate = stats.get('cache_hit_rate', 0)
                if hit_rate < 50:
                    health_score -= 15
                    issues.append(f"Very low cache hit rate for {domain}: {hit_rate:.1f}%")
                elif hit_rate < 70:
                    health_score -= 8
                    warnings.append(f"Low cache hit rate for {domain}: {hit_rate:.1f}%")

            return {
                'health_score': max(0, health_score),
                'status': 'healthy' if health_score >= 80 else 'warning' if health_score >= 60 else 'critical',
                'issues': issues,
                'warnings': warnings,
                'recommendations': analysis.get('recommendations', [])
            }

        except Exception as e:
            logger.error(f"Failed to get CDN health: {e}")
            return {
                'health_score': 0,
                'status': 'error',
                'issues': [f"Failed to analyze CDN health: {str(e)}"],
                'warnings': [],
                'recommendations': []
            }