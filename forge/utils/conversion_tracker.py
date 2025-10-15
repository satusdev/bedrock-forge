"""
Conversion Tracking Utility

Handles conversion event tracking, funnel analysis, attribution modeling,
and ROI calculation for comprehensive conversion analytics.
"""

import asyncio
import json
import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import asdict
import statistics
from collections import defaultdict, Counter

from ..models.analytics import (
    ConversionEvent, ConversionFunnel, ConversionType,
    TrafficSource, KPITracker
)
from ..constants import *

logger = logging.getLogger(__name__)


class ConversionTracker:
    """Conversion tracking and analytics system"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.conversions_db = self.project_path / ".forge" / "conversions.db"
        self.config_path = self.project_path / ".forge" / "conversions_config.json"

        # Initialize database
        self._init_conversions_database()

        # Load configuration
        self.config = self._load_config()

        logger.info(f"Conversion tracker initialized for {project_path}")

    def _init_conversions_database(self):
        """Initialize conversions database"""
        self.conversions_db.parent.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(self.conversions_db)
        cursor = conn.cursor()

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
                custom_data TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Conversion goals table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversion_goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                goal_name TEXT UNIQUE,
                goal_type TEXT,
                goal_value REAL,
                description TEXT,
                active INTEGER DEFAULT 1,
                conditions TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Conversion funnels table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversion_funnels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                funnel_name TEXT UNIQUE,
                funnel_type TEXT,
                steps TEXT,
                total_entries INTEGER,
                total_exits INTEGER,
                total_conversions INTEGER,
                conversion_rate REAL,
                total_value REAL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Attribution data table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attribution_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversion_id TEXT,
                touchpoint TEXT,
                timestamp TEXT,
                channel TEXT,
                campaign TEXT,
                source TEXT,
                medium TEXT,
                content TEXT,
                position INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ROI metrics table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS roi_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                channel TEXT,
                campaign TEXT,
                spend REAL,
        revenue REAL,
                conversions INTEGER,
                roi REAL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversions_timestamp ON conversion_events(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversions_session ON conversion_events(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversions_user ON conversion_events(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversions_type ON conversion_events(conversion_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_funnel_name ON conversion_funnels(funnel_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_attribution_conversion ON attribution_data(conversion_id)")

        conn.commit()
        conn.close()

    def _load_config(self) -> Dict[str, Any]:
        """Load conversion tracking configuration"""
        config = {
            'enabled': True,
            'auto_track': True,
            'attribution_model': 'last_click',  # first_click, last_click, linear, time_decay
            'conversion_currency': 'USD',
            'goals': [],
            'funnels': [],
            'tracking_events': {
                'page_view': True,
                'form_submission': True,
                'button_click': True,
                'download': True,
                'purchase': True,
                'add_to_cart': True,
                'newsletter_signup': True,
                'contact_form': True
            }
        }

        # Load from file if exists
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    user_config = json.load(f)
                    config.update(user_config)
            except Exception as e:
                logger.warning(f"Failed to load conversion config: {e}")

        return config

    def save_config(self):
        """Save conversion tracking configuration"""
        try:
            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=2)
            logger.info("Conversion configuration saved")
        except Exception as e:
            logger.error(f"Failed to save conversion config: {e}")

    async def track_conversion(self, conversion_data: Dict[str, Any]) -> bool:
        """Track a conversion event"""
        try:
            # Generate unique event ID
            event_id = f"conv_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{hash(str(conversion_data)) % 10000:04d}"

            # Create conversion event
            conversion = ConversionEvent(
                event_id=event_id,
                session_id=conversion_data.get('session_id'),
                user_id=conversion_data.get('user_id'),
                timestamp=datetime.fromisoformat(conversion_data.get('timestamp', datetime.now().isoformat())),
                conversion_type=ConversionType(conversion_data.get('conversion_type', 'custom')),
                value=conversion_data.get('value', 0.0),
                currency=conversion_data.get('currency', self.config['conversion_currency']),
                page_url=conversion_data.get('page_url')
            )

            # Set attribution data
            conversion.traffic_source = TrafficSource(conversion_data.get('traffic_source')) if conversion_data.get('traffic_source') else None
            conversion.campaign = conversion_data.get('campaign')
            conversion.medium = conversion_data.get('medium')
            conversion.content = conversion_data.get('content')

            # Set product data if available
            conversion.product_id = conversion_data.get('product_id')
            conversion.product_name = conversion_data.get('product_name')
            conversion.quantity = conversion_data.get('quantity', 1)
            conversion.category = conversion_data.get('category')

            # Save to database
            conn = sqlite3.connect(self.conversions_db)
            cursor = conn.cursor()

            cursor.execute("""
                INSERT OR REPLACE INTO conversion_events (
                    event_id, session_id, user_id, timestamp, conversion_type,
                    value, currency, page_url, traffic_source, campaign,
                    medium, content, product_id, product_name, quantity, category, custom_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                conversion.category,
                json.dumps({k: v for k, v in conversion_data.items() if k not in [
                    'session_id', 'user_id', 'timestamp', 'conversion_type', 'value',
                    'currency', 'page_url', 'traffic_source', 'campaign', 'medium',
                    'content', 'product_id', 'product_name', 'quantity', 'category'
                ]})
            ))

            conn.commit()
            conn.close()

            # Track attribution data
            await self._track_attribution(conversion, conversion_data)

            logger.info(f"Conversion tracked: {conversion.conversion_type.value} - {conversion.value}")
            return True

        except Exception as e:
            logger.error(f"Failed to track conversion: {e}")
            return False

    async def _track_attribution(self, conversion: ConversionEvent, conversion_data: Dict[str, Any]):
        """Track attribution data for conversion"""
        try:
            conn = sqlite3.connect(self.conversions_db)
            cursor = conn.cursor()

            # Create attribution record
            cursor.execute("""
                INSERT INTO attribution_data (
                    conversion_id, touchpoint, timestamp, channel, campaign,
                    source, medium, content, position
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                conversion.event_id,
                conversion.conversion_type.value,
                conversion.timestamp.isoformat(),
                conversion.traffic_source.value if conversion.traffic_source else None,
                conversion.campaign,
                conversion.traffic_source.value if conversion.traffic_source else None,
                conversion.medium,
                conversion.content,
                1  # Last touch position for last-click attribution
            ))

            conn.commit()
            conn.close()

        except Exception as e:
            logger.error(f"Failed to track attribution: {e}")

    async def create_goal(self, goal_name: str, goal_type: str, value: float = 0.0,
                         description: str = "", conditions: Dict[str, Any] = None) -> bool:
        """Create a conversion goal"""
        try:
            conn = sqlite3.connect(self.conversions_db)
            cursor = conn.cursor()

            cursor.execute("""
                INSERT OR REPLACE INTO conversion_goals (
                    goal_name, goal_type, goal_value, description, conditions
                ) VALUES (?, ?, ?, ?, ?)
            """, (
                goal_name,
                goal_type,
                value,
                description,
                json.dumps(conditions or {})
            ))

            conn.commit()
            conn.close()

            logger.info(f"Conversion goal created: {goal_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to create conversion goal: {e}")
            return False

    async def create_funnel(self, funnel_name: str, steps: List[Dict[str, Any]]) -> bool:
        """Create a conversion funnel"""
        try:
            conn = sqlite3.connect(self.conversions_db)
            cursor = conn.cursor()

            cursor.execute("""
                INSERT OR REPLACE INTO conversion_funnels (
                    funnel_name, funnel_type, steps
                ) VALUES (?, ?, ?)
            """, (
                funnel_name,
                "custom",
                json.dumps(steps)
            ))

            conn.commit()
            conn.close()

            logger.info(f"Conversion funnel created: {funnel_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to create conversion funnel: {e}")
            return False

    async def get_conversions(self, start_date: datetime, end_date: datetime,
                            conversion_type: Optional[str] = None) -> List[ConversionEvent]:
        """Get conversion events from database"""
        try:
            conn = sqlite3.connect(self.conversions_db)
            cursor = conn.cursor()

            query = """
                SELECT * FROM conversion_events
                WHERE timestamp >= ? AND timestamp <= ?
            """
            params = [start_date.isoformat(), end_date.isoformat()]

            if conversion_type:
                query += " AND conversion_type = ?"
                params.append(conversion_type)

            query += " ORDER BY timestamp DESC"

            cursor.execute(query, params)
            rows = cursor.fetchall()

            conversions = []
            for row in rows:
                conversion = ConversionEvent(
                    event_id=row[1],
                    session_id=row[2],
                    user_id=row[3],
                    timestamp=datetime.fromisoformat(row[4]),
                    conversion_type=ConversionType(row[5]),
                    value=row[6],
                    currency=row[7],
                    page_url=row[8],
                    traffic_source=TrafficSource(row[9]) if row[9] else None,
                    campaign=row[10],
                    medium=row[11],
                    content=row[12],
                    product_id=row[13],
                    product_name=row[14],
                    quantity=row[15],
                    category=row[16]
                )
                conversions.append(conversion)

            conn.close()
            return conversions

        except Exception as e:
            logger.error(f"Failed to get conversions: {e}")
            return []

    async def analyze_funnel(self, funnel_name: str, days: int = 30) -> Optional[ConversionFunnel]:
        """Analyze conversion funnel performance"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # Get funnel definition
            conn = sqlite3.connect(self.conversions_db)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT * FROM conversion_funnels
                WHERE funnel_name = ?
            """, (funnel_name,))

            funnel_row = cursor.fetchone()
            if not funnel_row:
                logger.warning(f"Funnel not found: {funnel_name}")
                return None

            steps = json.loads(funnel_row[3])

            # Calculate funnel performance
            funnel_data = {
                'name': funnel_name,
                'steps': [],
                'total_entries': 0,
                'total_exits': 0,
                'total_conversions': 0,
                'conversion_rate': 0.0,
                'total_value': 0.0
            }

            # Analyze each step
            previous_users = None
            for i, step in enumerate(steps):
                step_name = step['name']
                step_condition = step.get('condition', {})

                # Count users who completed this step
                step_users = await self._count_step_users(step_condition, start_date, end_date)

                if i == 0:
                    funnel_data['total_entries'] = step_users

                # Calculate dropoff from previous step
                dropoff_rate = 0.0
                if previous_users is not None and previous_users > 0:
                    dropoff_rate = ((previous_users - step_users) / previous_users) * 100

                step_data = {
                    'name': step_name,
                    'users': step_users,
                    'dropoff_rate': dropoff_rate,
                    'completion_rate': (step_users / funnel_data['total_entries']) * 100 if funnel_data['total_entries'] > 0 else 0
                }

                funnel_data['steps'].append(step_data)
                previous_users = step_users

                # Check if this is the final conversion step
                if step.get('is_conversion', False):
                    funnel_data['total_conversions'] = step_users

            # Calculate overall metrics
            if funnel_data['total_entries'] > 0:
                funnel_data['conversion_rate'] = (funnel_data['total_conversions'] / funnel_data['total_entries']) * 100

            # Calculate conversion value
            conversions = await self.get_conversions(start_date, end_date)
            funnel_data['total_value'] = sum(c.value for c in conversions if c.conversion_type.value == funnel_name)

            conn.close()

            return ConversionFunnel(
                name=funnel_data['name'],
                date=end_date,
                steps=funnel_data['steps'],
                total_entries=funnel_data['total_entries'],
                total_exits=funnel_data['total_entries'] - funnel_data['total_conversions'],
                total_conversions=funnel_data['total_conversions'],
                conversion_rate=funnel_data['conversion_rate'],
                total_value=funnel_data['total_value']
            )

        except Exception as e:
            logger.error(f"Failed to analyze funnel: {e}")
            return None

    async def _count_step_users(self, condition: Dict[str, Any], start_date: datetime, end_date: datetime) -> int:
        """Count users who completed a funnel step"""
        try:
            # This is a simplified implementation
            # In a real scenario, this would analyze user behavior data
            # based on the step conditions

            # For now, return simulated data
            if condition.get('page_url'):
                # Count users who visited a specific page
                conn = sqlite3.connect(self.project_path / ".forge" / "analytics.db")
                cursor = conn.cursor()

                cursor.execute("""
                    SELECT COUNT(DISTINCT session_id) FROM user_behavior
                    WHERE page_url = ? AND timestamp >= ? AND timestamp <= ?
                """, (condition['page_url'], start_date.isoformat(), end_date.isoformat()))

                result = cursor.fetchone()
                conn.close()

                return result[0] if result else 0

            return 100  # Placeholder

        except Exception as e:
            logger.error(f"Failed to count step users: {e}")
            return 0

    async def calculate_roi(self, days: int = 30) -> Dict[str, Any]:
        """Calculate ROI metrics for marketing channels"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # Get conversion data
            conversions = await self.get_conversions(start_date, end_date)

            # Group conversions by channel
            channel_data = defaultdict(lambda: {'conversions': 0, 'revenue': 0.0})

            for conversion in conversions:
                channel = conversion.traffic_source.value if conversion.traffic_source else 'direct'
                channel_data[channel]['conversions'] += 1
                channel_data[channel]['revenue'] += conversion.value

            # Simulate spend data (in a real implementation, this would come from ad platforms)
            simulated_spend = {
                'organic': 0,
                'paid': 1000,
                'social': 500,
                'email': 200,
                'direct': 0,
                'referral': 300
            }

            roi_data = {}
            total_revenue = 0
            total_spend = 0

            for channel, metrics in channel_data.items():
                spend = simulated_spend.get(channel, 0)
                revenue = metrics['revenue']
                conversions = metrics['conversions']

                roi = ((revenue - spend) / spend * 100) if spend > 0 else 0
                cpa = spend / conversions if conversions > 0 else 0

                roi_data[channel] = {
                    'conversions': conversions,
                    'revenue': revenue,
                    'spend': spend,
                    'roi': roi,
                    'cpa': cpa,
                    'roas': revenue / spend if spend > 0 else 0  # Return on ad spend
                }

                total_revenue += revenue
                total_spend += spend

            # Calculate overall ROI
            overall_roi = ((total_revenue - total_spend) / total_spend * 100) if total_spend > 0 else 0

            return {
                'channel_data': roi_data,
                'overall_metrics': {
                    'total_conversions': sum(m['conversions'] for m in roi_data.values()),
                    'total_revenue': total_revenue,
                    'total_spend': total_spend,
                    'overall_roi': overall_roi,
                    'overall_roas': total_revenue / total_spend if total_spend > 0 else 0
                },
                'period': f"Last {days} days"
            }

        except Exception as e:
            logger.error(f"Failed to calculate ROI: {e}")
            return {"error": str(e)}

    async def get_conversion_trends(self, days: int = 30) -> Dict[str, Any]:
        """Analyze conversion trends over time"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # Get conversion data grouped by day
            conn = sqlite3.connect(self.conversions_db)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT DATE(timestamp) as date, COUNT(*) as conversions, SUM(value) as revenue
                FROM conversion_events
                WHERE timestamp >= ? AND timestamp <= ?
                GROUP BY DATE(timestamp)
                ORDER BY date ASC
            """, (start_date.isoformat(), end_date.isoformat()))

            rows = cursor.fetchall()
            conn.close()

            if not rows:
                return {"error": "No conversion data available"}

            # Process trend data
            trend_data = []
            total_conversions = 0
            total_revenue = 0.0

            for row in rows:
                date, conversions, revenue = row
                total_conversions += conversions
                total_revenue += revenue

                trend_data.append({
                    'date': date,
                    'conversions': conversions,
                    'revenue': revenue,
                    'avg_conversion_value': revenue / conversions if conversions > 0 else 0
                })

            # Calculate trends
            if len(trend_data) >= 2:
                first_half = trend_data[:len(trend_data)//2]
                second_half = trend_data[len(trend_data)//2:]

                first_conversions = sum(d['conversions'] for d in first_half)
                second_conversions = sum(d['conversions'] for d in second_half)

                conversion_trend = ((second_conversions - first_conversions) / first_conversions * 100) if first_conversions > 0 else 0

                first_revenue = sum(d['revenue'] for d in first_half)
                second_revenue = sum(d['revenue'] for d in second_half)

                revenue_trend = ((second_revenue - first_revenue) / first_revenue * 100) if first_revenue > 0 else 0
            else:
                conversion_trend = 0
                revenue_trend = 0

            return {
                'trend_data': trend_data,
                'summary': {
                    'total_conversions': total_conversions,
                    'total_revenue': total_revenue,
                    'avg_conversion_value': total_revenue / total_conversions if total_conversions > 0 else 0,
                    'conversion_trend': conversion_trend,
                    'revenue_trend': revenue_trend,
                    'period': f"Last {days} days"
                }
            }

        except Exception as e:
            logger.error(f"Failed to get conversion trends: {e}")
            return {"error": str(e)}