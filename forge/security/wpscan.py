import subprocess
import json
import logging
from typing import Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

class WPScanParams:
    """Parameters for WPScan execution."""
    def __init__(
        self,
        url: str,
        token: Optional[str] = None,
        detection_mode: str = "mixed",
        plugins_detection: str = "passive",
        themes_detection: str = "passive",
        config_path: Optional[str] = None
    ):
        self.url = url
        self.token = token
        self.detection_mode = detection_mode
        self.plugins_detection = plugins_detection
        self.themes_detection = themes_detection
        self.config_path = config_path

class WPScanWrapper:
    """Wrapper for WPScan CLI tool."""
    
    def __init__(self, wpscan_path: str = "wpscan"):
        self.wpscan_path = wpscan_path

    def scan(self, params: WPScanParams) -> Dict[str, Any]:
        """
        Run a WPScan against a target URL.
        
        Args:
            params: WPScanParams object containing scan configuration
            
        Returns:
            Dict containing the scan results
        """
        cmd = [
            self.wpscan_path,
            "--url", params.url,
            "--format", "json",
            "--detection-mode", params.detection_mode,
            "--enumerate", f"p,t",  # Enumerate plugins and themes
            "--plugins-detection", params.plugins_detection,
            "--themes-detection", params.themes_detection,
            "--random-user-agent",
            "--disable-tls-checks"
        ]

        if params.token:
            cmd.extend(["--api-token", params.token])

        if params.config_path:
            cmd.extend(["--config-file", params.config_path])
            
        logger.info(f"Starting WPScan for {params.url}")
        
        try:
            # specific to user environment, wpscan might be a ruby gem or docker
            # Assuming it's installed as a gem or available in PATH for now
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=False  # WPScan returns non-zero on vulnerabilities found
            )
            
            if not result.stdout:
                logger.error(f"WPScan failed with no output. Stderr: {result.stderr}")
                return {"error": "WPScan produced no output", "details": result.stderr}

            try:
                data = json.loads(result.stdout)
                return data
            except json.JSONDecodeError:
                logger.error("Failed to parse WPScan JSON output")
                # Fallback: try to find JSON in output if mixed with other text
                return {"error": "Invalid JSON output", "raw_output": result.stdout}

        except FileNotFoundError:
            logger.error(f"WPScan executable not found at {self.wpscan_path}")
            return {"error": "WPScan executable not found"}
        except Exception as e:
            logger.exception("Unexpected error running WPScan")
            return {"error": str(e)}

    def check_installation(self) -> bool:
        """Check if WPScan is installed and accessible."""
        try:
            subprocess.run(
                [self.wpscan_path, "--version"],
                capture_output=True,
                check=True
            )
            return True
        except (FileNotFoundError, subprocess.CalledProcessError):
            return False
