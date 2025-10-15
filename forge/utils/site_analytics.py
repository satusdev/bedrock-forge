"""
Website Performance Analytics

Handles analysis of website performance metrics, traffic patterns,
content performance, and user engagement analytics.
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

from ..models.analytics import (
    TrafficMetrics, ContentMetrics, UserBehavior, UserJourney,
    TrafficSource, DeviceType, UserEngagementLevel
)
from ..constants import *

logger = logging.getLogger(__name__)


class TrafficAnalyzer:
    """Traffic pattern analysis and insights"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.analytics_db = self.project_path / ".forge" / "analytics.db"
        self.cache_ttl = 3600  # 1 hour cache

    async def analyze_traffic_patterns(self, days: int = 30) -> Dict[str, Any]:
        """Analyze traffic patterns and trends"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # Get traffic metrics from database
            metrics = await self._get_traffic_metrics(start_date, end_date)

            if not metrics:
                return {"error": "No traffic data available"}

            # Perform analysis
            analysis = {
                "summary": self._calculate_traffic_summary(metrics),
                "trends": self._analyze_traffic_trends(metrics),
                "patterns": self._identify_traffic_patterns(metrics),
                "insights": self._generate_traffic_insights(metrics),
                "recommendations": self._generate_traffic_recommendations(metrics)
            }

            return analysis

        except Exception as e:
            logger.error(f"Traffic analysis failed: {e}")
            return {"error": str(e)}

    async def _get_traffic_metrics(self, start_date: datetime, end_date: datetime) -> List[TrafficMetrics]:
        """Get traffic metrics from database"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT * FROM traffic_metrics
                WHERE date >= ? AND date <= ?
                ORDER BY date ASC
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

    def _calculate_traffic_summary(self, metrics: List[TrafficMetrics]) -> Dict[str, Any]:
        """Calculate overall traffic summary"""
        if not metrics:
            return {}

        total_sessions = sum(m.sessions for m in metrics)
        total_users = sum(m.users for m in metrics)
        total_page_views = sum(m.page_views for m in metrics)
        total_new_users = sum(m.new_users for m in metrics)

        avg_bounce_rate = statistics.mean([m.bounce_rate for m in metrics if m.bounce_rate > 0])
        avg_session_duration = statistics.mean([m.avg_session_duration for m in metrics if m.avg_session_duration > 0])

        # Traffic source breakdown
        all_sources = {}
        for metric in metrics:
            for source, count in metric.traffic_sources.items():
                all_sources[source.value] = all_sources.get(source.value, 0) + count

        # Device breakdown
        all_devices = {}
        for metric in metrics:
            for device, count in metric.devices.items():
                all_devices[device.value] = all_devices.get(device.value, 0) + count

        return {
            "total_sessions": total_sessions,
            "total_users": total_users,
            "total_page_views": total_page_views,
            "total_new_users": total_new_users,
            "returning_users": total_users - total_new_users,
            "avg_daily_sessions": total_sessions / len(metrics),
            "avg_bounce_rate": round(avg_bounce_rate, 2),
            "avg_session_duration": round(avg_session_duration, 2),
            "pages_per_session": round(total_page_views / total_sessions, 2) if total_sessions > 0 else 0,
            "new_user_rate": round((total_new_users / total_users) * 100, 2) if total_users > 0 else 0,
            "traffic_sources": all_sources,
            "devices": all_devices,
            "analysis_period": f"{len(metrics)} days"
        }

    def _analyze_traffic_trends(self, metrics: List[TrafficMetrics]) -> Dict[str, Any]:
        """Analyze traffic trends over time"""
        if len(metrics) < 7:
            return {"message": "Insufficient data for trend analysis"}

        # Split data for comparison
        midpoint = len(metrics) // 2
        first_half = metrics[:midpoint]
        second_half = metrics[midpoint:]

        # Calculate trends
        first_half_sessions = sum(m.sessions for m in first_half)
        second_half_sessions = sum(m.sessions for m in second_half)

        first_half_users = sum(m.users for m in first_half)
        second_half_users = sum(m.users for m in second_half)

        # Trend calculations
        session_trend = ((second_half_sessions - first_half_sessions) / first_half_sessions) * 100 if first_half_sessions > 0 else 0
        user_trend = ((second_half_users - first_half_users) / first_half_users) * 100 if first_half_users > 0 else 0

        # Calculate daily averages for trend line
        daily_sessions = [m.sessions for m in metrics]
        daily_users = [m.users for m in metrics]

        return {
            "session_trend_percent": round(session_trend, 2),
            "user_trend_percent": round(user_trend, 2),
            "trend_direction": "increasing" if session_trend > 5 else "decreasing" if session_trend < -5 else "stable",
            "daily_sessions": daily_sessions,
            "daily_users": daily_users,
            "peak_traffic_day": max(metrics, key=lambda m: m.sessions).date.strftime("%Y-%m-%d"),
            "lowest_traffic_day": min(metrics, key=lambda m: m.sessions).date.strftime("%Y-%m-%d")
        }

    def _identify_traffic_patterns(self, metrics: List[TrafficMetrics]) -> Dict[str, Any]:
        """Identify recurring traffic patterns"""
        patterns = {}

        if len(metrics) < 14:
            return patterns

        # Day of week patterns
        day_patterns = {}
        for metric in metrics:
            day_name = metric.date.strftime("%A")
            if day_name not in day_patterns:
                day_patterns[day_name] = []
            day_patterns[day_name].append(metric.sessions)

        # Calculate average by day of week
        day_averages = {}
        for day, sessions in day_patterns.items():
            day_averages[day] = statistics.mean(sessions)

        patterns["best_day"] = max(day_averages, key=day_averages.get)
        patterns["worst_day"] = min(day_averages, key=day_averages.get)
        patterns["day_averages"] = day_averages

        # Weekly patterns (if enough data)
        if len(metrics) >= 28:
            weekly_patterns = []
            for i in range(0, len(metrics), 7):
                week_data = metrics[i:i+7]
                weekly_total = sum(m.sessions for m in week_data)
                weekly_patterns.append(weekly_total)

            patterns["weekly_patterns"] = weekly_patterns
            patterns["best_week"] = max(range(len(weekly_patterns)), key=lambda i: weekly_patterns[i]) + 1
            patterns["worst_week"] = min(range(len(weekly_patterns)), key=lambda i: weekly_patterns[i]) + 1

        return patterns

    def _generate_traffic_insights(self, metrics: List[TrafficMetrics]) -> List[str]:
        """Generate insights from traffic data"""
        insights = []

        if not metrics:
            return insights

        total_sessions = sum(m.sessions for m in metrics)
        total_page_views = sum(m.page_views for m in metrics)
        avg_bounce_rate = statistics.mean([m.bounce_rate for m in metrics if m.bounce_rate > 0])

        # Engagement insights
        if avg_bounce_rate > 70:
            insights.append("High bounce rate detected. Consider improving content relevance and page load speed.")
        elif avg_bounce_rate < 30:
            insights.append("Excellent bounce rate. Users are highly engaged with your content.")

        pages_per_session = total_page_views / total_sessions if total_sessions > 0 else 0
        if pages_per_session > 3:
            insights.append("Good page depth. Users are exploring multiple pages per session.")
        elif pages_per_session < 1.5:
            insights.append("Low page depth. Consider improving internal linking and content discovery.")

        # Traffic source insights
        all_sources = {}
        for metric in metrics:
            for source, count in metric.traffic_sources.items():
                all_sources[source.value] = all_sources.get(source.value, 0) + count

        if all_sources:
            top_source = max(all_sources, key=all_sources.get)
            organic_percentage = (all_sources.get('organic', 0) / total_sessions) * 100 if total_sessions > 0 else 0

            if organic_percentage > 50:
                insights.append(f"Strong organic traffic performance ({organic_percentage:.1f}%). SEO efforts are paying off.")
            elif organic_percentage < 20:
                insights.append("Low organic traffic. Consider improving SEO strategy.")

            insights.append(f"Top traffic source: {top_source} ({all_sources[top_source]} sessions)")

        return insights

    def _generate_traffic_recommendations(self, metrics: List[TrafficMetrics]) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []

        if not metrics:
            return recommendations

        # Trend-based recommendations
        if len(metrics) >= 14:
            midpoint = len(metrics) // 2
            first_half = metrics[:midpoint]
            second_half = metrics[midpoint:]

            first_half_sessions = sum(m.sessions for m in first_half)
            second_half_sessions = sum(m.sessions for m in second_half)

            trend = ((second_half_sessions - first_half_sessions) / first_half_sessions) * 100 if first_half_sessions > 0 else 0

            if trend < -10:
                recommendations.append("Traffic is declining. Consider content marketing campaigns or SEO improvements.")
            elif trend > 20:
                recommendations.append("Traffic is growing strongly. Analyze what's working and scale successful strategies.")

        # Bounce rate recommendations
        avg_bounce_rate = statistics.mean([m.bounce_rate for m in metrics if m.bounce_rate > 0])
        if avg_bounce_rate > 60:
            recommendations.append("Improve page load speed and content relevance to reduce bounce rate.")
            recommendations.append("Add related content suggestions to keep users engaged.")

        # Device-specific recommendations
        all_devices = {}
        for metric in metrics:
            for device, count in metric.devices.items():
                all_devices[device.value] = all_devices.get(device.value, 0) + count

        if all_devices:
            mobile_percentage = (all_devices.get('mobile', 0) / sum(all_devices.values())) * 100
            if mobile_percentage > 60:
                recommendations.append("High mobile traffic. Ensure mobile-first design and fast mobile load times.")

        return recommendations


class ContentAnalyzer:
    """Content performance analysis"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.analytics_db = self.project_path / ".forge" / "analytics.db"

    async def analyze_content_performance(self, days: int = 30) -> Dict[str, Any]:
        """Analyze content performance metrics"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # Get content metrics from database
            content_metrics = await self._get_content_metrics(start_date, end_date)

            if not content_metrics:
                return {"error": "No content data available"}

            # Perform analysis
            analysis = {
                "top_pages": self._get_top_pages(content_metrics),
                "content_categories": self._analyze_content_categories(content_metrics),
                "engagement_metrics": self._calculate_engagement_metrics(content_metrics),
                "content_insights": self._generate_content_insights(content_metrics),
                "optimization_opportunities": self._identify_optimization_opportunities(content_metrics)
            }

            return analysis

        except Exception as e:
            logger.error(f"Content analysis failed: {e}")
            return {"error": str(e)}

    async def _get_content_metrics(self, start_date: datetime, end_date: datetime) -> List[ContentMetrics]:
        """Get content metrics from database"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT * FROM content_metrics
                WHERE date >= ? AND date <= ?
                ORDER BY page_views DESC
            """, (start_date.isoformat(), end_date.isoformat()))

            rows = cursor.fetchall()
            metrics = []

            for row in rows:
                metric = ContentMetrics(
                    url=row[1],
                    title=row[2],
                    date=datetime.fromisoformat(row[3]),
                    page_views=row[4],
                    unique_page_views=row[5],
                    avg_time_on_page=row[6],
                    entrances=row[7],
                    bounce_rate=row[8],
                    exit_rate=row[9],
                    conversions=row[10],
                    organic_traffic=row[11],
                    keyword_rankings=json.loads(row[12]) if row[12] else {},
                    backlinks=row[13]
                )
                metrics.append(metric)

            conn.close()
            return metrics

        except Exception as e:
            logger.error(f"Failed to get content metrics: {e}")
            return []

    def _get_top_pages(self, content_metrics: List[ContentMetrics], limit: int = 10) -> List[Dict[str, Any]]:
        """Get top performing pages"""
        top_pages = []

        for metric in content_metrics[:limit]:
            page_data = {
                "url": metric.url,
                "title": metric.title,
                "page_views": metric.page_views,
                "unique_page_views": metric.unique_page_views,
                "avg_time_on_page": metric.avg_time_on_page,
                "bounce_rate": metric.bounce_rate,
                "conversions": metric.conversions,
                "content_score": metric.get_content_score()
            }
            top_pages.append(page_data)

        return top_pages

    def _analyze_content_categories(self, content_metrics: List[ContentMetrics]) -> Dict[str, Any]:
        """Analyze content by categories (based on URL patterns)"""
        categories = {}

        for metric in content_metrics:
            # Simple categorization based on URL patterns
            category = self._categorize_content(metric.url)

            if category not in categories:
                categories[category] = {
                    "pages": 0,
                    "total_views": 0,
                    "total_conversions": 0,
                    "avg_time_on_page": 0,
                    "avg_bounce_rate": 0
                }

            cat_data = categories[category]
            cat_data["pages"] += 1
            cat_data["total_views"] += metric.page_views
            cat_data["total_conversions"] += metric.conversions

        # Calculate averages for each category
        for category, data in categories.items():
            if data["pages"] > 0:
                category_metrics = [m for m in content_metrics if self._categorize_content(m.url) == category]
                data["avg_time_on_page"] = statistics.mean([m.avg_time_on_page for m in category_metrics if m.avg_time_on_page > 0])
                data["avg_bounce_rate"] = statistics.mean([m.bounce_rate for m in category_metrics if m.bounce_rate > 0])

        return categories

    def _categorize_content(self, url: str) -> str:
        """Simple content categorization based on URL"""
        url_lower = url.lower()

        if "/blog/" in url_lower or "/news/" in url_lower or "/article/" in url_lower:
            return "blog"
        elif "/product/" in url_lower or "/shop/" in url_lower:
            return "product"
        elif "/service/" in url_lower or "/services/" in url_lower:
            return "service"
        elif "/about/" in url_lower or "/team/" in url_lower:
            return "about"
        elif "/contact/" in url_lower:
            return "contact"
        elif "/landing/" in url_lower:
            return "landing"
        else:
            return "other"

    def _calculate_engagement_metrics(self, content_metrics: List[ContentMetrics]) -> Dict[str, Any]:
        """Calculate overall engagement metrics"""
        if not content_metrics:
            return {}

        total_views = sum(m.page_views for m in content_metrics)
        total_unique_views = sum(m.unique_page_views for m in content_metrics)
        total_conversions = sum(m.conversions for m in content_metrics)

        avg_time_on_page = statistics.mean([m.avg_time_on_page for m in content_metrics if m.avg_time_on_page > 0])
        avg_bounce_rate = statistics.mean([m.bounce_rate for m in content_metrics if m.bounce_rate > 0])
        avg_exit_rate = statistics.mean([m.exit_rate for m in content_metrics if m.exit_rate > 0])

        # Calculate content scores
        content_scores = [m.get_content_score() for m in content_metrics]
        avg_content_score = statistics.mean(content_scores)

        return {
            "total_pages": len(content_metrics),
            "total_page_views": total_views,
            "total_unique_page_views": total_unique_views,
            "total_conversions": total_conversions,
            "conversion_rate": round((total_conversions / total_views) * 100, 2) if total_views > 0 else 0,
            "avg_time_on_page": round(avg_time_on_page, 2),
            "avg_bounce_rate": round(avg_bounce_rate, 2),
            "avg_exit_rate": round(avg_exit_rate, 2),
            "avg_content_score": round(avg_content_score, 2),
            "high_performing_pages": len([m for m in content_metrics if m.get_content_score() > 70]),
            "low_performing_pages": len([m for m in content_metrics if m.get_content_score() < 40])
        }

    def _generate_content_insights(self, content_metrics: List[ContentMetrics]) -> List[str]:
        """Generate content performance insights"""
        insights = []

        if not content_metrics:
            return insights

        # Top performing content
        top_content = max(content_metrics, key=lambda m: m.page_views)
        insights.append(f"Most popular page: '{top_content.title}' with {top_content.page_views} views")

        # Engagement insights
        avg_time = statistics.mean([m.avg_time_on_page for m in content_metrics if m.avg_time_on_page > 0])
        if avg_time > 180:
            insights.append("Excellent content engagement. Users spend over 3 minutes on average.")
        elif avg_time < 60:
            insights.append("Low engagement time. Consider improving content quality and readability.")

        # Conversion insights
        total_conversions = sum(m.conversions for m in content_metrics)
        converting_pages = [m for m in content_metrics if m.conversions > 0]

        if converting_pages:
            best_converting = max(converting_pages, key=lambda m: m.conversions)
            insights.append(f"Best converting page: '{best_converting.title}' with {best_converting.conversions} conversions")

        return insights

    def _identify_optimization_opportunities(self, content_metrics: List[ContentMetrics]) -> List[Dict[str, Any]]:
        """Identify content optimization opportunities"""
        opportunities = []

        # High bounce rate pages
        high_bounce = [m for m in content_metrics if m.bounce_rate > 70 and m.page_views > 100]
        for metric in high_bounce[:5]:
            opportunities.append({
                "type": "high_bounce_rate",
                "url": metric.url,
                "title": metric.title,
                "bounce_rate": metric.bounce_rate,
                "recommendation": "Improve content relevance, page load speed, and add related content suggestions."
            })

        # Low engagement pages
        low_engagement = [m for m in content_metrics if m.avg_time_on_page < 30 and m.page_views > 50]
        for metric in low_engagement[:5]:
            opportunities.append({
                "type": "low_engagement",
                "url": metric.url,
                "title": metric.title,
                "avg_time_on_page": metric.avg_time_on_page,
                "recommendation": "Improve content quality, add multimedia elements, and enhance readability."
            })

        # High potential pages (good views but low conversions)
        high_potential = [m for m in content_metrics if m.page_views > 500 and m.conversions == 0]
        for metric in high_potential[:5]:
            opportunities.append({
                "type": "conversion_optimization",
                "url": metric.url,
                "title": metric.title,
                "page_views": metric.page_views,
                "recommendation": "Add clear calls-to-action, conversion forms, or lead magnets."
            })

        return opportunities


class RealTimeAnalytics:
    """Real-time analytics data processing"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.analytics_db = self.project_path / ".forge" / "analytics.db"

    async def get_real_time_data(self) -> Dict[str, Any]:
        """Get real-time analytics data"""
        try:
            # Get current active sessions
            active_sessions = await self._get_active_sessions()

            # Get recent page views (last 30 minutes)
            recent_views = await self._get_recent_page_views(minutes=30)

            # Get today's metrics
            today_metrics = await self._get_today_metrics()

            # Get top active pages
            active_pages = await self._get_active_pages()

            return {
                "active_sessions": active_sessions,
                "recent_page_views": recent_views,
                "today_metrics": today_metrics,
                "active_pages": active_pages,
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Real-time analytics failed: {e}")
            return {"error": str(e)}

    async def _get_active_sessions(self) -> int:
        """Get count of active sessions"""
        # In a real implementation, this would query active session data
        # For now, we'll simulate with recent user behavior data
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            # Get sessions from last 30 minutes
            cutoff_time = (datetime.now() - timedelta(minutes=30)).isoformat()
            cursor.execute("""
                SELECT COUNT(DISTINCT session_id) FROM user_behavior
                WHERE timestamp >= ?
            """, (cutoff_time,))

            result = cursor.fetchone()
            conn.close()

            return result[0] if result else 0

        except Exception as e:
            logger.error(f"Failed to get active sessions: {e}")
            return 0

    async def _get_recent_page_views(self, minutes: int = 30) -> int:
        """Get recent page views count"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            cutoff_time = (datetime.now() - timedelta(minutes=minutes)).isoformat()
            cursor.execute("""
                SELECT COUNT(*) FROM user_behavior
                WHERE timestamp >= ?
            """, (cutoff_time,))

            result = cursor.fetchone()
            conn.close()

            return result[0] if result else 0

        except Exception as e:
            logger.error(f"Failed to get recent page views: {e}")
            return 0

    async def _get_today_metrics(self) -> Dict[str, Any]:
        """Get today's traffic metrics"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            today = datetime.now().strftime("%Y-%m-%d")
            cursor.execute("""
                SELECT sessions, users, page_views FROM traffic_metrics
                WHERE date = ?
            """, (today,))

            result = cursor.fetchone()
            conn.close()

            if result:
                return {
                    "sessions": result[0],
                    "users": result[1],
                    "page_views": result[2]
                }
            else:
                # No data for today yet, return zeros
                return {"sessions": 0, "users": 0, "page_views": 0}

        except Exception as e:
            logger.error(f"Failed to get today's metrics: {e}")
            return {"sessions": 0, "users": 0, "page_views": 0}

    async def _get_active_pages(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get currently active pages"""
        try:
            conn = sqlite3.connect(self.analytics_db)
            cursor = conn.cursor()

            # Get pages with activity in last hour
            cutoff_time = (datetime.now() - timedelta(hours=1)).isoformat()
            cursor.execute("""
                SELECT page_url, COUNT(*) as views, COUNT(DISTINCT session_id) as sessions
                FROM user_behavior
                WHERE timestamp >= ?
                GROUP BY page_url
                ORDER BY views DESC
                LIMIT ?
            """, (cutoff_time, limit))

            rows = cursor.fetchall()
            conn.close()

            active_pages = []
            for row in rows:
                active_pages.append({
                    "url": row[0],
                    "views": row[1],
                    "sessions": row[2]
                })

            return active_pages

        except Exception as e:
            logger.error(f"Failed to get active pages: {e}")
            return []