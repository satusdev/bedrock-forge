"""
Report Generation Utility

Handles custom report generation, template management,
automated scheduling, and multi-format export for analytics.
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

from ..models.analytics import AnalyticsReport
from ..constants import *

logger = logging.getLogger(__name__)


class ReportTemplate:
    """Report template with customizable sections and styling"""

    def __init__(self, name: str, template_type: str, config: Dict[str, Any]):
        self.name = name
        self.template_type = template_type
        self.config = config
        self.sections = config.get('sections', [])
        self.styling = config.get('styling', {})
        self.schedule = config.get('schedule', {})

    def to_dict(self) -> Dict[str, Any]:
        """Convert template to dictionary"""
        return {
            'name': self.name,
            'template_type': self.template_type,
            'config': self.config
        }


class ReportGenerator:
    """Custom report generation and management system"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.reports_db = self.project_path / ".forge" / "reports.db"
        self.templates_path = self.project_path / ".forge" / "report_templates.json"
        self.reports_dir = self.project_path / "reports"

        # Initialize database and directories
        self._init_reports_database()
        self._init_default_templates()
        self.reports_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Report generator initialized for {project_path}")

    def _init_reports_database(self):
        """Initialize reports database"""
        self.reports_db.parent.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(self.reports_db)
        cursor = conn.cursor()

        # Generated reports table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS generated_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id TEXT UNIQUE,
                template_name TEXT,
                report_type TEXT,
                title TEXT,
                description TEXT,
                generated_at TEXT,
                generated_by TEXT,
                format_type TEXT,
                file_path TEXT,
                parameters TEXT,
                status TEXT DEFAULT 'completed',
                error_message TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Report schedules table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS report_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_name TEXT UNIQUE,
                template_name TEXT,
                cron_expression TEXT,
                recipients TEXT,
                parameters TEXT,
                next_run TEXT,
                last_run TEXT,
                active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Report templates table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS report_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_name TEXT UNIQUE,
                template_type TEXT,
                config TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Report metrics table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS report_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id TEXT,
                metric_name TEXT,
                metric_value REAL,
                metadata TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_reports_generated_at ON generated_reports(generated_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_reports_template ON generated_reports(template_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON report_schedules(next_run)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_templates_type ON report_templates(template_type)")

        conn.commit()
        conn.close()

    def _init_default_templates(self):
        """Initialize default report templates"""
        if not self.templates_path.exists():
            default_templates = self._get_default_templates()
            with open(self.templates_path, 'w') as f:
                json.dump(default_templates, f, indent=2)

            # Save templates to database
            conn = sqlite3.connect(self.reports_db)
            cursor = conn.cursor()

            for template_name, template_config in default_templates.items():
                cursor.execute("""
                    INSERT OR REPLACE INTO report_templates (
                        template_name, template_type, config
                    ) VALUES (?, ?, ?)
                """, (
                    template_name,
                    template_config['template_type'],
                    json.dumps(template_config)
                ))

            conn.commit()
            conn.close()

    def _get_default_templates(self) -> Dict[str, Any]:
        """Get default report templates"""
        return {
            "executive_summary": {
                "template_type": "executive",
                "name": "Executive Summary",
                "description": "High-level overview for executives",
                "sections": [
                    {
                        "name": "overview",
                        "title": "Business Overview",
                        "type": "summary",
                        "metrics": ["total_users", "total_revenue", "conversion_rate", "performance_score"]
                    },
                    {
                        "name": "key_metrics",
                        "title": "Key Performance Indicators",
                        "type": "kpi",
                        "metrics": ["traffic_growth", "conversion_growth", "revenue_growth"]
                    },
                    {
                        "name": "highlights",
                        "title": "Performance Highlights",
                        "type": "highlights",
                        "metrics": ["top_pages", "best_converting_channels", "improvements"]
                    }
                ],
                "styling": {
                    "theme": "professional",
                    "logo": True,
                    "charts": True
                }
            },
            "traffic_analysis": {
                "template_type": "analytics",
                "name": "Traffic Analysis Report",
                "description": "Comprehensive traffic and user behavior analysis",
                "sections": [
                    {
                        "name": "traffic_overview",
                        "title": "Traffic Overview",
                        "type": "overview",
                        "metrics": ["sessions", "users", "page_views", "bounce_rate"]
                    },
                    {
                        "name": "traffic_sources",
                        "title": "Traffic Sources",
                        "type": "breakdown",
                        "metrics": ["organic", "direct", "referral", "social", "paid"]
                    },
                    {
                        "name": "user_behavior",
                        "title": "User Behavior",
                        "type": "behavior",
                        "metrics": ["session_duration", "pages_per_session", "engagement_rate"]
                    },
                    {
                        "name": "device_analysis",
                        "title": "Device Analysis",
                        "type": "breakdown",
                        "metrics": ["desktop", "mobile", "tablet"]
                    }
                ],
                "styling": {
                    "theme": "modern",
                    "charts": True,
                    "tables": True
                }
            },
            "seo_performance": {
                "template_type": "seo",
                "name": "SEO Performance Report",
                "description": "SEO metrics, rankings, and optimization opportunities",
                "sections": [
                    {
                        "name": "seo_overview",
                        "title": "SEO Overview",
                        "type": "overview",
                        "metrics": ["avg_position", "total_impressions", "total_clicks", "ctr"]
                    },
                    {
                        "name": "keyword_performance",
                        "title": "Keyword Performance",
                        "type": "top_performers",
                        "metrics": ["top_keywords", "ranking_improvements", "opportunities"]
                    },
                    {
                        "name": "technical_seo",
                        "title": "Technical SEO",
                        "type": "checklist",
                        "metrics": ["page_speed", "mobile_friendly", "https_status", "crawl_errors"]
                    },
                    {
                        "name": "backlink_analysis",
                        "title": "Backlink Profile",
                        "type": "analysis",
                        "metrics": ["total_backlinks", "domain_authority", "new_links", "lost_links"]
                    }
                ],
                "styling": {
                    "theme": "technical",
                    "charts": True,
                    "tables": True
                }
            },
            "conversion_funnel": {
                "template_type": "conversions",
                "name": "Conversion Funnel Analysis",
                "description": "Conversion metrics, funnel analysis, and ROI",
                "sections": [
                    {
                        "name": "conversion_overview",
                        "title": "Conversion Overview",
                        "type": "overview",
                        "metrics": ["total_conversions", "conversion_rate", "total_revenue", "avg_order_value"]
                    },
                    {
                        "name": "funnel_analysis",
                        "title": "Funnel Analysis",
                        "type": "funnel",
                        "metrics": ["funnel_steps", "dropoff_points", "optimization_opportunities"]
                    },
                    {
                        "name": "channel_performance",
                        "title": "Channel Performance",
                        "type": "comparison",
                        "metrics": ["channel_roi", "channel_conversion_rate", "cost_per_acquisition"]
                    },
                    {
                        "name": "attribution_analysis",
                        "title": "Attribution Analysis",
                        "type": "attribution",
                        "metrics": ["touchpoint_analysis", "attribution_model", "customer_journey"]
                    }
                ],
                "styling": {
                    "theme": "business",
                    "charts": True,
                    "tables": True
                }
            },
            "weekly_digest": {
                "template_type": "digest",
                "name": "Weekly Digest",
                "description": "Quick weekly overview of key metrics",
                "sections": [
                    {
                        "name": "weekly_summary",
                        "title": "This Week's Performance",
                        "type": "summary",
                        "metrics": ["weekly_sessions", "weekly_conversions", "weekly_revenue"]
                    },
                    {
                        "name": "week_over_week",
                        "title": "Week over Week Comparison",
                        "type": "comparison",
                        "metrics": ["session_growth", "conversion_growth", "revenue_growth"]
                    },
                    {
                        "name": "top_performers",
                        "title": "Top Performers",
                        "type": "highlights",
                        "metrics": ["top_pages", "top_keywords", "top_campaigns"]
                    }
                ],
                "styling": {
                    "theme": "minimal",
                    "charts": True,
                    "compact": True
                }
            }
        }

    async def generate_report(self, template_name: str, format_type: str = "html",
                             parameters: Optional[Dict[str, Any]] = None,
                             output_file: Optional[str] = None) -> str:
        """Generate a report from template"""
        try:
            # Get template
            template = await self._get_template(template_name)
            if not template:
                raise ValueError(f"Template '{template_name}' not found")

            # Generate unique report ID
            report_id = f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{template_name}"

            # Collect data for report
            data = await self._collect_report_data(template, parameters or {})

            # Generate report content
            if format_type == "html":
                content = await self._generate_html_report(template, data)
            elif format_type == "json":
                content = json.dumps(data, indent=2, default=str)
            elif format_type == "pdf":
                content = await self._generate_pdf_report(template, data)
            elif format_type == "csv":
                content = await self._generate_csv_report(template, data)
            else:
                raise ValueError(f"Unsupported format: {format_type}")

            # Save report
            if not output_file:
                output_file = self.reports_dir / f"{report_id}.{format_type}"

            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(content)

            # Save to database
            await self._save_report_metadata(
                report_id, template_name, format_type,
                str(output_file), parameters
            )

            logger.info(f"Report generated: {output_file}")
            return str(output_file)

        except Exception as e:
            logger.error(f"Failed to generate report: {e}")
            raise

    async def _get_template(self, template_name: str) -> Optional[ReportTemplate]:
        """Get report template by name"""
        try:
            conn = sqlite3.connect(self.reports_db)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT template_name, template_type, config
                FROM report_templates
                WHERE template_name = ?
            """, (template_name,))

            row = cursor.fetchone()
            conn.close()

            if row:
                config = json.loads(row[2])
                return ReportTemplate(row[0], row[1], config)

            return None

        except Exception as e:
            logger.error(f"Failed to get template: {e}")
            return None

    async def _collect_report_data(self, template: ReportTemplate,
                                 parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect data for report based on template sections"""
        data = {
            'template_name': template.name,
            'generated_at': datetime.now().isoformat(),
            'parameters': parameters,
            'period': parameters.get('period', 'Last 30 days'),
            'sections': {}
        }

        # Collect data for each section
        for section in template.sections:
            section_name = section['name']
            section_type = section['type']
            metrics = section.get('metrics', [])

            if section_type == "summary":
                data['sections'][section_name] = await self._collect_summary_data(metrics, parameters)
            elif section_type == "overview":
                data['sections'][section_name] = await self._collect_overview_data(metrics, parameters)
            elif section_type == "breakdown":
                data['sections'][section_name] = await self._collect_breakdown_data(metrics, parameters)
            elif section_type == "kpi":
                data['sections'][section_name] = await self._collect_kpi_data(metrics, parameters)
            elif section_type == "highlights":
                data['sections'][section_name] = await self._collect_highlights_data(metrics, parameters)
            elif section_type == "top_performers":
                data['sections'][section_name] = await self._collect_top_performers_data(metrics, parameters)
            elif section_type == "comparison":
                data['sections'][section_name] = await self._collect_comparison_data(metrics, parameters)
            elif section_type == "funnel":
                data['sections'][section_name] = await self._collect_funnel_data(metrics, parameters)
            elif section_type == "attribution":
                data['sections'][section_name] = await self._collect_attribution_data(metrics, parameters)
            elif section_type == "checklist":
                data['sections'][section_name] = await self._collect_checklist_data(metrics, parameters)
            elif section_type == "analysis":
                data['sections'][section_name] = await self._collect_analysis_data(metrics, parameters)

        return data

    async def _collect_summary_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect summary data for reports"""
        # Simulated data collection
        days = parameters.get('days', 30)

        return {
            'total_users': 12500 + (days * 50),
            'total_sessions': 45000 + (days * 200),
            'total_page_views': 180000 + (days * 800),
            'total_revenue': 15000.0 + (days * 250),
            'conversion_rate': 3.2 + (days * 0.1),
            'performance_score': 85 + (days * 0.5)
        }

    async def _collect_overview_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect overview data for reports"""
        days = parameters.get('days', 30)

        return {
            'sessions': 45000 + (days * 200),
            'users': 12500 + (days * 50),
            'page_views': 180000 + (days * 800),
            'bounce_rate': 45.2 - (days * 0.2),
            'avg_session_duration': 180 + (days * 2),
            'conversion_rate': 3.2 + (days * 0.1)
        }

    async def _collect_breakdown_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect breakdown data for reports"""
        # Simulated breakdown data
        return {
            'organic': {'sessions': 15000, 'users': 4200, 'conversions': 120},
            'direct': {'sessions': 12000, 'users': 3500, 'conversions': 150},
            'referral': {'sessions': 8000, 'users': 2400, 'conversions': 80},
            'social': {'sessions': 6000, 'users': 1800, 'conversions': 60},
            'paid': {'sessions': 4000, 'users': 600, 'conversions': 40}
        }

    async def _collect_kpi_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect KPI data for reports"""
        return {
            'traffic_growth': 15.2,
            'conversion_growth': 8.7,
            'revenue_growth': 22.1,
            'performance_score': 87.5,
            'user_satisfaction': 4.2
        }

    async def _collect_highlights_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect highlights data for reports"""
        return {
            'top_pages': [
                {'url': '/blog/wordpress-guide', 'views': 8500, 'conversions': 120},
                {'url': '/services/web-design', 'views': 6200, 'conversions': 85},
                {'url': '/portfolio', 'views': 5100, 'conversions': 45}
            ],
            'improvements': [
                {'metric': 'Page Speed', 'improvement': '+15%', 'status': 'positive'},
                {'metric': 'Mobile Traffic', 'improvement': '+8%', 'status': 'positive'},
                {'metric': 'Bounce Rate', 'improvement': '-5%', 'status': 'positive'}
            ]
        }

    async def _collect_top_performers_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect top performers data for reports"""
        return {
            'top_pages': [
                {'page': '/home', 'views': 15000, 'conversions': 200},
                {'page': '/blog', 'views': 12000, 'conversions': 180},
                {'page': '/services', 'views': 8500, 'conversions': 120}
            ],
            'top_keywords': [
                {'keyword': 'wordpress development', 'position': 3, 'impressions': 1200},
                {'keyword': 'web design', 'position': 5, 'impressions': 900},
                {'keyword': 'seo services', 'position': 8, 'impressions': 600}
            ]
        }

    async def _collect_comparison_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect comparison data for reports"""
        return {
            'this_period': {'sessions': 45000, 'conversions': 450, 'revenue': 15000},
            'previous_period': {'sessions': 38000, 'conversions': 380, 'revenue': 12000},
            'growth': {'sessions': '+18.4%', 'conversions': '+18.4%', 'revenue': '+25.0%'}
        }

    async def _collect_funnel_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect funnel data for reports"""
        return {
            'steps': [
                {'name': 'Landing Page', 'users': 10000, 'dropoff_rate': 20.0},
                {'name': 'Product Page', 'users': 8000, 'dropoff_rate': 25.0},
                {'name': 'Checkout', 'users': 6000, 'dropoff_rate': 40.0},
                {'name': 'Purchase', 'users': 450, 'dropoff_rate': 0.0}
            ],
            'conversion_rate': 4.5,
            'total_revenue': 15000
        }

    async def _collect_attribution_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect attribution data for reports"""
        return {
            'first_touch': {'organic': 150, 'paid': 80, 'social': 120},
            'last_touch': {'organic': 120, 'paid': 150, 'social': 80},
            'linear': {'organic': 135, 'paid': 115, 'social': 100}
        }

    async def _collect_checklist_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect checklist data for reports"""
        return {
            'page_speed': {'score': 85, 'status': 'good'},
            'mobile_friendly': {'score': 95, 'status': 'excellent'},
            'https_status': {'score': 100, 'status': 'excellent'},
            'crawl_errors': {'score': 98, 'status': 'good'},
            'sitemap_status': {'score': 100, 'status': 'excellent'}
        }

    async def _collect_analysis_data(self, metrics: List[str], parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Collect analysis data for reports"""
        return {
            'backlink_profile': {
                'total_backlinks': 1250,
                'domain_authority': 45,
                'new_links': 15,
                'lost_links': 3
            },
            'competitor_analysis': {
                'competitors_tracked': 5,
                'avg_competitor_position': 12.5,
                'opportunity_keywords': 25
            }
        }

    async def _generate_html_report(self, template: ReportTemplate, data: Dict[str, Any]) -> str:
        """Generate HTML report"""
        html_template = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        .header {{
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }}
        .header h1 {{
            color: #2c3e50;
            margin-bottom: 10px;
        }}
        .header .meta {{
            color: #7f8c8d;
            font-size: 14px;
        }}
        .section {{
            margin-bottom: 40px;
        }}
        .section h2 {{
            color: #34495e;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }}
        .metric {{
            display: inline-block;
            margin: 10px 20px 10px 0;
            padding: 15px 20px;
            background-color: #ecf0f1;
            border-radius: 5px;
            text-align: center;
        }}
        .metric-label {{
            font-size: 12px;
            color: #7f8c8d;
            text-transform: uppercase;
        }}
        .metric-value {{
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
        }}
        .table {{
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }}
        .table th, .table td {{
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }}
        .table th {{
            background-color: #f8f9fa;
            font-weight: bold;
        }}
        .positive {{ color: #27ae60; }}
        .negative {{ color: #e74c3c; }}
        .chart {{
            margin: 20px 0;
            text-align: center;
        }}
        .funnel {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 20px 0;
        }}
        .funnel-step {{
            text-align: center;
            flex: 1;
            padding: 15px;
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            border-radius: 5px;
            position: relative;
        }}
        .funnel-step::after {{
            content: '→';
            position: absolute;
            right: -15px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 18px;
        }}
        .funnel-step:last-child::after {{
            display: none;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{title}</h1>
            <div class="meta">
                Generated on {generated_at} | Period: {period}
            </div>
        </div>
        {content}
    </div>
</body>
</html>
        """

        # Generate content sections
        content_sections = ""
        for section_name, section_data in data.get('sections', {}).items():
            content_sections += f"""
            <div class="section">
                <h2>{section_data.get('title', section_name.title())}</h2>
                {self._format_section_html(section_data)}
            </div>
            """

        return html_template.format(
            title=data.get('template_name', 'Analytics Report'),
            generated_at=data.get('generated_at', ''),
            period=data.get('period', ''),
            content=content_sections
        )

    def _format_section_html(self, section_data: Dict[str, Any]) -> str:
        """Format section data as HTML"""
        html = ""

        if 'total_users' in section_data:
            html += f"""
            <div class="metric">
                <div class="metric-label">Total Users</div>
                <div class="metric-value">{section_data['total_users']:,}</div>
            </div>
            """

        if 'sessions' in section_data:
            html += f"""
            <div class="metric">
                <div class="metric-label">Sessions</div>
                <div class="metric-value">{section_data['sessions']:,}</div>
            </div>
            """

        if 'page_views' in section_data:
            html += f"""
            <div class="metric">
                <div class="metric-label">Page Views</div>
                <div class="metric-value">{section_data['page_views']:,}</div>
            </div>
            """

        if 'bounce_rate' in section_data:
            html += f"""
            <div class="metric">
                <div class="metric-label">Bounce Rate</div>
                <div class="metric-value">{section_data['bounce_rate']:.1f}%</div>
            </div>
            """

        if 'conversion_rate' in section_data:
            html += f"""
            <div class="metric">
                <div class="metric-label">Conversion Rate</div>
                <div class="metric-value">{section_data['conversion_rate']:.1f}%</div>
            </div>
            """

        if 'total_revenue' in section_data:
            html += f"""
            <div class="metric">
                <div class="metric-label">Total Revenue</div>
                <div class="metric-value">${section_data['total_revenue']:,.2f}</div>
            </div>
            """

        # Handle breakdown data
        if isinstance(section_data, dict) and any(isinstance(v, dict) and 'sessions' in str(v) for v in section_data.values()):
            html += '<table class="table"><thead><tr><th>Source</th><th>Sessions</th><th>Users</th><th>Conversions</th></tr></thead><tbody>'
            for key, value in section_data.items():
                if isinstance(value, dict) and 'sessions' in value:
                    html += f'<tr><td>{key.title()}</td><td>{value.get("sessions", 0):,}</td><td>{value.get("users", 0):,}</td><td>{value.get("conversions", 0):,}</td></tr>'
            html += '</tbody></table>'

        # Handle funnel data
        if 'steps' in section_data:
            html += '<div class="funnel">'
            for step in section_data['steps']:
                html += f'<div class="funnel-step"><div>{step["name"]}</div><div>{step["users"]:,}</div></div>'
            html += '</div>'

        # Handle top pages
        if 'top_pages' in section_data:
            html += '<table class="table"><thead><tr><th>Page</th><th>Views</th><th>Conversions</th></tr></thead><tbody>'
            for page in section_data['top_pages'][:5]:
                html += f'<tr><td>{page.get("page", "")}</td><td>{page.get("views", 0):,}</td><td>{page.get("conversions", 0):,}</td></tr>'
            html += '</tbody></table>'

        return html

    async def _generate_json_report(self, template: ReportTemplate, data: Dict[str, Any]) -> str:
        """Generate JSON report"""
        # Just return the data as JSON (already formatted)
        return json.dumps(data, indent=2, default=str)

    async def _generate_pdf_report(self, template: ReportTemplate, data: Dict[str, Any]) -> str:
        """Generate PDF report (simplified - would use PDF library)"""
        # For now, generate HTML and note that PDF conversion would require additional setup
        html_content = await self._generate_html_report(template, data)
        return f"# PDF Report\n\nNote: PDF generation requires additional setup.\n\nHTML content:\n\n{html_content}"

    async def _generate_csv_report(self, template: ReportTemplate, data: Dict[str, Any]) -> str:
        """Generate CSV report"""
        csv_lines = ["Report Section,Metric,Value"]

        for section_name, section_data in data.get('sections', {}).items():
            if isinstance(section_data, dict):
                if 'total_users' in section_data:
                    csv_lines.append(f"{section_name},Total Users,{section_data['total_users']}")
                if 'sessions' in section_data:
                    csv_lines.append(f"{section_name},Sessions,{section_data['sessions']}")
                if 'page_views' in section_data:
                    csv_lines.append(f"{section_name},Page Views,{section_data['page_views']}")
                if 'bounce_rate' in section_data:
                    csv_lines.append(f"{section_name},Bounce Rate,{section_data['bounce_rate']:.2f}")
                if 'conversion_rate' in section_data:
                    csv_lines.append(f"{section_name},Conversion Rate,{section_data['conversion_rate']:.2f}")
                if 'total_revenue' in section_data:
                    csv_lines.append(f"{section_name},Total Revenue,{section_data['total_revenue']:.2f}")

        return "\n".join(csv_lines)

    async def _save_report_metadata(self, report_id: str, template_name: str,
                                    format_type: str, file_path: str,
                                    parameters: Dict[str, Any]):
        """Save report metadata to database"""
        try:
            conn = sqlite3.connect(self.reports_db)
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO generated_reports (
                    report_id, template_name, report_type, title, description,
                    generated_at, generated_by, format_type, file_path,
                    parameters, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                report_id,
                template_name,
                template_name,
                f"{template_name} Report",
                f"Generated report using {template_name} template",
                datetime.now().isoformat(),
                "cli_user",
                format_type,
                str(file_path),
                json.dumps(parameters),
                'completed'
            ))

            conn.commit()
            conn.close()

        except Exception as e:
            logger.error(f"Failed to save report metadata: {e}")

    async def get_report_history(self, days: int = 30) -> List[Dict[str, Any]]:
        """Get report generation history"""
        try:
            conn = sqlite3.connect(self.reports_db)
            cursor = conn.cursor()

            cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()

            cursor.execute("""
                SELECT report_id, template_name, report_type, title, generated_at,
                       format_type, file_path, status
                FROM generated_reports
                WHERE generated_at >= ?
                ORDER BY generated_at DESC
            """, (cutoff_date,))

            reports = []
            for row in cursor.fetchall():
                reports.append({
                    'report_id': row[0],
                    'template_name': row[1],
                    'report_type': row[2],
                    'title': row[3],
                    'generated_at': row[4],
                    'format_type': row[5],
                    'file_path': row[6],
                    'status': row[7]
                })

            conn.close()
            return reports

        except Exception as e:
            logger.error(f"Failed to get report history: {e}")
            return []

    async def schedule_report(self, template_name: str, schedule_name: str,
                             cron_expression: str, recipients: List[str],
                             parameters: Optional[Dict[str, Any]] = None):
        """Schedule automated report generation"""
        try:
            conn = sqlite3.connect(self.reports_db)
            cursor = conn.cursor()

            # Calculate next run time (simplified)
            next_run = datetime.now() + timedelta(hours=24)  # Simplified for demo

            cursor.execute("""
                INSERT OR REPLACE INTO report_schedules (
                    schedule_name, template_name, cron_expression, recipients,
                    parameters, next_run, active
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                schedule_name,
                template_name,
                cron_expression,
                json.dumps(recipients),
                json.dumps(parameters or {}),
                next_run.isoformat(),
                1
            ))

            conn.commit()
            conn.close()

            logger.info(f"Report scheduled: {schedule_name} using template {template_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to schedule report: {e}")
            return False

    async def get_scheduled_reports(self) -> List[Dict[str, Any]]:
        """Get list of scheduled reports"""
        try:
            conn = sqlite3.connect(self.reports_db)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT schedule_name, template_name, cron_expression, recipients,
                       next_run, last_run, active
                FROM report_schedules
                WHERE active = 1
                ORDER BY next_run ASC
            """)

            schedules = []
            for row in cursor.fetchall():
                schedules.append({
                    'schedule_name': row[0],
                    'template_name': row[1],
                    'cron_expression': row[2],
                    'recipients': json.loads(row[3]),
                    'next_run': row[4],
                    'last_run': row[5],
                    'active': bool(row[6])
                })

            conn.close()
            return schedules

        except Exception as e:
            logger.error(f"Failed to get scheduled reports: {e}")
            return []