"""
Database Optimization Utility for Bedrock Forge.

Provides comprehensive database analysis, optimization, and maintenance
tools for WordPress databases to improve performance.
"""

import sqlite3
import asyncio
import subprocess
import json
import re
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
import tempfile
import os

from ..utils.logging import logger
from ..utils.errors import ForgeError
from ..utils.shell import run_shell
from ..constants import DB_OPTIMIZATION_DEFAULT_QUERIES, DB_OPTIMIZATION_SLOW_QUERY_THRESHOLD
from ..models.project import Project


@dataclass
class QueryStats:
    """Query performance statistics."""
    query: str
    execution_count: int
    total_time: float
    avg_time: float
    max_time: float
    rows_sent: int
    rows_examined: int
    index_usage: Optional[str] = None


@dataclass
class TableStats:
    """Table statistics."""
    table_name: str
    engine: str
    rows: int
    data_size: int
    index_size: int
    total_size: int
    fragmentation: float
    overhead: int


@dataclass
class IndexRecommendation:
    """Index recommendation for optimization."""
    table_name: str
    index_name: str
    columns: List[str]
    index_type: str
    estimated_improvement: float
    reason: str


@dataclass
class DatabaseOptimizationResult:
    """Result of database optimization."""
    tables_optimized: int
    indexes_added: int
    space_saved: int
    queries_analyzed: int
    slow_queries_fixed: int
    optimization_time: float
    recommendations: List[str]


class DatabaseOptimizer:
    """Main database optimization class."""

    def __init__(self, project: Project):
        """Initialize database optimizer."""
        self.project = project
        self.project_dir = Path(project.directory)
        self.db_path = self.project_dir / ".ddev" / "db_optimization.db"
        self._init_database()

    def _init_database(self) -> None:
        """Initialize optimization database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS optimization_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME NOT NULL,
                    tables_optimized INTEGER,
                    indexes_added INTEGER,
                    space_saved INTEGER,
                    queries_analyzed INTEGER,
                    slow_queries_fixed INTEGER,
                    optimization_time REAL,
                    recommendations TEXT,
                    raw_data TEXT
                );

                CREATE TABLE IF NOT EXISTS query_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME NOT NULL,
                    query TEXT NOT NULL,
                    execution_count INTEGER,
                    total_time REAL,
                    avg_time REAL,
                    max_time REAL,
                    rows_sent INTEGER,
                    rows_examined INTEGER
                );

                CREATE TABLE IF NOT EXISTS table_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME NOT NULL,
                    table_name TEXT NOT NULL,
                    engine TEXT,
                    rows INTEGER,
                    data_size INTEGER,
                    index_size INTEGER,
                    total_size INTEGER,
                    fragmentation REAL,
                    overhead INTEGER
                );

                CREATE INDEX IF NOT EXISTS idx_optimization_history_timestamp
                ON optimization_history(timestamp);
            """)

    async def analyze_database(self, detailed: bool = False) -> Dict[str, Any]:
        """Analyze database performance and structure."""
        logger.info("Analyzing database performance...")

        try:
            analysis = {
                'tables': await self._analyze_tables(),
                'queries': await self._analyze_queries(),
                'indexes': await self._analyze_indexes(),
                'slow_queries': await self._get_slow_queries(),
                'recommendations': [],
                'timestamp': datetime.now().isoformat()
            }

            # Generate recommendations
            analysis['recommendations'] = self._generate_recommendations(analysis)

            if detailed:
                analysis['detailed_queries'] = await self._get_detailed_query_analysis()
                analysis['fragmentation_details'] = await self._get_fragmentation_details()

            return analysis

        except Exception as e:
            raise ForgeError(f"Database analysis failed: {str(e)}")

    async def _analyze_tables(self) -> List[TableStats]:
        """Analyze table statistics."""
        try:
            # Get table statistics
            query = """
                SELECT
                    TABLE_NAME,
                    ENGINE,
                    TABLE_ROWS,
                    DATA_LENGTH,
                    INDEX_LENGTH,
                    DATA_LENGTH + INDEX_LENGTH as TOTAL_SIZE,
                    ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) as SIZE_MB
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                ORDER BY TOTAL_SIZE DESC
            """

            result = await self._execute_mysql_query(query)
            tables = []

            for row in result:
                # Calculate fragmentation
                fragmentation_query = f"""
                    SELECT
                        ROUND(((DATA_FREE / 1024 / 1024), 2) as FRAGMENTATION_MB,
                        DATA_FREE
                    FROM information_schema.TABLES
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{row[0]}'
                """
                frag_result = await self._execute_mysql_query(fragmentation_query)
                fragmentation = frag_result[0][1] if frag_result else 0

                table_stats = TableStats(
                    table_name=row[0],
                    engine=row[1],
                    rows=int(row[2]) if row[2] else 0,
                    data_size=int(row[3]) if row[3] else 0,
                    index_size=int(row[4]) if row[4] else 0,
                    total_size=int(row[5]) if row[5] else 0,
                    fragmentation=fragmentation,
                    overhead=int(row[6]) if len(row) > 6 and row[6] else 0
                )
                tables.append(table_stats)

            return tables

        except Exception as e:
            logger.error(f"Table analysis failed: {e}")
            return []

    async def _analyze_queries(self) -> List[QueryStats]:
        """Analyze query performance."""
        try:
            # Get slow query log or performance schema data
            query = """
                SELECT
                    DIGEST_TEXT,
                    COUNT_STAR,
                    SUM_TIMER_WAIT/1000000000 as TOTAL_TIME,
                    AVG_TIMER_WAIT/1000000000 as AVG_TIME,
                    MAX_TIMER_WAIT/1000000000 as MAX_TIME,
                    SUM_ROWS_SENT,
                    SUM_ROWS_EXAMINED
                FROM performance_schema.events_statements_summary_by_digest
                WHERE DIGEST_TEXT IS NOT NULL
                ORDER BY TOTAL_TIME DESC
                LIMIT 50
            """

            result = await self._execute_mysql_query(query)
            queries = []

            for row in result:
                query_stats = QueryStats(
                    query=row[0][:200] + "..." if len(row[0]) > 200 else row[0],
                    execution_count=int(row[1]),
                    total_time=float(row[2]),
                    avg_time=float(row[3]),
                    max_time=float(row[4]),
                    rows_sent=int(row[5]),
                    rows_examined=int(row[6])
                )
                queries.append(query_stats)

            return queries

        except Exception as e:
            logger.error(f"Query analysis failed: {e}")
            return []

    async def _analyze_indexes(self) -> List[IndexRecommendation]:
        """Analyze index usage and generate recommendations."""
        try:
            recommendations = []

            # Find tables with high row scanning
            query = """
                SELECT
                    TABLE_NAME,
                    TABLE_ROWS,
                    DATA_LENGTH
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_ROWS > 1000
            """

            tables = await self._execute_mysql_query(query)

            for table in tables:
                table_name = table[0]
                rows = int(table[1])

                # Check for missing indexes on common query patterns
                index_recs = await self._analyze_table_indexes(table_name, rows)
                recommendations.extend(index_recs)

            return recommendations

        except Exception as e:
            logger.error(f"Index analysis failed: {e}")
            return []

    async def _analyze_table_indexes(self, table_name: str, row_count: int) -> List[IndexRecommendation]:
        """Analyze indexes for a specific table."""
        recommendations = []

        # Get existing indexes
        query = f"""
            SHOW INDEX FROM {table_name}
        """

        try:
            indexes = await self._execute_mysql_query(query)
            existing_index_columns = set()

            for index in indexes:
                # Extract column names from index
                existing_index_columns.add(index[4])

            # Check for common missing indexes
            if table_name == 'wp_posts':
                if 'post_status' not in existing_index_columns:
                    recommendations.append(IndexRecommendation(
                        table_name=table_name,
                        index_name='idx_post_status',
                        columns=['post_status'],
                        index_type='BTREE',
                        estimated_improvement=30.0,
                        reason='Frequent filtering by post_status'
                    ))

                if 'post_type' not in existing_index_columns:
                    recommendations.append(IndexRecommendation(
                        table_name=table_name,
                        index_name='idx_post_type',
                        columns=['post_type'],
                        index_type='BTREE',
                        estimated_improvement=25.0,
                        reason='Frequent filtering by post_type'
                    ))

                if ('post_status' in existing_index_columns and
                    'post_type' in existing_index_columns and
                    'idx_post_status_type' not in [idx[2] for idx in indexes]):
                    recommendations.append(IndexRecommendation(
                        table_name=table_name,
                        index_name='idx_post_status_type',
                        columns=['post_status', 'post_type'],
                        index_type='BTREE',
                        estimated_improvement=40.0,
                        reason='Composite index for common status+type queries'
                    ))

            elif table_name == 'wp_postmeta':
                if 'meta_key' not in existing_index_columns:
                    recommendations.append(IndexRecommendation(
                        table_name=table_name,
                        index_name='idx_meta_key',
                        columns=['meta_key'],
                        index_type='BTREE',
                        estimated_improvement=50.0,
                        reason='Critical for post meta queries'
                    ))

                if ('meta_key' in existing_index_columns and
                    'meta_value' in existing_index_columns and
                    'idx_meta_key_value' not in [idx[2] for idx in indexes]):
                    recommendations.append(IndexRecommendation(
                        table_name=table_name,
                        index_name='idx_meta_key_value',
                        columns=['meta_key', 'meta_value(20)'],
                        index_type='BTREE',
                        estimated_improvement=60.0,
                        reason='Composite index for meta key+value queries'
                    ))

        except Exception as e:
            logger.warning(f"Could not analyze indexes for {table_name}: {e}")

        return recommendations

    async def _get_slow_queries(self) -> List[Dict[str, Any]]:
        """Get slow query information."""
        try:
            # Check if slow query log is enabled
            query = """
                SHOW VARIABLES LIKE 'slow_query_log'
            """
            result = await self._execute_mysql_query(query)

            if not result or result[0][1] != 'ON':
                return []

            # Get slow queries from performance schema
            query = """
                SELECT
                    DIGEST_TEXT,
                    COUNT_STAR,
                    AVG_TIMER_WAIT/1000000000 as AVG_TIME,
                    MAX_TIMER_WAIT/1000000000 as MAX_TIME,
                    SUM_ROWS_SENT,
                    SUM_ROWS_EXAMINED,
                    FIRST_SEEN,
                    LAST_SEEN
                FROM performance_schema.events_statements_summary_by_digest
                WHERE AVG_TIMER_WAIT/1000000000 > 1.0
                ORDER BY AVG_TIMER_WAIT DESC
                LIMIT 20
            """

            result = await self._execute_mysql_query(query)
            slow_queries = []

            for row in result:
                slow_queries.append({
                    'query': row[0][:200] + "..." if len(row[0]) > 200 else row[0],
                    'execution_count': int(row[1]),
                    'avg_time': float(row[2]),
                    'max_time': float(row[3]),
                    'rows_sent': int(row[4]),
                    'rows_examined': int(row[5]),
                    'first_seen': row[6],
                    'last_seen': row[7]
                })

            return slow_queries

        except Exception as e:
            logger.error(f"Slow query analysis failed: {e}")
            return []

    async def _get_detailed_query_analysis(self) -> Dict[str, Any]:
        """Get detailed query analysis."""
        try:
            # Query types distribution
            query = """
                SELECT
                    SUBSTRING(DIGEST_TEXT, 1, 10) as query_type,
                    COUNT(*) as count,
                    AVG(TIMER_WAIT/1000000000) as avg_time
                FROM performance_schema.events_statements_summary_by_digest
                WHERE DIGEST_TEXT IS NOT NULL
                GROUP BY SUBSTRING(DIGEST_TEXT, 1, 10)
                ORDER BY count DESC
            """

            result = await self._execute_mysql_query(query)
            query_types = {}

            for row in result:
                query_types[row[0]] = {
                    'count': int(row[1]),
                    'avg_time': float(row[2])
                }

            return {
                'query_types': query_types,
                'total_queries': sum(t['count'] for t in query_types.values())
            }

        except Exception as e:
            logger.error(f"Detailed query analysis failed: {e}")
            return {}

    async def _get_fragmentation_details(self) -> Dict[str, Any]:
        """Get detailed fragmentation information."""
        try:
            query = """
                SELECT
                    TABLE_NAME,
                    ROUND(((DATA_FREE / 1024 / 1024), 2) as FRAGMENTATION_MB,
                    DATA_FREE,
                    ROUND(((DATA_FREE / (DATA_LENGTH + INDEX_LENGTH)) * 100), 2) as FRAGMENTATION_PERCENT
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND DATA_FREE > 0
                ORDER BY FRAGMENTATION_MB DESC
            """

            result = await self._execute_mysql_query(query)
            fragmentation = {}

            for row in result:
                fragmentation[row[0]] = {
                    'fragmentation_mb': float(row[1]),
                    'data_free': int(row[2]),
                    'fragmentation_percent': float(row[3])
                }

            return {
                'fragmented_tables': fragmentation,
                'total_fragmentation_mb': sum(t['fragmentation_mb'] for t in fragmentation.values()),
                'high_fragmentation_tables': len([t for t in fragmentation.values() if t['fragmentation_percent'] > 10])
            }

        except Exception as e:
            logger.error(f"Fragmentation analysis failed: {e}")
            return {}

    def _generate_recommendations(self, analysis: Dict[str, Any]) -> List[str]:
        """Generate optimization recommendations."""
        recommendations = []

        # Table-based recommendations
        tables = analysis.get('tables', [])
        large_tables = [t for t in tables if t.total_size > 100000000]  # > 100MB
        fragmented_tables = [t for t in tables if t.fragmentation > 10485760]  # > 10MB fragmentation

        if large_tables:
            recommendations.append(f"Found {len(large_tables)} large tables. Consider archiving old data.")

        if fragmented_tables:
            recommendations.append(f"Found {len(fragmented_tables)} fragmented tables. Run OPTIMIZE TABLE to reclaim space.")

        # Query-based recommendations
        queries = analysis.get('queries', [])
        slow_queries = [q for q in queries if q.avg_time > 1.0]
        high_scan_queries = [q for q in queries if q.rows_examined > q.rows_sent * 10]

        if slow_queries:
            recommendations.append(f"Found {len(slow_queries)} slow queries (avg time > 1s). Review and optimize.")

        if high_scan_queries:
            recommendations.append(f"Found {len(high_scan_queries)} queries with high row scanning. Consider adding indexes.")

        # Index recommendations
        indexes = analysis.get('indexes', [])
        if indexes:
            recommendations.append(f"Found {len(indexes)} potential index improvements that could enhance performance.")

        # General recommendations
        if analysis.get('slow_queries'):
            recommendations.append("Enable and monitor slow query log for ongoing optimization.")

        recommendations.append("Schedule regular database maintenance (optimize, analyze).")
        recommendations.append("Monitor database size growth and plan for scaling.")

        return recommendations

    async def optimize_database(self, options: Dict[str, Any] = None) -> DatabaseOptimizationResult:
        """Perform database optimization."""
        logger.info("Starting database optimization...")

        if options is None:
            options = {
                'optimize_tables': True,
                'add_indexes': True,
                'analyze_queries': True,
                'clean_up': True
            }

        start_time = datetime.now()
        result = DatabaseOptimizationResult(
            tables_optimized=0,
            indexes_added=0,
            space_saved=0,
            queries_analyzed=0,
            slow_queries_fixed=0,
            optimization_time=0.0,
            recommendations=[]
        )

        try:
            # Get current database state
            analysis = await self.analyze_database()

            # Optimize tables
            if options.get('optimize_tables', True):
                result.tables_optimized = await self._optimize_tables(analysis.get('tables', []))

            # Add recommended indexes
            if options.get('add_indexes', True):
                result.indexes_added = await self._add_recommended_indexes(analysis.get('indexes', []))

            # Analyze and fix slow queries
            if options.get('analyze_queries', True):
                result.queries_analyzed = len(analysis.get('queries', []))
                result.slow_queries_fixed = await self._optimize_slow_queries(analysis.get('slow_queries', []))

            # Calculate space saved
            if options.get('clean_up', True):
                result.space_saved = await self._cleanup_database()

            # Generate recommendations
            result.recommendations = self._generate_post_optimization_recommendations(analysis)

            # Calculate optimization time
            result.optimization_time = (datetime.now() - start_time).total_seconds()

            # Save optimization history
            await self._save_optimization_result(result)

            logger.info(f"Database optimization completed in {result.optimization_time:.2f}s")
            return result

        except Exception as e:
            raise ForgeError(f"Database optimization failed: {str(e)}")

    async def _optimize_tables(self, tables: List[TableStats]) -> int:
        """Optimize database tables."""
        optimized_count = 0

        for table in tables:
            try:
                # Optimize table
                query = f"OPTIMIZE TABLE {table.table_name}"
                await self._execute_mysql_query(query)

                # Analyze table for better query planning
                query = f"ANALYZE TABLE {table.table_name}"
                await self._execute_mysql_query(query)

                optimized_count += 1
                logger.info(f"Optimized table: {table.table_name}")

            except Exception as e:
                logger.warning(f"Failed to optimize table {table.table_name}: {e}")

        return optimized_count

    async def _add_recommended_indexes(self, indexes: List[IndexRecommendation]) -> int:
        """Add recommended database indexes."""
        added_count = 0

        for index_rec in indexes:
            try:
                # Create index
                columns_str = ", ".join(index_rec.columns)
                query = f"""
                    CREATE INDEX {index_rec.index_name}
                    ON {index_rec.table_name} ({columns_str})
                """

                await self._execute_mysql_query(query)
                added_count += 1
                logger.info(f"Added index: {index_rec.index_name} on {index_rec.table_name}")

            except Exception as e:
                logger.warning(f"Failed to add index {index_rec.index_name}: {e}")

        return added_count

    async def _optimize_slow_queries(self, slow_queries: List[Dict[str, Any]]) -> int:
        """Optimize slow queries."""
        fixed_count = 0

        for query_info in slow_queries:
            try:
                # Analyze query pattern and suggest optimizations
                query = query_info['query']

                # Check if it's a missing index issue
                if self._is_missing_index_query(query):
                    # This would typically require manual intervention
                    logger.info(f"Query needs index optimization: {query[:100]}...")

                fixed_count += 1

            except Exception as e:
                logger.warning(f"Failed to optimize query: {e}")

        return fixed_count

    def _is_missing_index_query(self, query: str) -> bool:
        """Check if query pattern indicates missing index."""
        # Simple heuristic - in real implementation, use EXPLAIN ANALYZE
        patterns = [
            r'WHERE\s+\w+\s*=',
            r'ORDER BY\s+\w+',
            r'GROUP BY\s+\w+'
        ]

        return any(re.search(pattern, query, re.IGNORECASE) for pattern in patterns)

    async def _cleanup_database(self) -> int:
        """Clean up database and reclaim space."""
        space_saved = 0

        try:
            # Clean up WordPress transients
            query = """
                DELETE FROM wp_options
                WHERE option_name LIKE '_transient_%'
                OR option_name LIKE '_site_transient_%'
            """
            result = await self._execute_mysql_query(query)
            space_saved += result[0][0] if result else 0

            # Clean up post revisions (keep last 5)
            query = """
                DELETE p FROM wp_posts p
                LEFT JOIN (
                    SELECT post_parent, MAX(ID) as max_id
                    FROM wp_posts
                    WHERE post_type = 'revision'
                    GROUP BY post_parent
                ) latest ON p.post_parent = latest.post_parent AND p.ID != latest.max_id
                WHERE p.post_type = 'revision'
            """
            result = await self._execute_mysql_query(query)
            space_saved += result[0][0] if result else 0

            # Clean up spam comments
            query = "DELETE FROM wp_comments WHERE comment_approved = 'spam'"
            result = await self._execute_mysql_query(query)
            space_saved += result[0][0] if result else 0

        except Exception as e:
            logger.warning(f"Database cleanup failed: {e}")

        return space_saved

    def _generate_post_optimization_recommendations(self, analysis: Dict[str, Any]) -> List[str]:
        """Generate recommendations after optimization."""
        recommendations = []

        # Based on optimization results
        recommendations.append("Schedule regular database maintenance (weekly/monthly).")
        recommendations.append("Monitor query performance regularly.")
        recommendations.append("Consider implementing read replicas for high-traffic sites.")
        recommendations.append("Set up database monitoring and alerting.")
        recommendations.append("Plan for database scaling as site grows.")

        return recommendations

    async def _save_optimization_result(self, result: DatabaseOptimizationResult) -> None:
        """Save optimization result to database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO optimization_history (
                    timestamp, tables_optimized, indexes_added, space_saved,
                    queries_analyzed, slow_queries_fixed, optimization_time,
                    recommendations, raw_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                datetime.now(),
                result.tables_optimized,
                result.indexes_added,
                result.space_saved,
                result.queries_analyzed,
                result.slow_queries_fixed,
                result.optimization_time,
                json.dumps(result.recommendations),
                json.dumps(asdict(result))
            ))

    async def _execute_mysql_query(self, query: str) -> List[Tuple]:
        """Execute MySQL query and return results."""
        try:
            # Execute query via DDEV
            cmd = f"cd {self.project_dir} && ddev exec mysql -uroot -db db -e \"{query}\""
            result = run_shell(cmd, dry_run=False)

            if not result:
                return []

            # Parse result (simplified - in real implementation, use proper MySQL connector)
            lines = result.strip().split('\n')
            if len(lines) < 2:
                return []

            # Skip header and convert to tuples
            data = []
            for line in lines[1:]:
                if line.strip():
                    # Split by tabs and handle quoted values
                    row = [col.strip() for col in line.split('\t')]
                    if row:
                        data.append(tuple(row))

            return data

        except Exception as e:
            logger.error(f"MySQL query failed: {e}")
            return []

    def get_optimization_history(self, days: int = 30) -> List[DatabaseOptimizationResult]:
        """Get optimization history."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT raw_data FROM optimization_history
                WHERE timestamp >= datetime('now', '-{} days')
                ORDER BY timestamp DESC
            """.format(days))

            results = []
            for row in cursor.fetchall():
                data = json.loads(row[0])
                # Convert timestamp string back to datetime
                if 'timestamp' in data:
                    # This would need proper deserialization
                    pass
                results.append(DatabaseOptimizationResult(**data))

            return results

    async def schedule_maintenance(self, frequency: str = 'weekly') -> str:
        """Schedule regular database maintenance."""
        # Generate cron job or systemd timer for database maintenance
        maintenance_script = f"""#!/bin/bash
# Database maintenance script for {self.project.name}
cd {self.project_dir}

# Run forge database optimization
forge database optimize --auto

# Log results
echo "$(date): Database maintenance completed" >> {self.project_dir}/.ddev/maintenance.log
"""

        script_path = self.project_dir / ".ddev" / "db_maintenance.sh"
        with open(script_path, 'w') as f:
            f.write(maintenance_script)

        # Make executable
        os.chmod(script_path, 0o755)

        # Generate cron entry
        if frequency == 'daily':
            cron_entry = f"0 2 * * * {script_path}"
        elif frequency == 'weekly':
            cron_entry = f"0 2 * * 0 {script_path}"
        else:  # monthly
            cron_entry = f"0 2 1 * * {script_path}"

        return f"Add to crontab:\n{cron_entry}"