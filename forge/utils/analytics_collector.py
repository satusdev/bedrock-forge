"""
Analytics Data Collector

Handles data collection from various analytics sources including
Google Analytics 4, WordPress stats, and custom tracking.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import asdict
import sqlite3
import aiohttp
import hashlib

from ..models.analytics import (
    TrafficMetrics, ContentMetrics, UserBehavior, UserJourney,
    TrafficSource, DeviceType, ConversionEvent, ConversionType
)
from ..constants import *

logger = logging.getLogger(__name__)


class GoogleAnalyticsCollector:
    """Google Analytics 4 data collector"""

    def __init__(self, property_id: str, credentials_path: str):
        self.property_id = property_id
        self.credentials_path = credentials_path
        self.base_url = "https://analyticsdata.googleapis.com/v1beta"
        self.access_token = None

    async def authenticate(self) -> bool:
        """Authenticate with Google Analytics API"""
        try:
            # In a real implementation, this would use OAuth2 or service account
            # For now, we'll simulate authentication
            logger.info("Authenticating with Google Analytics 4 API")
            return True
        except Exception as e:
            logger.error(f"GA4 authentication failed: {e}")
            return False

    async def get_traffic_data(self, start_date: datetime, end_date: datetime) -> Optional[Dict[str, Any]]:
        """Get traffic data from GA4"""
        try:
            # Build request body for GA4 Data API
            request_body = {
                "dateRanges": [{
                    "startDate": start_date.strftime("%Y-%m-%d"),
                    "endDate": end_date.strftime("%Y-%m-%d")
                }],
                "dimensions": [
                    {"name": "date"},
                    {"name": "sessionSource"},
                    {"name": "deviceCategory"},
                    {"name": "country"}
                ],
                "metrics": [
                    {"name": "sessions"},
                    {"name": "users"},
                    {"name": "pageviews"},
                    {"name": "bounceRate"},
                    {"name": "averageSessionDuration"},
                    {"name": "newUsers"}
                ]
            }

            # In a real implementation, this would make an actual API call
            # For now, we'll return simulated data
            return await self._simulate_traffic_data(start_date, end_date)

        except Exception as e:
            logger.error(f"Failed to fetch GA4 traffic data: {e}")
            return None

    async def _simulate_traffic_data(self, start_date: datetime, end_date: datetime) -> Dict[str, Any]:
        """Simulate GA4 traffic data for development"""
        days = (end_date - start_date).days + 1
        data = []

        for i in range(days):
            current_date = start_date + timedelta(days=i)

            # Simulate daily traffic with some variation
            base_sessions = 1000
            variation = int(base_sessions * 0.3)  # 30% variation
            sessions = base_sessions + (hash(current_date.strftime("%Y-%m-%d")) % variation - variation // 2)

            data.append({
                "date": current_date.strftime("%Y-%m-%d"),
                "sessions": max(100, sessions),
                "users": int(sessions * 0.7),
                "pageviews": int(sessions * 2.5),
                "bounceRate": round(0.4 + (hash(str(i)) % 20) / 100, 2),
                "averageSessionDuration": round(120 + (hash(str(i)) % 180), 2),
                "newUsers": int(sessions * 0.3)
            })

        return {"rows": data}


class WordPressStatsCollector:
    """WordPress.com Stats collector"""

    def __init__(self, site_url: str, api_key: str):
        self.site_url = site_url
        self.api_key = api_key
        self.base_url = f"https://stats.wordpress.com"

    async def get_stats(self, start_date: datetime, end_date: datetime) -> Optional[Dict[str, Any]]:
        """Get WordPress stats"""
        try:
            # Build WordPress Stats API URL
            params = {
                "api_key": self.api_key,
                "blog_uri": self.site_url,
                "date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
                "table": "views",
                "format": "json"
            }

            # In a real implementation, this would make an actual API call
            # For now, we'll return simulated data
            return await self._simulate_wordpress_stats(start_date, end_date)

        except Exception as e:
            logger.error(f"Failed to fetch WordPress stats: {e}")
            return None

    async def _simulate_wordpress_stats(self, start_date: datetime, end_date: datetime) -> Dict[str, Any]:
        """Simulate WordPress stats for development"""
        days = (end_date - start_date).days + 1
        daily_views = []

        for i in range(days):
            current_date = start_date + timedelta(days=i)

            # Simulate daily views with variation
            base_views = 800
            variation = int(base_views * 0.25)
            views = base_views + (hash(current_date.strftime("%Y-%m-%d")) % variation - variation // 2)

            daily_views.append({
                "date": current_date.strftime("%Y-%m-%d"),
                "views": max(50, views),
                "visitors": int(views * 0.6)
            })

        return {"daily": daily_views}


class CustomEventTracker:
    """Custom event tracking implementation"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.events_db = self.project_path / ".forge" / "events.db"
        self._init_events_database()

    def _init_events_database(self):
        """Initialize events database"""
        self.events_db.parent.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(self.events_db)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS custom_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT UNIQUE,
                session_id TEXT,
                user_id TEXT,
                event_type TEXT,
                event_category TEXT,
                event_action TEXT,
                event_label TEXT,
                event_value REAL,
                page_url TEXT,
                timestamp TEXT,
                user_agent TEXT,
                ip_address TEXT,
                custom_data TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS page_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                page_url TEXT,
                referrer TEXT,
                title TEXT,
                timestamp TEXT,
                time_on_page REAL,
                scroll_depth REAL,
                device_type TEXT,
                browser TEXT,
                os TEXT
            )
        """)

        conn.commit()
        conn.close()

    async def track_event(self, event_data: Dict[str, Any]) -> bool:
        """Track a custom event"""
        try:
            conn = sqlite3.connect(self.events_db)
            cursor = conn.cursor()

            cursor.execute("""
                INSERT OR REPLACE INTO custom_events (
                    event_id, session_id, user_id, event_type, event_category,
                    event_action, event_label, event_value, page_url, timestamp,
                    user_agent, ip_address, custom_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event_data.get('event_id'),
                event_data.get('session_id'),
                event_data.get('user_id'),
                event_data.get('event_type'),
                event_data.get('event_category'),
                event_data.get('event_action'),
                event_data.get('event_label'),
                event_data.get('event_value', 0.0),
                event_data.get('page_url'),
                event_data.get('timestamp', datetime.now().isoformat()),
                event_data.get('user_agent'),
                event_data.get('ip_address'),
                json.dumps(event_data.get('custom_data', {}))
            ))

            conn.commit()
            conn.close()
            return True

        except Exception as e:
            logger.error(f"Failed to track custom event: {e}")
            return False

    async def track_page_view(self, page_data: Dict[str, Any]) -> bool:
        """Track a page view"""
        try:
            conn = sqlite3.connect(self.events_db)
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO page_views (
                    session_id, page_url, referrer, title, timestamp,
                    time_on_page, scroll_depth, device_type, browser, os
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                page_data.get('session_id'),
                page_data.get('page_url'),
                page_data.get('referrer'),
                page_data.get('title'),
                page_data.get('timestamp', datetime.now().isoformat()),
                page_data.get('time_on_page', 0.0),
                page_data.get('scroll_depth', 0.0),
                page_data.get('device_type'),
                page_data.get('browser'),
                page_data.get('os')
            ))

            conn.commit()
            conn.close()
            return True

        except Exception as e:
            logger.error(f"Failed to track page view: {e}")
            return False

    async def get_events(self, start_date: datetime, end_date: datetime,
                        event_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get events from database"""
        try:
            conn = sqlite3.connect(self.events_db)
            cursor = conn.cursor()

            query = """
                SELECT * FROM custom_events
                WHERE timestamp >= ? AND timestamp <= ?
            """
            params = [start_date.isoformat(), end_date.isoformat()]

            if event_type:
                query += " AND event_type = ?"
                params.append(event_type)

            query += " ORDER BY timestamp DESC"

            cursor.execute(query, params)
            rows = cursor.fetchall()

            events = []
            for row in rows:
                event = {
                    'id': row[0],
                    'event_id': row[1],
                    'session_id': row[2],
                    'user_id': row[3],
                    'event_type': row[4],
                    'event_category': row[5],
                    'event_action': row[6],
                    'event_label': row[7],
                    'event_value': row[8],
                    'page_url': row[9],
                    'timestamp': row[10],
                    'user_agent': row[11],
                    'ip_address': row[12],
                    'custom_data': json.loads(row[13]) if row[13] else {}
                }
                events.append(event)

            conn.close()
            return events

        except Exception as e:
            logger.error(f"Failed to get events: {e}")
            return []


class AnalyticsCollector:
    """Main analytics data collector that coordinates all data sources"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.analytics_db = self.project_path / ".forge" / "analytics.db"
        self.config_path = self.project_path / ".forge" / "analytics_config.json"

        # Initialize database
        self._init_database()

        # Load configuration
        self.config = self._load_config()

        # Initialize collectors
        self.ga_collector = None
        self.wp_collector = None
        self.custom_tracker = CustomEventTracker(project_path)

        # Initialize collectors based on configuration
        self._initialize_collectors()

        logger.info(f"Analytics collector initialized for {project_path}")

    def _init_database(self):
        """Initialize analytics database"""
        self.analytics_db.parent.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(self.analytics_db)
        cursor = conn.cursor()

        # Traffic metrics table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS traffic_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                sessions INTEGER,
                users INTEGER,
                page_views INTEGER,
                bounce_rate REAL,
                avg_session_duration REAL,
                new_users INTEGER,
                returning_users INTEGER,
                traffic_sources TEXT,
                devices TEXT,
                countries TEXT,
                cities TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Content metrics table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS content_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT UNIQUE,
                title TEXT,
                date TEXT,
                page_views INTEGER,
                unique_page_views INTEGER,
                avg_time_on_page REAL,
                entrances INTEGER,
                bounce_rate REAL,
                exit_rate REAL,
                conversions INTEGER,
                organic_traffic INTEGER,
                keyword_rankings TEXT,
                backlinks INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # User behavior table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_behavior (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                user_id TEXT,
                timestamp TEXT,
                page_url TEXT,
                referrer TEXT,
                user_agent TEXT,
                ip_address TEXT,
                device_type TEXT,
                browser TEXT,
                os TEXT,
                country TEXT,
                city TEXT,
                time_on_page REAL,
                scroll_depth REAL,
                clicks INTEGER,
                form_interactions INTEGER,
                entry_page BOOLEAN,
                exit_page BOOLEAN,
                conversion_events TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # User journeys table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_journeys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                sessions TEXT,
                first_touch TEXT,
                last_touch TEXT,
                total_sessions INTEGER,
                total_page_views INTEGER,
                total_time_on_site REAL,
                conversions TEXT,
                conversion_value REAL,
                entry_pages TEXT,
                exit_pages TEXT,
                key_pages TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Conversion events table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversion_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT UNIQUE,
                session_id TEXT,
                user_id TEXT,
                timestamp TEXT,
                conversion_type TEXT,
                value REAL,
                currency TEXT,
                page_url TEXT,
                traffic_source TEXT,
                campaign TEXT,
                medium TEXT,
                content TEXT,
                product_id TEXT,
                product_name TEXT,
                quantity INTEGER,
                category TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_traffic_date ON traffic_metrics(date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_content_url ON content_metrics(url)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_behavior_session ON user_behavior(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_behavior_user ON user_behavior(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_journey_user ON user_journeys(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversions_session ON conversion_events(session_id)")

        conn.commit()
        conn.close()

    def _load_config(self) -> Dict[str, Any]:
        """Load analytics configuration"""
        config = {
            'enabled': True,
            'auto_collect': True,
            'collection_interval': 3600,  # 1 hour
            'data_retention_days': 365,
            'ga4': {
                'enabled': False,
                'property_id': '',
                'credentials_path': ''
            },
            'wordpress_stats': {
                'enabled': False,
                'site_url': '',
                'api_key': ''
            },
            'custom_tracking': {
                'enabled': True,
                'track_page_views': True,
                'track_events': True,
                'track_conversions': True
            }
        }

        # Load from file if exists
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    user_config = json.load(f)
                    config.update(user_config)
            except Exception as e:
                logger.warning(f"Failed to load analytics config: {e}")

        return config

    def _initialize_collectors(self):
        """Initialize data collectors based on configuration"""
        if self.config['ga4']['enabled'] and self.config['ga4']['property_id']:
            self.ga_collector = GoogleAnalyticsCollector(
                self.config['ga4']['property_id'],
                self.config['ga4']['credentials_path']
            )

        if self.config['wordpress_stats']['enabled'] and self.config['wordpress_stats']['site_url']:
            self.wp_collector = WordPressStatsCollector(
                self.config['wordpress_stats']['site_url'],
                self.config['wordpress_stats']['api_key']
            )

    def save_config(self):
        """Save analytics configuration"""
        try:
            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=2)
            logger.info("Analytics configuration saved")
        except Exception as e:
            logger.error(f"Failed to save analytics config: {e}")

    async def collect_all_data(self, start_date: datetime, end_date: datetime) -> Dict[str, Any]:
        """Collect data from all enabled sources"""
        results = {
            'traffic': None,
            'content': None,
            'events': None,
            'conversions': None
        }

        # Collect GA4 data
        if self.ga_collector:
            try:
                await self.ga_collector.authenticate()
                ga_data = await self.ga_collector.get_traffic_data(start_date, end_date)
                if ga_data:
                    results['traffic'] = await self._process_traffic_data(ga_data)
                    logger.info("GA4 traffic data collected successfully")
            except Exception as e:
                logger.error(f"Failed to collect GA4 data: {e}")

        # Collect WordPress stats
        if self.wp_collector:
            try:
                wp_data = await self.wp_collector.get_stats(start_date, end_date)
                if wp_data:
                    # Merge with existing traffic data
                    results['traffic'] = await self._merge_traffic_data(
                        results['traffic'], wp_data
                    )
                    logger.info("WordPress stats collected successfully")
            except Exception as e:
                logger.error(f"Failed to collect WordPress stats: {e}")

        # Collect custom events
        if self.config['custom_tracking']['enabled']:
            try:
                custom_events = await self.custom_tracker.get_events(start_date, end_date)
                results['events'] = custom_events
                logger.info(f"Collected {len(custom_events)} custom events")
            except Exception as e:
                logger.error(f"Failed to collect custom events: {e}")

        # Save to database
        await self._save_collected_data(results)

        return results

    async def _process_traffic_data(self, ga_data: Dict[str, Any]) -> List[TrafficMetrics]:
        """Process raw GA4 traffic data into TrafficMetrics objects"""
        metrics = []

        if not ga_data.get('rows'):
            return metrics

        for row in ga_data['rows']:
            try:
                date_str = row['date']
                date = datetime.strptime(date_str, "%Y-%m-%d")

                metric = TrafficMetrics(
                    date=date,
                    sessions=row.get('sessions', 0),
                    users=row.get('users', 0),
                    page_views=row.get('pageviews', 0),
                    bounce_rate=row.get('bounceRate', 0.0),
                    avg_session_duration=row.get('averageSessionDuration', 0.0),
                    new_users=row.get('newUsers', 0),
                    returning_users=row.get('users', 0) - row.get('newUsers', 0)
                )

                metrics.append(metric)

            except Exception as e:
                logger.warning(f"Failed to process traffic data row: {e}")

        return metrics

    async def _merge_traffic_data(self, primary_data: Optional[List[TrafficMetrics]],
                                 secondary_data: Dict[str, Any]) -> List[TrafficMetrics]:
        """Merge traffic data from multiple sources"""
        if not primary_data:
            # Create traffic metrics from secondary data
            metrics = []
            for row in secondary_data.get('daily', []):
                date = datetime.strptime(row['date'], "%Y-%m-%d")
                metric = TrafficMetrics(
                    date=date,
                    sessions=row.get('visitors', 0),
                    users=row.get('visitors', 0),
                    page_views=row.get('views', 0)
                )
                metrics.append(metric)
            return metrics

        # Merge data (simplified - would need more sophisticated merging in production)
        return primary_data

    async def _save_collected_data(self, results: Dict[str, Any]):
        """Save collected data to database"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            # Save traffic metrics
            if results['traffic']:
                for metric in results['traffic']:
                    cursor.execute("""
                        INSERT OR REPLACE INTO traffic_metrics (
                            date, sessions, users, page_views, bounce_rate,
                            avg_session_duration, new_users, returning_users,
                            traffic_sources, devices, countries, cities
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        metric.date.isoformat(),
                        metric.sessions,
                        metric.users,
                        metric.page_views,
                        metric.bounce_rate,
                        metric.avg_session_duration,
                        metric.new_users,
                        metric.returning_users,
                        json.dumps({k.value: v for k, v in metric.traffic_sources.items()}),
                        json.dumps({k.value: v for k, v in metric.devices.items()}),
                        json.dumps(metric.countries),
                        json.dumps(metric.cities)
                    ))

            conn.commit()
            conn.close()
            logger.info("Collected data saved to database")

        except Exception as e:
            logger.error(f"Failed to save collected data: {e}")

    async def get_traffic_metrics(self, start_date: datetime, end_date: datetime) -> List[TrafficMetrics]:
        """Get traffic metrics from database"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT * FROM traffic_metrics
                WHERE date >= ? AND date <= ?
                ORDER BY date DESC
            """, (start_date.isoformat(), end_date.isoformat()))

            rows = cursor.fetchall()
            metrics = []

            for row in rows:
                metric = TrafficMetrics(
                    date=datetime.fromisoformat(row[1]),
                    sessions=row[2],
                    users=row[3],
                    page_views=row[4],
                    bounce_rate=row[5],
                    avg_session_duration=row[6],
                    new_users=row[7],
                    returning_users=row[8],
                    traffic_sources={TrafficSource(k): v for k, v in json.loads(row[9]).items()} if row[9] else {},
                    devices={DeviceType(k): v for k, v in json.loads(row[10]).items()} if row[10] else {},
                    countries=json.loads(row[11]) if row[11] else {},
                    cities=json.loads(row[12]) if row[12] else {}
                )
                metrics.append(metric)

            conn.close()
            return metrics

        except Exception as e:
            logger.error(f"Failed to get traffic metrics: {e}")
            return []

    async def track_conversion(self, conversion_data: Dict[str, Any]) -> bool:
        """Track a conversion event"""
        try:
            # Generate unique event ID
            event_id = hashlib.md5(
                f"{conversion_data.get('session_id')}{conversion_data.get('timestamp', datetime.now().isoformat())}".encode()
            ).hexdigest()

            # Create conversion event
            conversion = ConversionEvent(
                event_id=event_id,
                session_id=conversion_data.get('session_id'),
                user_id=conversion_data.get('user_id'),
                timestamp=datetime.fromisoformat(conversion_data.get('timestamp', datetime.now().isoformat())),
                conversion_type=ConversionType(conversion_data.get('conversion_type', 'custom')),
                value=conversion_data.get('value', 0.0),
                currency=conversion_data.get('currency', 'USD'),
                page_url=conversion_data.get('page_url')
            )

            # Save to database
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            cursor.execute("""
                INSERT OR REPLACE INTO conversion_events (
                    event_id, session_id, user_id, timestamp, conversion_type,
                    value, currency, page_url, traffic_source, campaign,
                    medium, content, product_id, product_name, quantity, category
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                conversion.event_id,
                conversion.session_id,
                conversion.user_id,
                conversion.timestamp.isoformat(),
                conversion.conversion_type.value,
                conversion.value,
                conversion.currency,
                conversion.page_url,
                conversion.traffic_source.value if conversion.traffic_source else None,
                conversion.campaign,
                conversion.medium,
                conversion.content,
                conversion.product_id,
                conversion.product_name,
                conversion.quantity,
                conversion.category
            ))

            conn.commit()
            conn.close()

            logger.info(f"Conversion tracked: {conversion.conversion_type.value} - {conversion.value}")
            return True

        except Exception as e:
            logger.error(f"Failed to track conversion: {e}")
            return False

    async def cleanup_old_data(self):
        """Clean up old analytics data"""
        try:
            cutoff_date = (datetime.now() - timedelta(days=self.config['data_retention_days'])).isoformat()

            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            # Clean up old traffic metrics
            cursor.execute("DELETE FROM traffic_metrics WHERE date < ?", (cutoff_date,))
            traffic_deleted = cursor.rowcount

            # Clean up old user behavior
            cursor.execute("DELETE FROM user_behavior WHERE timestamp < ?", (cutoff_date,))
            behavior_deleted = cursor.rowcount

            # Clean up old conversion events
            cursor.execute("DELETE FROM conversion_events WHERE timestamp < ?", (cutoff_date,))
            conversions_deleted = cursor.rowcount

            conn.commit()
            conn.close()

            logger.info(f"Cleaned up old data: {traffic_deleted} traffic metrics, {behavior_deleted} behaviors, {conversions_deleted} conversions")

        except Exception as e:
            logger.error(f"Failed to cleanup old data: {e}")