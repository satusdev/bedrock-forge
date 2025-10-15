"""
User Behavior Analytics

Handles user journey mapping, session analysis, engagement tracking,
and user segmentation for comprehensive behavior analytics.
"""

import asyncio
import json
import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Set
from dataclasses import asdict
import statistics
from collections import defaultdict, Counter

from ..models.analytics import (
    UserBehavior, UserJourney, TrafficSource, DeviceType,
    UserEngagementLevel, ConversionEvent, ConversionType
)
from ..constants import *

logger = logging.getLogger(__name__)


class SessionAnalyzer:
    """Session-based behavior analysis"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.analytics_db = self.project_path / ".forge" / "analytics.db"

    async def analyze_sessions(self, days: int = 30) -> Dict[str, Any]:
        """Analyze user sessions and behavior patterns"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # Get session data
            sessions = await self._get_session_data(start_date, end_date)

            if not sessions:
                return {"error": "No session data available"}

            # Perform analysis
            analysis = {
                "session_overview": self._calculate_session_overview(sessions),
                "engagement_patterns": self._analyze_engagement_patterns(sessions),
                "device_behavior": self._analyze_device_behavior(sessions),
                "journey_flows": self._analyze_journey_flows(sessions),
                "behavior_insights": self._generate_behavior_insights(sessions)
            }

            return analysis

        except Exception as e:
            logger.error(f"Session analysis failed: {e}")
            return {"error": str(e)}

    async def _get_session_data(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """Get session behavior data from database"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT * FROM user_behavior
                WHERE timestamp >= ? AND timestamp <= ?
                ORDER BY session_id, timestamp ASC
            """, (start_date.isoformat(), end_date.isoformat()))

            rows = cursor.fetchall()
            sessions = []

            for row in rows:
                session_data = {
                    'id': row[0],
                    'session_id': row[1],
                    'user_id': row[2],
                    'timestamp': row[3],
                    'page_url': row[4],
                    'referrer': row[5],
                    'user_agent': row[6],
                    'ip_address': row[7],
                    'device_type': row[8],
                    'browser': row[9],
                    'os': row[10],
                    'country': row[11],
                    'city': row[12],
                    'time_on_page': row[13],
                    'scroll_depth': row[14],
                    'clicks': row[15],
                    'form_interactions': row[16],
                    'entry_page': bool(row[17]),
                    'exit_page': bool(row[18]),
                    'conversion_events': json.loads(row[19]) if row[19] else []
                }
                sessions.append(session_data)

            conn.close()
            return sessions

        except Exception as e:
            logger.error(f"Failed to get session data: {e}")
            return []

    def _calculate_session_overview(self, sessions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate overall session overview metrics"""
        if not sessions:
            return {}

        # Group sessions by session_id
        session_groups = defaultdict(list)
        for session in sessions:
            session_groups[session['session_id']].append(session)

        total_sessions = len(session_groups)
        total_page_views = len(sessions)
        unique_users = len(set(s['user_id'] for s in sessions if s['user_id']))

        # Calculate session metrics
        session_durations = []
        session_page_views = []
        bounce_sessions = 0
        conversion_sessions = 0

        for session_id, session_pages in session_groups.items():
            # Calculate session duration
            start_time = datetime.fromisoformat(session_pages[0]['timestamp'])
            end_time = datetime.fromisoformat(session_pages[-1]['timestamp'])
            duration = (end_time - start_time).total_seconds()
            session_durations.append(duration)

            # Calculate page views per session
            session_page_views.append(len(session_pages))

            # Check if bounce (single page view)
            if len(session_pages) == 1:
                bounce_sessions += 1

            # Check if conversion occurred
            if any(session_page['conversion_events'] for session_page in session_pages):
                conversion_sessions += 1

        return {
            "total_sessions": total_sessions,
            "unique_users": unique_users,
            "total_page_views": total_page_views,
            "avg_session_duration": statistics.mean(session_durations) if session_durations else 0,
            "avg_pages_per_session": statistics.mean(session_page_views) if session_page_views else 0,
            "bounce_rate": (bounce_sessions / total_sessions) * 100 if total_sessions > 0 else 0,
            "conversion_rate": (conversion_sessions / total_sessions) * 100 if total_sessions > 0 else 0,
            "returning_user_rate": ((unique_users - len([s for s in sessions if s['user_id'] and s['entry_page']])) / unique_users) * 100 if unique_users > 0 else 0
        }

    def _analyze_engagement_patterns(self, sessions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze user engagement patterns"""
        engagement_levels = defaultdict(int)
        time_on_page_data = []
        scroll_depth_data = []
        click_data = []
        form_interaction_data = []

        for session in sessions:
            # Classify engagement level
            engagement_level = self._classify_engagement(session)
            engagement_levels[engagement_level.value] += 1

            # Collect engagement metrics
            if session['time_on_page'] > 0:
                time_on_page_data.append(session['time_on_page'])
            if session['scroll_depth'] > 0:
                scroll_depth_data.append(session['scroll_depth'])
            if session['clicks'] > 0:
                click_data.append(session['clicks'])
            if session['form_interactions'] > 0:
                form_interaction_data.append(session['form_interactions'])

        return {
            "engagement_distribution": dict(engagement_levels),
            "avg_time_on_page": statistics.mean(time_on_page_data) if time_on_page_data else 0,
            "avg_scroll_depth": statistics.mean(scroll_depth_data) if scroll_depth_data else 0,
            "avg_clicks_per_page": statistics.mean(click_data) if click_data else 0,
            "form_interaction_rate": (len(form_interaction_data) / len(sessions)) * 100 if sessions else 0,
            "high_engagement_rate": (engagement_levels.get('high', 0) / len(sessions)) * 100 if sessions else 0
        }

    def _classify_engagement(self, session: Dict[str, Any]) -> UserEngagementLevel:
        """Classify user engagement level"""
        time_on_page = session['time_on_page']
        scroll_depth = session['scroll_depth']
        clicks = session['clicks']
        has_conversions = bool(session['conversion_events'])

        # High engagement criteria
        if (time_on_page > ENGAGEMENT_HIGH_THRESHOLD or
            scroll_depth > 0.8 or
            clicks > 5 or
            has_conversions):
            return UserEngagementLevel.HIGH

        # Medium engagement criteria
        elif (time_on_page > 60 or
              scroll_depth > 0.5 or
              clicks > 2):
            return UserEngagementLevel.MEDIUM

        # Low engagement
        else:
            return UserEngagementLevel.LOW

    def _analyze_device_behavior(self, sessions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze behavior by device type"""
        device_stats = defaultdict(lambda: {
            'sessions': 0,
            'page_views': 0,
            'avg_time_on_page': 0,
            'bounce_rate': 0,
            'conversion_rate': 0
        })

        # Group sessions by device
        device_sessions = defaultdict(list)
        for session in sessions:
            device_sessions[session['device_type']].append(session)

        # Calculate metrics for each device
        for device, device_session_list in device_sessions.items():
            total_sessions = len(set(s['session_id'] for s in device_session_list))
            total_page_views = len(device_session_list)
            time_on_pages = [s['time_on_page'] for s in device_session_list if s['time_on_page'] > 0]

            # Calculate bounce rate (sessions with single page view)
            session_page_counts = defaultdict(int)
            for s in device_session_list:
                session_page_counts[s['session_id']] += 1
            single_page_sessions = sum(1 for count in session_page_counts.values() if count == 1)
            bounce_rate = (single_page_sessions / total_sessions) * 100 if total_sessions > 0 else 0

            # Calculate conversion rate
            conversion_sessions = sum(1 for s in device_session_list if s['conversion_events'])
            unique_conversion_sessions = len(set(s['session_id'] for s in device_session_list if s['conversion_events']))
            conversion_rate = (unique_conversion_sessions / total_sessions) * 100 if total_sessions > 0 else 0

            device_stats[device] = {
                'sessions': total_sessions,
                'page_views': total_page_views,
                'avg_time_on_page': statistics.mean(time_on_pages) if time_on_pages else 0,
                'bounce_rate': bounce_rate,
                'conversion_rate': conversion_rate
            }

        return dict(device_stats)

    def _analyze_journey_flows(self, sessions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze user journey flows and paths"""
        # Group sessions to analyze flows
        session_groups = defaultdict(list)
        for session in sessions:
            session_groups[session['session_id']].append(session)

        # Analyze common paths
        path_counter = Counter()
        entry_pages = Counter()
        exit_pages = Counter()

        for session_id, session_pages in session_groups.items():
            # Create path string
            path = " -> ".join([self._extract_page_name(page['page_url']) for page in session_pages])
            path_counter[path] += 1

            # Track entry and exit pages
            if session_pages:
                entry_pages[self._extract_page_name(session_pages[0]['page_url'])] += 1
                exit_pages[self._extract_page_name(session_pages[-1]['page_url'])] += 1

        return {
            "common_paths": dict(path_counter.most_common(10)),
            "top_entry_pages": dict(entry_pages.most_common(10)),
            "top_exit_pages": dict(exit_pages.most_common(10)),
            "total_unique_paths": len(path_counter)
        }

    def _extract_page_name(self, url: str) -> str:
        """Extract clean page name from URL"""
        # Remove domain and protocol
        if '://' in url:
            url = url.split('://', 1)[1]
        url = url.split('/', 1)[-1] if '/' in url else url

        # Clean up URL
        if not url or url == '':
            return 'Home'
        if url.endswith('/'):
            url = url[:-1]

        # Return last segment or full path
        segments = url.split('/')
        return segments[-1] if segments else 'Home'

    def _generate_behavior_insights(self, sessions: List[Dict[str, Any]]) -> List[str]:
        """Generate insights from behavior analysis"""
        insights = []

        if not sessions:
            return insights

        # Session quality insights
        session_groups = defaultdict(list)
        for session in sessions:
            session_groups[session['session_id']].append(session)

        total_sessions = len(session_groups)
        single_page_sessions = sum(1 for pages in session_groups.values() if len(pages) == 1)
        bounce_rate = (single_page_sessions / total_sessions) * 100 if total_sessions > 0 else 0

        if bounce_rate > 60:
            insights.append(f"High bounce rate ({bounce_rate:.1f}%). Consider improving content relevance and page load speed.")
        elif bounce_rate < 30:
            insights.append(f"Excellent bounce rate ({bounce_rate:.1f}%). Users are highly engaged with your content.")

        # Engagement insights
        engagement_levels = [self._classify_engagement(session) for session in sessions]
        high_engagement = sum(1 for level in engagement_levels if level == UserEngagementLevel.HIGH)
        high_engagement_rate = (high_engagement / len(sessions)) * 100

        if high_engagement_rate > 40:
            insights.append(f"Strong user engagement ({high_engagement_rate:.1f}% high engagement). Content quality is excellent.")
        elif high_engagement_rate < 15:
            insights.append(f"Low engagement detected ({high_engagement_rate:.1f}% high engagement). Consider improving content quality and interactivity.")

        # Device insights
        device_sessions = defaultdict(int)
        for session in sessions:
            device_sessions[session['device_type']] += 1

        if device_sessions:
            top_device = max(device_sessions, key=device_sessions.get)
            device_percentage = (device_sessions[top_device] / len(sessions)) * 100
            insights.append(f"Primary device: {top_device} ({device_percentage:.1f}% of sessions)")

            # Mobile-specific insights
            mobile_percentage = (device_sessions.get('mobile', 0) / len(sessions)) * 100
            if mobile_percentage > 60:
                insights.append("Mobile-dominant audience. Ensure mobile-first design and fast mobile load times.")

        return insights


class UserSegmentation:
    """User segmentation and cohort analysis"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.analytics_db = self.project_path / ".forge" / "analytics.db"

    async def segment_users(self, segmentation_type: str = "behavior", days: int = 30) -> Dict[str, Any]:
        """Segment users based on various criteria"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # Get user data
            users = await self._get_user_data(start_date, end_date)

            if not users:
                return {"error": "No user data available"}

            # Perform segmentation
            if segmentation_type == "behavior":
                segments = self._segment_by_behavior(users)
            elif segmentation_type == "engagement":
                segments = self._segment_by_engagement(users)
            elif segmentation_type == "frequency":
                segments = self._segment_by_frequency(users)
            elif segmentation_type == "device":
                segments = self._segment_by_device(users)
            elif segmentation_type == "acquisition":
                segments = self._segment_by_acquisition(users)
            else:
                segments = self._segment_by_behavior(users)

            return {
                "segmentation_type": segmentation_type,
                "total_users": len(users),
                "segments": segments,
                "insights": self._generate_segment_insights(segments)
            }

        except Exception as e:
            logger.error(f"User segmentation failed: {e}")
            return {"error": str(e)}

    async def _get_user_data(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """Get user data from database"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            # Get user journey data
            cursor.execute("""
                SELECT * FROM user_journeys
                WHERE first_touch >= ? AND last_touch <= ?
                ORDER BY first_touch DESC
            """, (start_date.isoformat(), end_date.isoformat()))

            rows = cursor.fetchall()
            users = []

            for row in rows:
                user_data = {
                    'user_id': row[1],
                    'sessions': json.loads(row[2]) if row[2] else [],
                    'first_touch': row[3],
                    'last_touch': row[4],
                    'total_sessions': row[5],
                    'total_page_views': row[6],
                    'total_time_on_site': row[7],
                    'conversions': json.loads(row[8]) if row[8] else [],
                    'conversion_value': row[9],
                    'entry_pages': json.loads(row[10]) if row[10] else [],
                    'exit_pages': json.loads(row[11]) if row[11] else [],
                    'key_pages': json.loads(row[12]) if row[12] else []
                }
                users.append(user_data)

            conn.close()
            return users

        except Exception as e:
            logger.error(f"Failed to get user data: {e}")
            return []

    def _segment_by_behavior(self, users: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Segment users by behavior patterns"""
        segments = {
            "new_users": [],
            "returning_users": [],
            "engaged_users": [],
            "converters": [],
            "churned_users": []
        }

        for user in users:
            # Classify user segments
            if user['total_sessions'] == 1:
                segments["new_users"].append(user)
            elif user['total_sessions'] >= 10:
                segments["returning_users"].append(user)

            if user['total_time_on_site'] > 600:  # 10+ minutes
                segments["engaged_users"].append(user)

            if user['conversions']:
                segments["converters"].append(user)

            # Check for churned users (no activity in last 30 days)
            if user['last_touch']:
                last_touch = datetime.fromisoformat(user['last_touch'])
                if (datetime.now() - last_touch).days > 30:
                    segments["churned_users"].append(user)

        return segments

    def _segment_by_engagement(self, users: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Segment users by engagement level"""
        segments = {
            "highly_engaged": [],
            "moderately_engaged": [],
            "minimally_engaged": []
        }

        for user in users:
            # Calculate engagement score
            avg_session_time = user['total_time_on_site'] / user['total_sessions'] if user['total_sessions'] > 0 else 0
            pages_per_session = user['total_page_views'] / user['total_sessions'] if user['total_sessions'] > 0 else 0

            # Engagement scoring
            engagement_score = 0
            if avg_session_time > 300:  # 5+ minutes
                engagement_score += 40
            elif avg_session_time > 120:  # 2+ minutes
                engagement_score += 20

            if pages_per_session > 5:
                engagement_score += 30
            elif pages_per_session > 2:
                engagement_score += 15

            if user['conversions']:
                engagement_score += 30

            # Segment based on score
            if engagement_score >= 70:
                segments["highly_engaged"].append(user)
            elif engagement_score >= 40:
                segments["moderately_engaged"].append(user)
            else:
                segments["minimally_engaged"].append(user)

        return segments

    def _segment_by_frequency(self, users: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Segment users by visit frequency"""
        segments = {
            "daily_visitors": [],
            "weekly_visitors": [],
            "monthly_visitors": [],
            "occasional_visitors": []
        }

        for user in users:
            if user['first_touch'] and user['last_touch']:
                first_touch = datetime.fromisoformat(user['first_touch'])
                last_touch = datetime.fromisoformat(user['last_touch'])
                days_active = (last_touch - first_touch).days + 1

                if days_active > 0:
                    frequency = user['total_sessions'] / days_active

                    if frequency >= 1:  # Daily or more
                        segments["daily_visitors"].append(user)
                    elif frequency >= 0.2:  # Weekly (1+ times per week)
                        segments["weekly_visitors"].append(user)
                    elif frequency >= 0.05:  # Monthly (1+ times per month)
                        segments["monthly_visitors"].append(user)
                    else:
                        segments["occasional_visitors"].append(user)

        return segments

    def _segment_by_device(self, users: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Segment users by primary device"""
        # Get user behavior data to determine primary device
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            user_devices = {}
            cursor.execute("""
                SELECT user_id, device_type, COUNT(*) as usage_count
                FROM user_behavior
                WHERE user_id IS NOT NULL
                GROUP BY user_id, device_type
                ORDER BY usage_count DESC
            """)

            for row in cursor.fetchall():
                user_id, device_type, usage_count = row
                if user_id not in user_devices:
                    user_devices[user_id] = device_type

            conn.close()

            segments = {
                "desktop_users": [],
                "mobile_users": [],
                "tablet_users": []
            }

            for user in users:
                primary_device = user_devices.get(user['user_id'], 'desktop')
                if primary_device in segments:
                    segments[primary_device].append(user)

            return segments

        except Exception as e:
            logger.error(f"Failed to segment by device: {e}")
            return {"desktop_users": users, "mobile_users": [], "tablet_users": []}

    def _segment_by_acquisition(self, users: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Segment users by acquisition channel"""
        # Get user acquisition data
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            user_sources = {}
            cursor.execute("""
                SELECT DISTINCT user_id, referrer FROM user_behavior
                WHERE user_id IS NOT NULL AND referrer IS NOT NULL
            """)

            for row in cursor.fetchall():
                user_id, referrer = row
                # Simple source classification
                if not referrer or referrer == '':
                    source = 'direct'
                elif 'google' in referrer.lower():
                    source = 'organic'
                elif 'facebook' in referrer.lower() or 'twitter' in referrer.lower():
                    source = 'social'
                elif referrer.startswith('http'):
                    source = 'referral'
                else:
                    source = 'other'

                if user_id not in user_sources:
                    user_sources[user_id] = source

            conn.close()

            segments = {
                "organic_users": [],
                "direct_users": [],
                "social_users": [],
                "referral_users": [],
                "other_users": []
            }

            for user in users:
                source = user_sources.get(user['user_id'], 'direct')
                if source in segments:
                    segments[source].append(user)
                else:
                    segments["other_users"].append(user)

            return segments

        except Exception as e:
            logger.error(f"Failed to segment by acquisition: {e}")
            return {"direct_users": users, "organic_users": [], "social_users": [], "referral_users": [], "other_users": []}

    def _generate_segment_insights(self, segments: Dict[str, List[Dict[str, Any]]]) -> List[str]:
        """Generate insights from user segmentation"""
        insights = []

        total_users = sum(len(users) for users in segments.values())
        if total_users == 0:
            return insights

        for segment_name, users in segments.items():
            if not users:
                continue

            segment_percentage = (len(users) / total_users) * 100
            segment_display_name = segment_name.replace('_', ' ').title()

            insights.append(f"{segment_display_name}: {len(users)} users ({segment_percentage:.1f}%)")

            # Add segment-specific insights
            if segment_name == "converters" and users:
                avg_conversion_value = sum(u.get('conversion_value', 0) for u in users) / len(users)
                insights.append(f"  Average converter value: ${avg_conversion_value:.2f}")

            elif segment_name == "engaged_users" and users:
                avg_sessions = sum(u.get('total_sessions', 0) for u in users) / len(users)
                insights.append(f"  Average sessions per engaged user: {avg_sessions:.1f}")

        return insights


class JourneyMapper:
    """User journey mapping and flow analysis"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.analytics_db = self.project_path / ".forge" / "analytics.db"

    async def map_user_journeys(self, days: int = 30, journey_type: str = "conversion") -> Dict[str, Any]:
        """Map user journeys and flows"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # Get journey data
            if journey_type == "conversion":
                journeys = await self._get_conversion_journeys(start_date, end_date)
            else:
                journeys = await self._get_all_journeys(start_date, end_date)

            if not journeys:
                return {"error": "No journey data available"}

            # Analyze journeys
            analysis = {
                "journey_overview": self._calculate_journey_overview(journeys),
                "common_paths": self._identify_common_paths(journeys),
                "touchpoint_analysis": self._analyze_touchpoints(journeys),
                "journey_segments": self._segment_journeys(journeys),
                "optimization_opportunities": self._identify_optimization_opportunities(journeys)
            }

            return analysis

        except Exception as e:
            logger.error(f"Journey mapping failed: {e}")
            return {"error": str(e)}

    async def _get_conversion_journeys(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """Get journeys that resulted in conversions"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT uj.*, ce.conversion_type, ce.timestamp as conversion_timestamp
                FROM user_journeys uj
                JOIN conversion_events ce ON uj.user_id = ce.user_id
                WHERE ce.timestamp >= ? AND ce.timestamp <= ?
                ORDER BY uj.first_touch DESC
            """, (start_date.isoformat(), end_date.isoformat()))

            rows = cursor.fetchall()
            journeys = []

            for row in rows:
                journey_data = {
                    'user_id': row[1],
                    'sessions': json.loads(row[2]) if row[2] else [],
                    'first_touch': row[3],
                    'last_touch': row[4],
                    'total_sessions': row[5],
                    'total_page_views': row[6],
                    'total_time_on_site': row[7],
                    'conversions': json.loads(row[8]) if row[8] else [],
                    'conversion_value': row[9],
                    'entry_pages': json.loads(row[10]) if row[10] else [],
                    'exit_pages': json.loads(row[11]) if row[11] else [],
                    'key_pages': json.loads(row[12]) if row[12] else [],
                    'conversion_type': row[13],
                    'conversion_timestamp': row[14]
                }
                journeys.append(journey_data)

            conn.close()
            return journeys

        except Exception as e:
            logger.error(f"Failed to get conversion journeys: {e}")
            return []

    async def _get_all_journeys(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """Get all user journeys in the period"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT * FROM user_journeys
                WHERE first_touch >= ? AND last_touch <= ?
                ORDER BY first_touch DESC
            """, (start_date.isoformat(), end_date.isoformat()))

            rows = cursor.fetchall()
            journeys = []

            for row in rows:
                journey_data = {
                    'user_id': row[1],
                    'sessions': json.loads(row[2]) if row[2] else [],
                    'first_touch': row[3],
                    'last_touch': row[4],
                    'total_sessions': row[5],
                    'total_page_views': row[6],
                    'total_time_on_site': row[7],
                    'conversions': json.loads(row[8]) if row[8] else [],
                    'conversion_value': row[9],
                    'entry_pages': json.loads(row[10]) if row[10] else [],
                    'exit_pages': json.loads(row[11]) if row[11] else [],
                    'key_pages': json.loads(row[12]) if row[12] else []
                }
                journeys.append(journey_data)

            conn.close()
            return journeys

        except Exception as e:
            logger.error(f"Failed to get all journeys: {e}")
            return []

    def _calculate_journey_overview(self, journeys: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate overview metrics for journeys"""
        if not journeys:
            return {}

        total_journeys = len(journeys)
        converting_journeys = len([j for j in journeys if j['conversions']])
        total_conversion_value = sum(j.get('conversion_value', 0) for j in journeys)

        # Journey duration analysis
        journey_durations = []
        for journey in journeys:
            if journey['first_touch'] and journey['last_touch']:
                start = datetime.fromisoformat(journey['first_touch'])
                end = datetime.fromisoformat(journey['last_touch'])
                duration = (end - start).total_seconds()
                journey_durations.append(duration)

        return {
            "total_journeys": total_journeys,
            "converting_journeys": converting_journeys,
            "conversion_rate": (converting_journeys / total_journeys) * 100 if total_journeys > 0 else 0,
            "total_conversion_value": total_conversion_value,
            "avg_conversion_value": total_conversion_value / converting_journeys if converting_journeys > 0 else 0,
            "avg_journey_duration": statistics.mean(journey_durations) if journey_durations else 0,
            "avg_sessions_per_journey": statistics.mean([j['total_sessions'] for j in journeys]) if journeys else 0,
            "avg_pages_per_journey": statistics.mean([j['total_page_views'] for j in journeys]) if journeys else 0
        }

    def _identify_common_paths(self, journeys: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Identify common user journey paths"""
        # Extract paths from entry pages to conversions
        conversion_paths = []
        all_paths = []

        for journey in journeys:
            if journey['entry_pages'] and journey['key_pages']:
                # Create simplified path
                entry = self._extract_page_name(journey['entry_pages'][0]) if journey['entry_pages'] else 'Home'
                key_pages = [self._extract_page_name(page) for page in journey['key_pages'][:3]]  # Top 3 key pages

                path = " -> ".join([entry] + key_pages)
                all_paths.append(path)

                if journey['conversions']:
                    conversion_paths.append(path)

        # Count path frequencies
        all_path_counter = Counter(all_paths)
        conversion_path_counter = Counter(conversion_paths)

        return {
            "top_all_paths": dict(all_path_counter.most_common(10)),
            "top_conversion_paths": dict(conversion_path_counter.most_common(10)),
            "total_unique_paths": len(all_path_counter),
            "conversion_paths_ratio": len(conversion_path_counter) / len(all_path_counter) if all_path_counter else 0
        }

    def _analyze_touchpoints(self, journeys: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze key touchpoints in user journeys"""
        entry_points = Counter()
        exit_points = Counter()
        key_pages = Counter()

        for journey in journeys:
            # Entry points
            for entry in journey.get('entry_pages', []):
                entry_points[self._extract_page_name(entry)] += 1

            # Exit points
            for exit_page in journey.get('exit_pages', []):
                exit_points[self._extract_page_name(exit_page)] += 1

            # Key pages
            for key_page in journey.get('key_pages', []):
                key_pages[self._extract_page_name(key_page)] += 1

        return {
            "top_entry_points": dict(entry_points.most_common(10)),
            "top_exit_points": dict(exit_points.most_common(10)),
            "top_key_pages": dict(key_pages.most_common(10))
        }

    def _segment_journeys(self, journeys: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Segment journeys by characteristics"""
        segments = {
            "quick_conversions": [],  # 1 session, converted
            "research_journeys": [],  # Multiple sessions, converted
            "abandoned_journeys": [],  # Multiple sessions, no conversion
            "single_session": [],  # 1 session, no conversion
            "returning_visitors": []  # Multiple sessions
        }

        for journey in journeys:
            sessions = journey['total_sessions']
            has_conversion = bool(journey['conversions'])

            if sessions == 1 and has_conversion:
                segments["quick_conversions"].append(journey)
            elif sessions > 1 and has_conversion:
                segments["research_journeys"].append(journey)
            elif sessions > 1 and not has_conversion:
                segments["abandoned_journeys"].append(journey)
            elif sessions == 1 and not has_conversion:
                segments["single_session"].append(journey)
            elif sessions > 1:
                segments["returning_visitors"].append(journey)

        return segments

    def _identify_optimization_opportunities(self, journeys: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Identify journey optimization opportunities"""
        opportunities = []

        # Analyze abandoned journeys
        abandoned = [j for j in journeys if not j['conversions'] and j['total_sessions'] > 1]
        if abandoned:
            # Find common exit points in abandoned journeys
            exit_points = Counter()
            for journey in abandoned:
                for exit_page in journey.get('exit_pages', []):
                    exit_points[self._extract_page_name(exit_page)] += 1

            if exit_points:
                top_exit = exit_points.most_common(1)[0]
                opportunities.append({
                    "type": "abandonment_optimization",
                    "description": f"High abandonment at {top_exit[0]} ({top_exit[1]} journeys)",
                    "recommendation": "Improve content, add exit-intent popups, or enhance call-to-action"
                })

        # Analyze journey duration outliers
        durations = []
        for journey in journeys:
            if journey['first_touch'] and journey['last_touch']:
                start = datetime.fromisoformat(journey['first_touch'])
                end = datetime.fromisoformat(journey['last_touch'])
                durations.append((end - start).total_seconds())

        if durations:
            avg_duration = statistics.mean(durations)
            long_journeys = [j for j in journeys if self._get_journey_duration(j) > avg_duration * 2]

            if long_journeys:
                opportunities.append({
                    "type": "journey_acceleration",
                    "description": f"{len(long_journeys)} journeys taking unusually long",
                    "recommendation": "Streamline user paths, improve navigation, or add clearer calls-to-action"
                })

        return opportunities

    def _extract_page_name(self, url: str) -> str:
        """Extract clean page name from URL"""
        if '://' in url:
            url = url.split('://', 1)[1]
        url = url.split('/', 1)[-1] if '/' in url else url

        if not url or url == '':
            return 'Home'
        if url.endswith('/'):
            url = url[:-1]

        segments = url.split('/')
        return segments[-1] if segments else 'Home'

    def _get_journey_duration(self, journey: Dict[str, Any]) -> float:
        """Get journey duration in seconds"""
        if journey['first_touch'] and journey['last_touch']:
            start = datetime.fromisoformat(journey['first_touch'])
            end = datetime.fromisoformat(journey['last_touch'])
            return (end - start).total_seconds()
        return 0