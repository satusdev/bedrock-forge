export interface VulnerabilityInfo {
  fixed_in: string;
  cve: string;
  title: string;
}

export const KNOWN_VULNERABILITIES: Record<string, VulnerabilityInfo> = {
  "wp-file-manager": {
    fixed_in: "6.9",
    cve: "CVE-2020-25213",
    title: "Remote Code Execution (RCE)",
  },
  "contact-form-7": {
    fixed_in: "5.3.2",
    cve: "CVE-2020-35489",
    title: "Unrestricted File Upload",
  },
  elementor: {
    fixed_in: "3.6.0",
    cve: "CVE-2022-1329",
    title: "Remote Code Execution",
  },
};

export function isVulnerable(current: string, fixed: string): boolean {
  const c = current.split(".").map((v) => parseInt(v, 10) || 0);
  const f = fixed.split(".").map((v) => parseInt(v, 10) || 0);

  for (let i = 0; i < Math.max(c.length, f.length); i++) {
    const cv = c[i] || 0;
    const fv = f[i] || 0;
    if (cv < fv) return true;
    if (cv > fv) return false;
  }
  return false;
}

export function checkPluginVulnerability(
  slug: string,
  version: string,
): VulnerabilityInfo | null {
  const vuln = KNOWN_VULNERABILITIES[slug];
  if (vuln && isVulnerable(version, vuln.fixed_in)) {
    return vuln;
  }
  return null;
}
