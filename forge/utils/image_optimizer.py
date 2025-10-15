"""
Image Optimization Utility

Handles WordPress image optimization, compression, format conversion,
lazy loading implementation, and automated image optimization workflows.
"""

import asyncio
import json
import logging
import os
import re
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from dataclasses import field
import hashlib
import mimetypes

logger = logging.getLogger(__name__)


@dataclass
class ImageMetrics:
    """Image performance metrics"""
    file_size: int = 0
    original_size: int = 0
    width: int = 0
    height: int = 0
    format: str = ""
    optimized_format: str = ""
    compression_ratio: float = 0.0
    bytes_saved: int = 0
    webp_supported: bool = False
    avif_supported: bool = False
    has_alt_text: bool = False
    loading_attribute: str = "auto"
    file_hash: str = ""

    def get_compression_grade(self) -> str:
        """Get compression efficiency grade"""
        if self.compression_ratio >= 0.7:
            return "A"
        elif self.compression_ratio >= 0.5:
            return "B"
        elif self.compression_ratio >= 0.3:
            return "C"
        elif self.compression_ratio > 0:
            return "D"
        else:
            return "F"

    def get_optimization_score(self) -> float:
        """Calculate overall optimization score (0-100)"""
        score = 0

        # Compression efficiency (40%)
        compression_score = self.compression_ratio * 40

        # Modern format support (25%)
        format_score = 0
        if self.optimized_format in ['webp', 'avif']:
            format_score = 25
        elif self.webp_supported:
            format_score = 15
        elif self.avif_supported:
            format_score = 20

        # Lazy loading (20%)
        loading_score = 0
        if self.loading_attribute == 'lazy':
            loading_score = 20
        elif self.loading_attribute == 'eager':
            loading_score = 10

        # Alt text (15%)
        alt_score = 15 if self.has_alt_text else 0

        score = compression_score + format_score + loading_score + alt_score
        return min(100, max(0, score))


@dataclass
class ImageOptimizationResult:
    """Result of image optimization operation"""
    success: bool
    images_processed: int = 0
    total_original_size: int = 0
    total_optimized_size: int = 0
    total_bytes_saved: int = 0
    average_compression: float = 0.0
    formats_converted: Dict[str, int] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    optimization_time: float = 0.0

    def get_space_saved_mb(self) -> float:
        """Get space saved in MB"""
        return self.total_bytes_saved / (1024 * 1024)

    def get_compression_percentage(self) -> float:
        """Get average compression percentage"""
        if self.total_original_size == 0:
            return 0.0
        return (self.total_bytes_saved / self.total_original_size) * 100


@dataclass
class ImageBatchResult:
    """Result of batch image optimization"""
    total_images: int
    optimized_images: int
    skipped_images: int
    failed_images: int
    total_space_saved: int
    optimization_time: float
    detailed_results: List[ImageOptimizationResult] = field(default_factory=list)


class ImageOptimizer:
    """WordPress image optimization utility"""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.wp_content = self.project_path / "web" / "wp" / "content"
        self.uploads_dir = self.wp_content / "uploads"
        self.cache_dir = self.project_path / ".forge" / "cache" / "images"

        # Ensure cache directory exists
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Initialize optimization database
        self.db_path = self.project_path / ".forge" / "images.db"
        self._init_database()

        # Optimization settings
        self.settings = self._load_settings()

        logger.info(f"Image optimizer initialized for {project_path}")

    def _init_database(self):
        """Initialize SQLite database for image metrics"""
        import sqlite3

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS image_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT UNIQUE,
                file_hash TEXT,
                file_size INTEGER,
                optimized_size INTEGER,
                width INTEGER,
                height INTEGER,
                format TEXT,
                optimized_format TEXT,
                webp_path TEXT,
                avif_path TEXT,
                compression_ratio REAL,
                optimization_date TEXT,
                metrics_json TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS optimization_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id TEXT,
                image_count INTEGER,
                total_original_size INTEGER,
                total_optimized_size INTEGER,
                bytes_saved INTEGER,
                optimization_time REAL,
                settings_json TEXT,
                created_at TEXT
            )
        """)

        conn.commit()
        conn.close()

    def _load_settings(self) -> Dict[str, Any]:
        """Load image optimization settings"""
        settings = {
            'jpeg_quality': 85,
            'png_quality': 90,
            'webp_quality': 85,
            'avif_quality': 80,
            'max_width': 2560,
            'max_height': 1440,
            'create_webp': True,
            'create_avif': True,
            'preserve_original': True,
            'strip_metadata': True,
            'progressive_jpeg': True,
            'optimize_png': True,
            'lazy_load_threshold': 800,  # pixels
            'batch_size': 50,
            'max_file_size': 10 * 1024 * 1024,  # 10MB
        }

        # Load from config if exists
        config_file = self.project_path / ".forge" / "image_config.json"
        if config_file.exists():
            try:
                with open(config_file, 'r') as f:
                    user_settings = json.load(f)
                    settings.update(user_settings)
            except Exception as e:
                logger.warning(f"Failed to load image config: {e}")

        return settings

    async def analyze_images(self, detailed: bool = False) -> Dict[str, Any]:
        """Analyze all images in the uploads directory"""
        if not self.uploads_dir.exists():
            return {
                "total_images": 0,
                "total_size": 0,
                "unoptimized_count": 0,
                "optimization_potential": 0,
                "recommendations": ["No uploads directory found"]
            }

        images = []
        total_size = 0
        unoptimized_count = 0
        optimization_potential = 0

        # Find all image files
        for ext in ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.webp', '*.avif']:
            images.extend(self.uploads_dir.rglob(ext))

        for image_path in images:
            try:
                metrics = await self._analyze_image(image_path)
                if metrics:
                    total_size += metrics.file_size

                    if metrics.compression_ratio < 0.3:  # Less than 30% compression
                        unoptimized_count += 1
                        optimization_potential += int(metrics.file_size * 0.5)  # Estimate 50% savings
            except Exception as e:
                logger.warning(f"Failed to analyze {image_path}: {e}")

        # Generate recommendations
        recommendations = []
        if unoptimized_count > 0:
            recommendations.append(f"Optimize {unoptimized_count} images for potential {optimization_potential / (1024*1024):.1f}MB savings")

        if detailed and images:
            # Check for modern format support
            webp_images = sum(1 for img in images if img.suffix.lower() in ['.webp'])
            if webp_images < len(images) * 0.5:
                recommendations.append("Convert images to WebP format for better performance")

            # Check for lazy loading
            # This would require scanning WordPress content files
            recommendations.append("Implement lazy loading for images below the fold")

        return {
            "total_images": len(images),
            "total_size": total_size,
            "total_size_mb": total_size / (1024 * 1024),
            "unoptimized_count": unoptimized_count,
            "optimization_potential": optimization_potential,
            "optimization_potential_mb": optimization_potential / (1024 * 1024),
            "recommendations": recommendations,
            "last_analyzed": datetime.now().isoformat()
        }

    async def _analyze_image(self, image_path: Path) -> Optional[ImageMetrics]:
        """Analyze a single image file"""
        try:
            # Get file info
            stat = image_path.stat()
            file_hash = self._get_file_hash(image_path)

            # Get image dimensions using identify (ImageMagick)
            dimensions = await self._get_image_dimensions(image_path)
            if not dimensions:
                return None

            width, height = dimensions

            # Create metrics object
            metrics = ImageMetrics(
                file_size=stat.st_size,
                original_size=stat.st_size,
                width=width,
                height=height,
                format=image_path.suffix.lower().lstrip('.'),
                file_hash=file_hash
            )

            # Check if already optimized
            optimized_metrics = await self._get_optimized_metrics(image_path)
            if optimized_metrics:
                metrics.optimized_format = optimized_metrics.get('optimized_format', metrics.format)
                metrics.compression_ratio = optimized_metrics.get('compression_ratio', 0.0)
                metrics.bytes_saved = optimized_metrics.get('bytes_saved', 0)

            # Check for modern format support
            webp_path = image_path.with_suffix('.webp')
            avif_path = image_path.with_suffix('.avif')
            metrics.webp_supported = webp_path.exists()
            metrics.avif_supported = avif_path.exists()

            return metrics

        except Exception as e:
            logger.error(f"Failed to analyze image {image_path}: {e}")
            return None

    async def _get_image_dimensions(self, image_path: Path) -> Optional[Tuple[int, int]]:
        """Get image dimensions using ImageMagick identify"""
        try:
            cmd = ['identify', '-format', '%w %h', str(image_path)]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                parts = stdout.decode().strip().split()
                if len(parts) == 2:
                    return int(parts[0]), int(parts[1])

            return None

        except Exception as e:
            logger.warning(f"Failed to get dimensions for {image_path}: {e}")
            return None

    def _get_file_hash(self, file_path: Path) -> str:
        """Calculate MD5 hash of file"""
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()

    async def _get_optimized_metrics(self, image_path: Path) -> Optional[Dict[str, Any]]:
        """Get previously stored optimization metrics"""
        import sqlite3

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute("""
                SELECT compression_ratio, optimized_format, bytes_saved
                FROM image_metrics
                WHERE file_path = ?
            """, (str(image_path),))

            result = cursor.fetchone()
            conn.close()

            if result:
                return {
                    'compression_ratio': result[0],
                    'optimized_format': result[1],
                    'bytes_saved': result[2]
                }

            return None

        except Exception as e:
            logger.warning(f"Failed to get optimized metrics: {e}")
            return None

    async def optimize_image(self, image_path: Path, force: bool = False) -> ImageOptimizationResult:
        """Optimize a single image"""
        result = ImageOptimizationResult(success=False)
        start_time = datetime.now()

        try:
            if not image_path.exists():
                result.errors.append(f"Image not found: {image_path}")
                return result

            # Check if already optimized
            if not force:
                optimized_metrics = await self._get_optimized_metrics(image_path)
                if optimized_metrics and optimized_metrics['compression_ratio'] > 0.3:
                    result.warnings.append(f"Image already optimized: {image_path.name}")
                    result.success = True
                    return result

            # Get original metrics
            original_size = image_path.stat().st_size
            original_metrics = await self._analyze_image(image_path)

            if not original_metrics:
                result.errors.append(f"Failed to analyze image: {image_path.name}")
                return result

            # Skip if file is too large
            if original_size > self.settings['max_file_size']:
                result.warnings.append(f"Image too large, skipping: {image_path.name}")
                result.success = True
                return result

            # Resize if necessary
            optimized_path = image_path
            if (original_metrics.width > self.settings['max_width'] or
                original_metrics.height > self.settings['max_height']):
                optimized_path = await self._resize_image(image_path)
                if not optimized_path:
                    result.errors.append(f"Failed to resize image: {image_path.name}")
                    return result

            # Compress image
            compressed_path = await self._compress_image(optimized_path)
            if not compressed_path:
                result.errors.append(f"Failed to compress image: {image_path.name}")
                return result

            # Create modern format versions
            webp_created = False
            avif_created = False

            if self.settings['create_webp']:
                webp_path = await self._convert_to_webp(compressed_path)
                webp_created = webp_path is not None

            if self.settings['create_avif']:
                avif_path = await self._convert_to_avif(compressed_path)
                avif_created = avif_path is not None

            # Calculate results
            optimized_size = compressed_path.stat().st_size
            bytes_saved = original_size - optimized_size
            compression_ratio = bytes_saved / original_size if original_size > 0 else 0

            # Update result
            result.success = True
            result.images_processed = 1
            result.total_original_size = original_size
            result.total_optimized_size = optimized_size
            result.total_bytes_saved = bytes_saved
            result.average_compression = compression_ratio

            if webp_created:
                result.formats_converted['webp'] = 1
            if avif_created:
                result.formats_converted['avif'] = 1

            # Save metrics to database
            await self._save_optimization_metrics(
                image_path,
                compressed_path,
                original_metrics,
                compression_ratio,
                bytes_saved
            )

            # Clean up if we created temporary files
            if optimized_path != image_path and self.settings['preserve_original']:
                # Keep original but replace with optimized
                if compressed_path != optimized_path:
                    compressed_path.replace(image_path)

            logger.info(f"Optimized image {image_path.name}: {bytes_saved} bytes saved ({compression_ratio:.1%})")

        except Exception as e:
            result.errors.append(f"Failed to optimize {image_path.name}: {str(e)}")
            logger.error(f"Image optimization failed: {e}")

        finally:
            result.optimization_time = (datetime.now() - start_time).total_seconds()

        return result

    async def _resize_image(self, image_path: Path) -> Optional[Path]:
        """Resize image if it exceeds maximum dimensions"""
        try:
            # Calculate new dimensions
            metrics = await self._analyze_image(image_path)
            if not metrics:
                return None

            width = metrics.width
            height = metrics.height
            max_width = self.settings['max_width']
            max_height = self.settings['max_height']

            if width <= max_width and height <= max_height:
                return image_path

            # Calculate scaling
            scale_w = max_width / width
            scale_h = max_height / height
            scale = min(scale_w, scale_h)

            new_width = int(width * scale)
            new_height = int(height * scale)

            # Create resized version
            resized_path = image_path.with_suffix(f'.resized{image_path.suffix}')

            cmd = [
                'convert', str(image_path),
                '-resize', f'{new_width}x{new_height}',
                '-quality', str(self.settings.get('jpeg_quality', 85)),
                str(resized_path)
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0 and resized_path.exists():
                return resized_path
            else:
                if resized_path.exists():
                    resized_path.unlink()
                return None

        except Exception as e:
            logger.error(f"Failed to resize image {image_path}: {e}")
            return None

    async def _compress_image(self, image_path: Path) -> Optional[Path]:
        """Compress image based on format"""
        try:
            format_type = image_path.suffix.lower().lstrip('.')

            if format_type in ['jpg', 'jpeg']:
                return await self._compress_jpeg(image_path)
            elif format_type == 'png':
                return await self._compress_png(image_path)
            else:
                # Return original for unsupported formats
                return image_path

        except Exception as e:
            logger.error(f"Failed to compress image {image_path}: {e}")
            return None

    async def _compress_jpeg(self, image_path: Path) -> Optional[Path]:
        """Compress JPEG image"""
        try:
            compressed_path = image_path.with_suffix(f'.compressed{image_path.suffix}')

            cmd = [
                'convert', str(image_path),
                '-quality', str(self.settings['jpeg_quality']),
                '-strip',
                '-interlace', 'Plane' if self.settings['progressive_jpeg'] else 'None',
                str(compressed_path)
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0 and compressed_path.exists():
                # Check if compression actually helped
                original_size = image_path.stat().st_size
                compressed_size = compressed_path.stat().st_size

                if compressed_size < original_size:
                    return compressed_path
                else:
                    compressed_path.unlink()
                    return image_path
            else:
                if compressed_path.exists():
                    compressed_path.unlink()
                return None

        except Exception as e:
            logger.error(f"Failed to compress JPEG {image_path}: {e}")
            return None

    async def _compress_png(self, image_path: Path) -> Optional[Path]:
        """Compress PNG image"""
        try:
            compressed_path = image_path.with_suffix(f'.compressed{image_path.suffix}')

            if self.settings['optimize_png']:
                # Use pngcrush if available
                cmd = [
                    'pngcrush', '-brute', '-reduce',
                    str(image_path), str(compressed_path)
                ]

                try:
                    process = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )

                    stdout, stderr = await process.communicate()

                    if process.returncode == 0 and compressed_path.exists():
                        return compressed_path
                except FileNotFoundError:
                    # pngcrush not available, fallback to ImageMagick
                    pass

            # Fallback to ImageMagick
            cmd = [
                'convert', str(image_path),
                '-quality', str(self.settings['png_quality']),
                '-strip',
                str(compressed_path)
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0 and compressed_path.exists():
                # Check if compression actually helped
                original_size = image_path.stat().st_size
                compressed_size = compressed_path.stat().st_size

                if compressed_size < original_size:
                    return compressed_path
                else:
                    compressed_path.unlink()
                    return image_path
            else:
                if compressed_path.exists():
                    compressed_path.unlink()
                return None

        except Exception as e:
            logger.error(f"Failed to compress PNG {image_path}: {e}")
            return None

    async def _convert_to_webp(self, image_path: Path) -> Optional[Path]:
        """Convert image to WebP format"""
        try:
            webp_path = image_path.with_suffix('.webp')

            cmd = [
                'convert', str(image_path),
                '-quality', str(self.settings['webp_quality']),
                '-define', 'webp:method=6',
                str(webp_path)
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0 and webp_path.exists():
                return webp_path
            else:
                if webp_path.exists():
                    webp_path.unlink()
                return None

        except Exception as e:
            logger.error(f"Failed to convert to WebP {image_path}: {e}")
            return None

    async def _convert_to_avif(self, image_path: Path) -> Optional[Path]:
        """Convert image to AVIF format"""
        try:
            avif_path = image_path.with_suffix('.avif')

            cmd = [
                'convert', str(image_path),
                '-quality', str(self.settings['avif_quality']),
                '-define', 'heic:compression=lossless',
                str(avif_path)
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0 and avif_path.exists():
                return avif_path
            else:
                if avif_path.exists():
                    avif_path.unlink()
                return None

        except Exception as e:
            logger.error(f"Failed to convert to AVIF {image_path}: {e}")
            return None

    async def _save_optimization_metrics(self, original_path: Path, optimized_path: Path,
                                        original_metrics: ImageMetrics, compression_ratio: float,
                                        bytes_saved: int):
        """Save optimization metrics to database"""
        import sqlite3

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            webp_path = original_path.with_suffix('.webp')
            avif_path = original_path.with_suffix('.avif')

            cursor.execute("""
                INSERT OR REPLACE INTO image_metrics (
                    file_path, file_hash, file_size, optimized_size, width, height,
                    format, optimized_format, webp_path, avif_path, compression_ratio,
                    optimization_date, metrics_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(original_path),
                original_metrics.file_hash,
                original_metrics.file_size,
                optimized_path.stat().st_size,
                original_metrics.width,
                original_metrics.height,
                original_metrics.format,
                optimized_path.suffix.lower().lstrip('.'),
                str(webp_path) if webp_path.exists() else None,
                str(avif_path) if avif_path.exists() else None,
                compression_ratio,
                datetime.now().isoformat(),
                json.dumps(asdict(original_metrics))
            ))

            conn.commit()
            conn.close()

        except Exception as e:
            logger.error(f"Failed to save optimization metrics: {e}")

    async def optimize_batch(self, directory: Optional[Path] = None,
                           force: bool = False) -> ImageBatchResult:
        """Optimize multiple images in batch"""
        if directory is None:
            directory = self.uploads_dir

        start_time = datetime.now()

        # Find all images
        images = []
        for ext in ['*.jpg', '*.jpeg', '*.png', '*.gif']:
            images.extend(directory.rglob(ext))

        # Filter by file size
        images = [img for img in images if img.stat().st_size <= self.settings['max_file_size']]

        batch_result = ImageBatchResult(
            total_images=len(images),
            optimized_images=0,
            skipped_images=0,
            failed_images=0,
            total_space_saved=0,
            optimization_time=0.0
        )

        # Process in batches
        batch_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        for i in range(0, len(images), self.settings['batch_size']):
            batch = images[i:i + self.settings['batch_size']]

            # Process batch concurrently
            tasks = []
            for image_path in batch:
                task = self.optimize_image(image_path, force=force)
                tasks.append(task)

            results = await asyncio.gather(*tasks, return_exceptions=True)

            for result in results:
                if isinstance(result, Exception):
                    batch_result.failed_images += 1
                elif isinstance(result, ImageOptimizationResult):
                    if result.success:
                        batch_result.optimized_images += 1
                        batch_result.total_space_saved += result.total_bytes_saved
                    else:
                        if result.warnings:
                            batch_result.skipped_images += 1
                        else:
                            batch_result.failed_images += 1

                    batch_result.detailed_results.append(result)

        batch_result.optimization_time = (datetime.now() - start_time).total_seconds()

        # Save batch summary
        await self._save_batch_summary(batch_id, batch_result)

        return batch_result

    async def _save_batch_summary(self, batch_id: str, result: ImageBatchResult):
        """Save batch optimization summary to database"""
        import sqlite3

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO optimization_history (
                    batch_id, image_count, total_original_size, total_optimized_size,
                    bytes_saved, optimization_time, settings_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                batch_id,
                result.total_images,
                sum(r.total_original_size for r in result.detailed_results),
                sum(r.total_optimized_size for r in result.detailed_results),
                result.total_space_saved,
                result.optimization_time,
                json.dumps(self.settings),
                datetime.now().isoformat()
            ))

            conn.commit()
            conn.close()

        except Exception as e:
            logger.error(f"Failed to save batch summary: {e}")

    async def get_optimization_history(self, days: int = 30) -> List[Dict[str, Any]]:
        """Get optimization history"""
        import sqlite3

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()

            cursor.execute("""
                SELECT batch_id, image_count, bytes_saved, optimization_time, created_at
                FROM optimization_history
                WHERE created_at >= ?
                ORDER BY created_at DESC
            """, (cutoff_date,))

            results = []
            for row in cursor.fetchall():
                results.append({
                    'batch_id': row[0],
                    'image_count': row[1],
                    'bytes_saved': row[2],
                    'optimization_time': row[3],
                    'created_at': row[4],
                    'space_saved_mb': row[2] / (1024 * 1024)
                })

            conn.close()
            return results

        except Exception as e:
            logger.error(f"Failed to get optimization history: {e}")
            return []

    async def cleanup_unused_images(self, days: int = 30) -> Dict[str, Any]:
        """Clean up unused image files"""
        try:
            cutoff_date = datetime.now() - timedelta(days=days)
            deleted_count = 0
            space_freed = 0

            # Find unused images (simplified approach)
            for ext in ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.webp', '*.avif']:
                for image_path in self.uploads_dir.rglob(ext):
                    stat = image_path.stat()
                    if stat.st_mtime < cutoff_date.timestamp():
                        # This is a simplified check - in reality, you'd want to
                        # check if the image is referenced in any posts or pages
                        try:
                            size = image_path.stat().st_size
                            image_path.unlink()
                            deleted_count += 1
                            space_freed += size
                        except Exception as e:
                            logger.warning(f"Failed to delete {image_path}: {e}")

            return {
                'deleted_count': deleted_count,
                'space_freed': space_freed,
                'space_freed_mb': space_freed / (1024 * 1024),
                'cutoff_days': days
            }

        except Exception as e:
            logger.error(f"Failed to cleanup unused images: {e}")
            return {'error': str(e)}

    async def generate_optimization_report(self, format: str = "text") -> str:
        """Generate image optimization report"""
        analysis = await self.analyze_images(detailed=True)
        history = await self.get_optimization_history(days=30)

        if format == "json":
            return json.dumps({
                'analysis': analysis,
                'history': history,
                'generated_at': datetime.now().isoformat()
            }, indent=2)

        else:  # text format
            report = []
            report.append("Image Optimization Report")
            report.append("=" * 40)
            report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            report.append("")

            # Analysis section
            report.append("Current State:")
            report.append(f"  Total Images: {analysis['total_images']}")
            report.append(f"  Total Size: {analysis['total_size_mb']:.1f} MB")
            report.append(f"  Unoptimized Images: {analysis['unoptimized_count']}")
            report.append(f"  Potential Savings: {analysis['optimization_potential_mb']:.1f} MB")
            report.append("")

            # Recommendations
            if analysis['recommendations']:
                report.append("Recommendations:")
                for rec in analysis['recommendations']:
                    report.append(f"  • {rec}")
                report.append("")

            # Recent history
            if history:
                report.append("Recent Optimizations (Last 30 Days):")
                for item in history[:5]:  # Show last 5 batches
                    report.append(f"  {item['created_at'][:10]}: {item['image_count']} images, "
                                f"{item['space_saved_mb']:.1f} MB saved")
                report.append("")

            # Settings
            report.append("Current Settings:")
            report.append(f"  JPEG Quality: {self.settings['jpeg_quality']}")
            report.append(f"  PNG Quality: {self.settings['png_quality']}")
            report.append(f"  WebP Quality: {self.settings['webp_quality']}")
            report.append(f"  Create WebP: {self.settings['create_webp']}")
            report.append(f"  Create AVIF: {self.settings['create_avif']}")
            report.append(f"  Max Dimensions: {self.settings['max_width']}x{self.settings['max_height']}")

            return "\n".join(report)