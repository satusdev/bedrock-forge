"""
Analytics Data Models

Data models for website analytics, user behavior, SEO performance,
and business intelligence metrics.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any
from enum import Enum


class TrafficSource(Enum):
    """Traffic source types"""
    ORGANIC = "organic"
    DIRECT = "direct"
    REFERRAL = "referral"
    SOCIAL = "social"
    EMAIL = "email"
    PAID = "paid"
    DISPLAY = "display"
    OTHER = "other"


class DeviceType(Enum):
    """Device types"""
    DESKTOP = "desktop"
    MOBILE = "mobile"
    TABLET = "tablet"


class UserEngagementLevel(Enum):
    """User engagement levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class SEOEventType(Enum):
    """SEO event types"""
    RANKING_CHANGE = "ranking_change"
    KEYWORD_DISCOVERY = "keyword_discovery"
    BACKLINK_ACQUIRED = "backlink_acquired"
    TECHNICAL_ISSUE = "technical_issue"
    CONTENT_OPTIMIZED = "content_optimized"


class ConversionType(Enum):
    """Conversion types"""
    TRANSACTION = "transaction"
    LEAD = "lead"
    SIGNUP = "signup"
    DOWNLOAD = "download"
    FORM_SUBMISSION = "form_submission"
    CUSTOM = "custom"


@dataclass
class TrafficMetrics:
    """Traffic analytics metrics"""
    date: datetime
    sessions: int = 0
    users: int = 0
    page_views: int = 0
    bounce_rate: float = 0.0
    avg_session_duration: float = 0.0
    new_users: int = 0
    returning_users: int = 0

    # Traffic breakdown
    traffic_sources: Dict[TrafficSource, int] = field(default_factory=dict)
    devices: Dict[DeviceType, int] = field(default_factory=dict)
    countries: Dict[str, int] = field(default_factory=dict)
    cities: Dict[str, int] = field(default_factory=dict)

    def get_engagement_score(self) -> float:
        """Calculate engagement score (0-100)"""
        if self.sessions == 0:
            return 0.0

        # Factors: low bounce rate, high session duration, high page views per session
        bounce_score = max(0, (100 - self.bounce_rate) / 100 * 30)
        duration_score = min(30, self.avg_session_duration / 60 * 30)  # 30% weight
        page_views_score = min(40, (self.page_views / self.sessions) * 10)  # 40% weight

        return bounce_score + duration_score + page_views_score

    def get_growth_rate(self, previous_metrics: Optional['TrafficMetrics']) -> float:
        """Calculate growth rate compared to previous period"""
        if not previous_metrics or previous_metrics.sessions == 0:
            return 0.0

        return ((self.sessions - previous_metrics.sessions) / previous_metrics.sessions) * 100


@dataclass
class ContentMetrics:
    """Content performance metrics"""
    url: str
    title: str
    date: datetime
    page_views: int = 0
    unique_page_views: int = 0
    avg_time_on_page: float = 0.0
    entrances: int = 0
    bounce_rate: float = 0.0
    exit_rate: float = 0.0
    conversions: int = 0

    # SEO metrics
    organic_traffic: int = 0
    keyword_rankings: Dict[str, int] = field(default_factory=dict)
    backlinks: int = 0

    def get_content_score(self) -> float:
        """Calculate content performance score (0-100)"""
        if self.page_views == 0:
            return 0.0

        # Factors: engagement, time on page, conversions, SEO performance
        engagement_score = max(0, (100 - self.bounce_rate) / 100 * 25)
        time_score = min(25, self.avg_time_on_page / 180 * 25)  # 25% weight, 3min max
        conversion_score = min(25, (self.conversions / self.page_views) * 100 * 25)  # 25% weight
        seo_score = min(25, (self.organic_traffic / self.page_views) * 100 * 25)  # 25% weight

        return engagement_score + time_score + conversion_score + seo_score


@dataclass
class UserBehavior:
    """User behavior tracking data"""
    session_id: str
    user_id: Optional[str]
    timestamp: datetime
    page_url: str
    referrer: Optional[str]
    user_agent: str
    ip_address: str
    device_type: DeviceType
    browser: str
    os: str
    country: Optional[str]
    city: Optional[str]

    # Engagement metrics
    time_on_page: float = 0.0
    scroll_depth: float = 0.0
    clicks: int = 0
    form_interactions: int = 0

    # Journey tracking
    entry_page: bool = False
    exit_page: bool = False
    conversion_events: List[str] = field(default_factory=list)


@dataclass
class UserJourney:
    """Complete user journey across sessions"""
    user_id: str
    sessions: List[str] = field(default_factory=list)
    first_touch: Optional[datetime] = None
    last_touch: Optional[datetime] = None
    total_sessions: int = 0
    total_page_views: int = 0
    total_time_on_site: float = 0.0
    conversions: List[str] = field(default_factory=list)
    conversion_value: float = 0.0

    # Path analysis
    entry_pages: List[str] = field(default_factory=list)
    exit_pages: List[str] = field(default_factory=list)
    key_pages: List[str] = field(default_factory=list)

    def get_lifecycle_stage(self) -> str:
        """Determine user lifecycle stage"""
        if self.total_sessions == 1:
            return "new"
        elif self.total_sessions <= 3:
            return "engaged"
        elif self.total_sessions <= 10:
            return "returning"
        else:
            return "loyal"

    def get_engagement_level(self) -> UserEngagementLevel:
        """Calculate user engagement level"""
        if self.total_sessions == 0:
            return UserEngagementLevel.LOW

        avg_time_per_session = self.total_time_on_site / self.total_sessions
        pages_per_session = self.total_page_views / self.total_sessions

        if avg_time_per_session > 300 and pages_per_session > 5:
            return UserEngagementLevel.HIGH
        elif avg_time_per_session > 120 and pages_per_session > 3:
            return UserEngagementLevel.MEDIUM
        else:
            return UserEngagementLevel.LOW


@dataclass
class SEOMetrics:
    """SEO performance metrics"""
    date: datetime
    domain: str
    keyword: str
    position: int
    search_volume: int = 0
    click_through_rate: float = 0.0
    impressions: int = 0
    clicks: int = 0
    url: Optional[str] = None
    search_engine: str = "google"

    # Competitor data
    competitor_positions: Dict[str, int] = field(default_factory=dict)

    def get_seo_score(self) -> float:
        """Calculate SEO performance score (0-100)"""
        position_score = max(0, (11 - self.position) / 10 * 40)  # 40% weight
        ctr_score = min(30, self.click_through_rate * 100 * 30)  # 30% weight
        volume_score = min(30, (self.search_volume / 1000) * 30)  # 30% weight

        return position_score + ctr_score + volume_score


@dataclass
class BacklinkProfile:
    """Backlink profile metrics"""
    domain: str
    date: datetime
    total_backlinks: int = 0
    referring_domains: int = 0
    domain_authority: float = 0.0
    page_authority: float = 0.0
    spam_score: float = 0.0

    # Backlink quality breakdown
    high_quality_links: int = 0
    medium_quality_links: int = 0
    low_quality_links: int = 0

    # New/lost links
    new_links: int = 0
    lost_links: int = 0

    def get_backlink_health_score(self) -> float:
        """Calculate backlink health score (0-100)"""
        if self.total_backlinks == 0:
            return 0.0

        # Factors: domain authority, link quality, growth rate
        authority_score = min(40, self.domain_authority / 100 * 40)  # 40% weight
        quality_score = (self.high_quality_links / self.total_backlinks) * 35  # 35% weight
        growth_score = min(25, max(0, (self.new_links - self.lost_links) / 10 * 25))  # 25% weight

        return authority_score + quality_score + growth_score


@dataclass
class ConversionEvent:
    """Conversion event tracking"""
    event_id: str
    session_id: str
    user_id: Optional[str]
    timestamp: datetime
    conversion_type: ConversionType
    value: float = 0.0
    currency: str = "USD"
    page_url: Optional[str] = None

    # Attribution data
    traffic_source: Optional[TrafficSource] = None
    campaign: Optional[str] = None
    medium: Optional[str] = None
    content: Optional[str] = None

    # Product data (for e-commerce)
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    quantity: int = 1
    category: Optional[str] = None


@dataclass
class ConversionFunnel:
    """Conversion funnel analysis"""
    name: str
    date: datetime
    steps: List[Dict[str, Any]] = field(default_factory=list)
    total_entries: int = 0
    total_exits: int = 0
    total_conversions: int = 0
    conversion_rate: float = 0.0
    total_value: float = 0.0

    # Step-by-step data
    step_data: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def calculate_funnel_performance(self) -> Dict[str, float]:
        """Calculate funnel performance metrics"""
        if not self.steps:
            return {}

        performance = {}
        previous_users = self.total_entries

        for i, step in enumerate(self.steps):
            step_name = step['name']
            step_users = step.get('users', 0)

            if previous_users > 0:
                dropoff_rate = ((previous_users - step_users) / previous_users) * 100
                performance[step_name] = {
                    'users': step_users,
                    'dropoff_rate': dropoff_rate,
                    'completion_rate': (step_users / self.total_entries) * 100
                }

            previous_users = step_users

        return performance


@dataclass
class BusinessMetrics:
    """Business intelligence metrics"""
    date: datetime
    revenue: float = 0.0
    costs: float = 0.0
    profit: float = 0.0
    customers: int = 0
    leads: int = 0
    conversion_rate: float = 0.0
    customer_acquisition_cost: float = 0.0
    customer_lifetime_value: float = 0.0
    average_order_value: float = 0.0

    # Traffic and engagement
    website_visitors: int = 0
    qualified_leads: int = 0
    marketing_qualified_leads: int = 0
    sales_qualified_leads: int = 0

    def calculate_roi(self) -> float:
        """Calculate return on investment"""
        if self.costs == 0:
            return 0.0
        return ((self.revenue - self.costs) / self.costs) * 100

    def calculate_profit_margin(self) -> float:
        """Calculate profit margin"""
        if self.revenue == 0:
            return 0.0
        return (self.profit / self.revenue) * 100


@dataclass
class KPITracker:
    """KPI tracking and monitoring"""
    name: str
    current_value: float
    target_value: float
    previous_value: float
    date: datetime
    unit: str = ""
    trend: str = "stable"  # up, down, stable

    def calculate_performance(self) -> Dict[str, Any]:
        """Calculate KPI performance metrics"""
        if self.target_value == 0:
            achievement_rate = 0.0
        else:
            achievement_rate = (self.current_value / self.target_value) * 100

        if self.previous_value == 0:
            change_rate = 0.0
        else:
            change_rate = ((self.current_value - self.previous_value) / self.previous_value) * 100

        return {
            'achievement_rate': achievement_rate,
            'change_rate': change_rate,
            'gap': self.target_value - self.current_value,
            'status': 'on_track' if achievement_rate >= 80 else 'behind' if achievement_rate >= 60 else 'critical'
        }


@dataclass
class AnalyticsReport:
    """Comprehensive analytics report"""
    report_id: str
    title: str
    date_range: Dict[str, datetime]
    generated_at: datetime
    metrics: Dict[str, Any] = field(default_factory=dict)

    # Report sections
    traffic_summary: Optional[TrafficMetrics] = None
    content_performance: List[ContentMetrics] = field(default_factory=list)
    seo_overview: List[SEOMetrics] = field(default_factory=list)
    conversion_data: List[ConversionEvent] = field(default_factory=list)
    business_metrics: Optional[BusinessMetrics] = None
    kpis: List[KPITracker] = field(default_factory=list)

    # Insights and recommendations
    insights: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)
    alerts: List[str] = field(default_factory=list)

    def get_overall_score(self) -> float:
        """Calculate overall performance score"""
        scores = []

        if self.traffic_summary:
            scores.append(self.traffic_summary.get_engagement_score())

        if self.content_performance:
            content_scores = [content.get_content_score() for content in self.content_performance]
            scores.append(sum(content_scores) / len(content_scores))

        if self.seo_overview:
            seo_scores = [seo.get_seo_score() for seo in self.seo_overview]
            scores.append(sum(seo_scores) / len(seo_scores))

        if self.business_metrics:
            scores.append(self.business_metrics.calculate_roi())

        return sum(scores) / len(scores) if scores else 0.0