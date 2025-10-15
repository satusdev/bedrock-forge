"""
Advanced Cache Management Utility for Bedrock Forge.

Provides comprehensive caching strategies including page caching, object caching,
browser caching, and intelligent cache invalidation for WordPress sites.
"""

import json
import asyncio
import subprocess
import re
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum

from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.shell import run_shell
from ..constants import *
from ..models.project import Project


class CacheType(Enum):
    """Cache type enumeration."""
    PAGE = "page"
    OBJECT = "object"
    BROWSER = "browser"
    CDN = "cdn"
    OPcode = "opcode"
    DATABASE = "database"


class CacheStrategy(Enum):
    """Cache strategy enumeration."""
    NONE = "none"
    BASIC = "basic"
    AGGRESSIVE = "aggressive"
    CUSTOM = "custom"


class CacheStatus(Enum):
    """Cache status enumeration."""
    ENABLED = "enabled"
    DISABLED = "disabled"
    PARTIAL = "partial"
    ERROR = "error"


@dataclass
class CacheConfig:
    """Cache configuration."""
    cache_type: CacheType
    strategy: CacheStrategy
    enabled: bool
    ttl: int  # Time to live in seconds
    max_size: Optional[int] = None  # Maximum cache size in bytes
    compression: bool = False
    invalidation_rules: List[str] = None
    custom_settings: Dict[str, Any] = None

    def __post_init__(self):
        if self.invalidation_rules is None:
            self.invalidation_rules = []
        if self.custom_settings is None:
            self.custom_settings = {}


@dataclass
class CacheStats:
    """Cache statistics."""
    cache_type: CacheType
    hits: int
    misses: int
    sets: int
    deletes: int
    evictions: int
    current_size: int
    max_size: Optional[int]
    hit_rate: float
    memory_usage: int
    timestamp: datetime

    def __post_init__(self):
        if self.max_size:
            self.hit_rate = self.hits / max(self.hits + self.misses, 1) * 100
        else:
            self.hit_rate = 0.0


@dataclass
class CacheInvalidationRule:
    """Cache invalidation rule."""
    name: str
    trigger: str  # post_save, post_delete, comment_save, etc.
    cache_types: List[CacheType]
    conditions: Dict[str, Any]
    action: str  # clear, refresh, partial_clear


@dataclass
class CacheOptimizationResult:
    """Result of cache optimization."""
    configs_updated: int
    rules_added: int
    cache_warmed: int
    performance_improvement: float
    recommendations: List[str]
    optimization_time: float


class CacheManager:
    """Main cache management class."""

    def __init__(self, project: Project):
        """Initialize cache manager."""
        self.project = project
        self.project_dir = Path(project.directory)
        self.cache_config_path = self.project_dir / ".ddev" / "cache_config.json"
        self.cache_stats_path = self.project_dir / ".ddev" / "cache_stats.db"
        self._init_database()
        self._load_cache_config()

    def _init_database(self) -> None:
        """Initialize cache statistics database."""
        import sqlite3

        with sqlite3.connect(self.cache_stats_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS cache_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cache_type TEXT NOT NULL,
                    hits INTEGER DEFAULT 0,
                    misses INTEGER DEFAULT 0,
                    sets INTEGER DEFAULT 0,
                    deletes INTEGER DEFAULT 0,
                    evictions INTEGER DEFAULT 0,
                    current_size INTEGER DEFAULT 0,
                    max_size INTEGER,
                    memory_usage INTEGER DEFAULT 0,
                    hit_rate REAL DEFAULT 0.0,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS cache_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cache_type TEXT NOT NULL,
                    action TEXT NOT NULL,
                    cache_key TEXT,
                    size INTEGER,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS cache_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    trigger TEXT NOT NULL,
                    cache_types TEXT NOT NULL,
                    conditions TEXT,
                    action TEXT NOT NULL,
                    enabled BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_cache_stats_timestamp
                ON cache_stats(timestamp);
            """)

    def _load_cache_config(self) -> None:
        """Load cache configuration from file."""
        if self.cache_config_path.exists():
            try:
                with open(self.cache_config_path, 'r') as f:
                    config_data = json.load(f)
                    self.cache_configs = self._parse_cache_configs(config_data)
            except Exception as e:
                logger.error(f"Failed to load cache config: {e}")
                self.cache_configs = self._get_default_cache_configs()
        else:
            self.cache_configs = self._get_default_cache_configs()

    def _parse_cache_configs(self, config_data: Dict) -> Dict[CacheType, CacheConfig]:
        """Parse cache configuration data."""
        configs = {}
        for cache_type_name, cache_data in config_data.items():
            try:
                cache_type = CacheType(cache_type_name)
                strategy = CacheStrategy(cache_data.get('strategy', 'basic'))

                config = CacheConfig(
                    cache_type=cache_type,
                    strategy=strategy,
                    enabled=cache_data.get('enabled', True),
                    ttl=cache_data.get('ttl', 3600),
                    max_size=cache_data.get('max_size'),
                    compression=cache_data.get('compression', False),
                    invalidation_rules=cache_data.get('invalidation_rules', []),
                    custom_settings=cache_data.get('custom_settings', {})
                )
                configs[cache_type] = config
            except Exception as e:
                logger.error(f"Failed to parse cache config for {cache_type_name}: {e}")

        return configs

    def _get_default_cache_configs(self) -> Dict[CacheType, CacheConfig]:
        """Get default cache configurations."""
        return {
            CacheType.PAGE: CacheConfig(
                cache_type=CacheType.PAGE,
                strategy=CacheStrategy.BASIC,
                enabled=True,
                ttl=CACHE_PAGE_TTL,
                compression=True,
                invalidation_rules=[
                    "post_save",
                    "post_delete",
                    "comment_save"
                ]
            ),
            CacheType.OBJECT: CacheConfig(
                cache_type=CacheType.OBJECT,
                strategy=CacheStrategy.BASIC,
                enabled=True,
                ttl=CACHE_API_TTL,
                compression=False
            ),
            CacheType.BROWSER: CacheConfig(
                cache_type=CacheType.BROWSER,
                strategy=CacheStrategy.AGGRESSIVE,
                enabled=True,
                ttl=CACHE_BROWSER_TTL,
                max_size=100 * 1024 * 1024  # 100MB
            ),
            CacheType.OPcode: CacheConfig(
                cache_type=CacheType.OPcode,
                strategy=CacheStrategy.BASIC,
                enabled=True,
                ttl=3600,
                compression=False
            )
        }

    async def analyze_cache_performance(self, detailed: bool = False) -> Dict[str, Any]:
        """Analyze current cache performance."""
        logger.info("Analyzing cache performance...")

        try:
            analysis = {
                'cache_configs': {},
                'cache_stats': {},
                'plugin_status': await self._check_cache_plugins(),
                'server_cache': await self._check_server_cache(),
                'recommendations': [],
                'timestamp': datetime.now().isoformat()
            }

            # Analyze each cache type
            for cache_type, config in self.cache_configs.items():
                analysis['cache_configs'][cache_type.value] = {
                    'enabled': config.enabled,
                    'strategy': config.strategy.value,
                    'ttl': config.ttl,
                    'max_size': config.max_size,
                    'compression': config.compression
                }

                # Get cache statistics
                stats = await self._get_cache_stats(cache_type)
                if stats:
                    analysis['cache_stats'][cache_type.value] = {
                        'hits': stats.hits,
                        'misses': stats.misses,
                        'hit_rate': stats.hit_rate,
                        'current_size': stats.current_size,
                        'memory_usage': stats.memory_usage
                    }

            # Generate recommendations
            analysis['recommendations'] = self._generate_cache_recommendations(analysis)

            if detailed:
                analysis['detailed_analysis'] = await self._get_detailed_cache_analysis()

            return analysis

        except Exception as e:
            raise ForgeError(f"Cache performance analysis failed: {str(e)}")

    async def _check_cache_plugins(self) -> Dict[str, bool]:
        """Check status of caching plugins."""
        plugins = {
            'wp_super_cache': False,
            'w3_total_cache': False,
            'wp_rocket': False,
            'litespeed_cache': False,
            'wp_optimize': False
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
            logger.error(f"Failed to check cache plugins: {e}")

        return plugins

    async def _check_server_cache(self) -> Dict[str, Any]:
        """Check server-level caching configuration."""
        server_info = {
            'nginx_cache': False,
            'apache_cache': False,
            'varnish_cache': False,
            'php_opcache': False,
            'redis_cache': False,
            'memcached_cache': False
        }

        try:
            # Check PHP OPcache
            cmd = f"cd {self.project_dir} && ddev exec php -m | grep -i opcache"
            result = run_shell(cmd, dry_run=False)
            server_info['php_opcache'] = bool(result)

            # Check for Redis
            cmd = f"cd {self.project_dir} && ddev exec redis-cli ping 2>/dev/null"
            result = run_shell(cmd, dry_run=False)
            server_info['redis_cache'] = 'PONG' in result if result else False

            # Check for Memcached
            cmd = f"cd {self.project_dir} && ddev exec nc -z memcached 11211 2>/dev/null"
            result = run_shell(cmd, dry_run=False)
            server_info['memcached_cache'] = result.returncode == 0

        except Exception as e:
            logger.error(f"Failed to check server cache: {e}")

        return server_info

    async def _get_cache_stats(self, cache_type: CacheType) -> Optional[CacheStats]:
        """Get statistics for a specific cache type."""
        try:
            import sqlite3

            with sqlite3.connect(self.cache_stats_path) as conn:
                cursor = conn.execute("""
                    SELECT * FROM cache_stats
                    WHERE cache_type = ?
                    ORDER BY timestamp DESC
                    LIMIT 1
                """, (cache_type.value,))

                row = cursor.fetchone()
                if row:
                    return CacheStats(
                        cache_type=CacheType(row[1]),
                        hits=row[2],
                        misses=row[3],
                        sets=row[4],
                        deletes=row[5],
                        evictions=row[6],
                        current_size=row[7],
                        max_size=row[8],
                        hit_rate=row[10],
                        memory_usage=row[11],
                        timestamp=datetime.fromisoformat(row[12]) if row[12] else datetime.now()
                    )
        except Exception as e:
            logger.error(f"Failed to get cache stats for {cache_type}: {e}")

        return None

    async def _get_detailed_cache_analysis(self) -> Dict[str, Any]:
        """Get detailed cache analysis."""
        detailed = {
            'plugin_settings': await self._get_plugin_cache_settings(),
            'cache_keys': await self._analyze_cache_keys(),
            'invalidation_patterns': await self._analyze_invalidation_patterns(),
            'bottlenecks': await self._identify_cache_bottlenecks()
        }

        return detailed

    async def _get_plugin_cache_settings(self) -> Dict[str, Any]:
        """Get cache plugin settings."""
        settings = {}

        try:
            # Get WP Super Cache settings
            cmd = f"cd {self.project_dir} && ddev wp option get wp_cache_options"
            result = run_shell(cmd, dry_run=False)
            if result and result != "No option found.":
                settings['wp_super_cache'] = json.loads(result)

        except Exception as e:
            logger.error(f"Failed to get plugin cache settings: {e}")

        return settings

    async def _analyze_cache_keys(self) -> Dict[str, Any]:
        """Analyze cache key patterns."""
        try:
            import sqlite3

            with sqlite3.connect(self.cache_stats_path) as conn:
                cursor = conn.execute("""
                    SELECT cache_key, COUNT(*) as usage_count
                    FROM cache_history
                    WHERE timestamp >= datetime('now', '-24 hours')
                    GROUP BY cache_key
                    ORDER BY usage_count DESC
                    LIMIT 20
                """)

                keys = {}
                for row in cursor.fetchall():
                    keys[row[0]] = row[1]

                return {
                    'most_used_keys': keys,
                    'total_cache_operations': sum(keys.values())
                }

        except Exception as e:
            logger.error(f"Failed to analyze cache keys: {e}")
            return {}

    async def _analyze_invalidation_patterns(self) -> Dict[str, Any]:
        """Analyze cache invalidation patterns."""
        try:
            import sqlite3

            with sqlite3.connect(self.cache_stats_path) as conn:
                cursor = conn.execute("""
                    SELECT action, COUNT(*) as count
                    FROM cache_history
                    WHERE timestamp >= datetime('now', '-24 hours')
                    GROUP BY action
                """)

                patterns = {}
                for row in cursor.fetchall():
                    patterns[row[0]] = row[1]

                return patterns

        except Exception as e:
            logger.error(f"Failed to analyze invalidation patterns: {e}")
            return {}

    async def _identify_cache_bottlenecks(self) -> List[str]:
        """Identify cache bottlenecks."""
        bottlenecks = []

        try:
            # Check hit rates
            for cache_type, config in self.cache_configs.items():
                if config.enabled:
                    stats = await self._get_cache_stats(cache_type)
                    if stats and stats.hit_rate < 50:
                        bottlenecks.append(f"Low hit rate for {cache_type.value}: {stats.hit_rate:.1f}%")

            # Check memory usage
            server_cache = await self._check_server_cache()
            if not server_cache['php_opcache']:
                bottlenecks.append("PHP OPcache not enabled")

            # Check plugin conflicts
            plugins = await self._check_cache_plugins()
            active_caching_plugins = sum(plugins.values())
            if active_caching_plugins > 1:
                bottlenecks.append("Multiple caching plugins active - potential conflicts")

        except Exception as e:
            logger.error(f"Failed to identify bottlenecks: {e}")

        return bottlenecks

    def _generate_cache_recommendations(self, analysis: Dict[str, Any]) -> List[str]:
        """Generate cache optimization recommendations."""
        recommendations = []

        # Plugin recommendations
        plugins = analysis.get('plugin_status', {})
        if not any(plugins.values()):
            recommendations.append("Install a caching plugin (WP Super Cache, W3 Total Cache, or WP Rocket)")
        elif sum(plugins.values()) > 1:
            recommendations.append("Deactivate conflicting caching plugins - use only one")

        # Server cache recommendations
        server_cache = analysis.get('server_cache', {})
        if not server_cache['php_opcache']:
            recommendations.append("Enable PHP OPcache for better performance")

        # Configuration recommendations
        cache_configs = analysis.get('cache_configs', {})
        for cache_type, config in cache_configs.items():
            if not config.get('enabled'):
                recommendations.append(f"Enable {cache_type} caching")

            if cache_type == 'page' and config.get('ttl', 0) < 3600:
                recommendations.append("Increase page cache TTL to at least 1 hour")

        # Performance recommendations
        bottlenecks = analysis.get('detailed_analysis', {}).get('bottlenecks', [])
        recommendations.extend(bottlenecks)

        # General recommendations
        recommendations.append("Implement cache warming for frequently accessed pages")
        recommendations.append("Set up cache invalidation rules for dynamic content")
        recommendations.append("Monitor cache hit rates and adjust TTL accordingly")

        return recommendations

    async def optimize_cache_configuration(self, preset: str = "business", auto: bool = False) -> CacheOptimizationResult:
        """Optimize cache configuration based on preset."""
        logger.info(f"Optimizing cache configuration with preset: {preset}")

        start_time = datetime.now()
        result = CacheOptimizationResult(
            configs_updated=0,
            rules_added=0,
            cache_warmed=0,
            performance_improvement=0.0,
            recommendations=[],
            optimization_time=0.0
        )

        try:
            # Load preset configuration
            preset_config = await self._load_cache_preset(preset)

            # Update cache configurations
            for cache_type_name, config_data in preset_config.get('cache_configs', {}).items():
                try:
                    cache_type = CacheType(cache_type_name)
                    config = CacheConfig(
                        cache_type=cache_type,
                        strategy=CacheStrategy(config_data.get('strategy', 'basic')),
                        enabled=config_data.get('enabled', True),
                        ttl=config_data.get('ttl', 3600),
                        max_size=config_data.get('max_size'),
                        compression=config_data.get('compression', False),
                        invalidation_rules=config_data.get('invalidation_rules', []),
                        custom_settings=config_data.get('custom_settings', {})
                    )

                    self.cache_configs[cache_type] = config
                    result.configs_updated += 1

                except Exception as e:
                    logger.error(f"Failed to update cache config for {cache_type_name}: {e}")

            # Add invalidation rules
            for rule_data in preset_config.get('invalidation_rules', []):
                try:
                    rule = CacheInvalidationRule(
                        name=rule_data['name'],
                        trigger=rule_data['trigger'],
                        cache_types=[CacheType(ct) for ct in rule_data['cache_types']],
                        conditions=rule_data.get('conditions', {}),
                        action=rule_data.get('action', 'clear')
                    )

                    await self._add_invalidation_rule(rule)
                    result.rules_added += 1

                except Exception as e:
                    logger.error(f"Failed to add invalidation rule: {e}")

            # Apply optimizations
            if not auto:
                await self._apply_cache_optimizations()

            # Generate recommendations
            result.recommendations = self._generate_post_optimization_recommendations()

            # Save configuration
            await self._save_cache_config()

            result.optimization_time = (datetime.now() - start_time).total_seconds()

            logger.info(f"Cache optimization completed in {result.optimization_time:.2f}s")
            return result

        except Exception as e:
            raise ForgeError(f"Cache optimization failed: {str(e)}")

    async def _load_cache_preset(self, preset: str) -> Dict[str, Any]:
        """Load cache preset configuration."""
        preset_path = Path(PERFORMANCE_CONFIG_PATH)
        if not preset_path.exists():
            raise ForgeError(f"Performance presets file not found: {preset_path}")

        with open(preset_path, 'r') as f:
            presets = json.load(f)

        if preset not in presets.get("presets", {}):
            raise ForgeError(f"Cache preset not found: {preset}")

        return presets["presets"][preset]

    async def _add_invalidation_rule(self, rule: CacheInvalidationRule) -> None:
        """Add cache invalidation rule."""
        import sqlite3

        with sqlite3.connect(self.cache_stats_path) as conn:
            conn.execute("""
                INSERT INTO cache_rules (name, trigger, cache_types, conditions, action)
                VALUES (?, ?, ?, ?, ?)
            """, (
                rule.name,
                rule.trigger,
                json.dumps([ct.value for ct in rule.cache_types]),
                json.dumps(rule.conditions),
                rule.action
            ))

    async def _apply_cache_optimizations(self) -> None:
        """Apply cache optimizations to WordPress."""
        try:
            # Enable object cache
            cmd = f"cd {self.project_dir} && ddev wp config set WP_CACHE true --raw"
            run_shell(cmd, dry_run=False)

            # Add cache constants to wp-config.php
            await self._add_cache_constants()

            # Install recommended cache plugin if none exists
            plugins = await self._check_cache_plugins()
            if not any(plugins.values()):
                await self._install_cache_plugin()

        except Exception as e:
            logger.error(f"Failed to apply cache optimizations: {e}")

    async def _add_cache_constants(self) -> None:
        """Add cache constants to wp-config.php."""
        try:
            wp_config_path = self.project_dir / "web" / "wp-config.php"
            if not wp_config_path.exists():
                return

            # Read current wp-config.php
            with open(wp_config_path, 'r') as f:
                content = f.read()

            # Add cache constants if not present
            cache_constants = """
// Enable WordPress Object Cache
define('WP_CACHE', true);

// Cache settings
define('WP_CACHE_PAGE_TIMEOUT', 3600);
define('WP_CACHE_OBJECT_TIMEOUT', 300);
"""

            if 'define(\'WP_CACHE\'' not in content:
                with open(wp_config_path, 'a') as f:
                    f.write(cache_constants)

        except Exception as e:
            logger.error(f"Failed to add cache constants: {e}")

    async def _install_cache_plugin(self) -> None:
        """Install recommended cache plugin."""
        try:
            # Install WP Super Cache as default
            cmd = f"cd {self.project_dir} && ddev wp plugin install wp-super-cache --activate"
            run_shell(cmd, dry_run=False)

        except Exception as e:
            logger.error(f"Failed to install cache plugin: {e}")

    def _generate_post_optimization_recommendations(self) -> List[str]:
        """Generate post-optimization recommendations."""
        recommendations = [
            "Monitor cache hit rates regularly",
            "Test cache invalidation after content changes",
            "Configure CDN to work with WordPress caching",
            "Set up cache warming for critical pages",
            "Implement database query caching",
            "Use Redis or Memcached for object caching if available",
            "Configure browser caching headers",
            "Optimize cache TTL based on content update frequency"
        ]

        return recommendations

    async def _save_cache_config(self) -> None:
        """Save cache configuration to file."""
        config_data = {}
        for cache_type, config in self.cache_configs.items():
            config_data[cache_type.value] = {
                'strategy': config.strategy.value,
                'enabled': config.enabled,
                'ttl': config.ttl,
                'max_size': config.max_size,
                'compression': config.compression,
                'invalidation_rules': config.invalidation_rules,
                'custom_settings': config.custom_settings
            }

        with open(self.cache_config_path, 'w') as f:
            json.dump(config_data, f, indent=2)

    async def warm_cache(self, urls: Optional[List[str]] = None) -> int:
        """Warm cache for specified URLs."""
        if not urls:
            # Get common URLs to warm
            urls = await self._get_cache_warm_urls()

        warmed_count = 0

        for url in urls:
            try:
                # Make HTTP request to warm cache
                cmd = f"curl -s -o /dev/null '{url}'"
                run_shell(cmd, dry_run=False)
                warmed_count += 1
                logger.info(f"Warmed cache for: {url}")

            except Exception as e:
                logger.warning(f"Failed to warm cache for {url}: {e}")

        return warmed_count

    async def _get_cache_warm_urls(self) -> List[str]:
        """Get URLs to warm cache for."""
        urls = []

        try:
            # Get site URL
            cmd = f"cd {self.project_dir} && ddev wp option get siteurl"
            result = run_shell(cmd, dry_run=False)
            if result:
                site_url = result.strip()
                urls.append(site_url)

                # Add common pages
                common_paths = ['/about', '/contact', '/blog', '/products', '/services']
                for path in common_paths:
                    urls.append(f"{site_url}{path}")

        except Exception as e:
            logger.error(f"Failed to get cache warm URLs: {e}")

        return urls

    async def clear_cache(self, cache_types: Optional[List[CacheType]] = None, pattern: Optional[str] = None) -> bool:
        """Clear specified cache types."""
        try:
            if not cache_types:
                cache_types = list(self.cache_configs.keys())

            cleared = False

            for cache_type in cache_types:
                if cache_type == CacheType.PAGE:
                    # Clear page cache
                    cmd = f"cd {self.project_dir} && ddev wp cache flush"
                    run_shell(cmd, dry_run=False)
                    cleared = True

                elif cache_type == CacheType.OBJECT:
                    # Clear object cache
                    cmd = f"cd {self.project_dir} && ddev wp cache flush --type=object"
                    run_shell(cmd, dry_run=False)
                    cleared = True

                elif cache_type == CacheType.OPcode:
                    # Clear OPcache
                    cmd = f"cd {self.project_dir} && ddev exec 'php -r \"opcache_reset();\"'"
                    run_shell(cmd, dry_run=False)
                    cleared = True

            return cleared

        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")
            return False

    async def get_cache_health(self) -> Dict[str, Any]:
        """Get cache health status."""
        try:
            analysis = await self.analyze_cache_performance()

            health_score = 100
            issues = []
            warnings = []

            # Check cache hit rates
            for cache_type, stats in analysis.get('cache_stats', {}).items():
                hit_rate = stats.get('hit_rate', 0)
                if hit_rate < 30:
                    health_score -= 20
                    issues.append(f"Very low hit rate for {cache_type}: {hit_rate:.1f}%")
                elif hit_rate < 60:
                    health_score -= 10
                    warnings.append(f"Low hit rate for {cache_type}: {hit_rate:.1f}%")

            # Check cache configurations
            cache_configs = analysis.get('cache_configs', {})
            disabled_caches = [ct for ct, cfg in cache_configs.items() if not cfg.get('enabled')]
            if disabled_caches:
                health_score -= len(disabled_caches) * 5
                warnings.append(f"Disabled caches: {', '.join(disabled_caches)}")

            # Check server cache
            server_cache = analysis.get('server_cache', {})
            if not server_cache.get('php_opcache'):
                health_score -= 15
                issues.append("PHP OPcache not enabled")

            return {
                'health_score': max(0, health_score),
                'status': 'healthy' if health_score >= 80 else 'warning' if health_score >= 60 else 'critical',
                'issues': issues,
                'warnings': warnings,
                'recommendations': analysis.get('recommendations', [])
            }

        except Exception as e:
            logger.error(f"Failed to get cache health: {e}")
            return {
                'health_score': 0,
                'status': 'error',
                'issues': [f"Failed to analyze cache health: {str(e)}"],
                'warnings': [],
                'recommendations': []
            }