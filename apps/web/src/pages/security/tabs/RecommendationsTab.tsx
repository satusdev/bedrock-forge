import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  ServerIcon,
  FolderKanban,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type {
  OverviewData,
  ServerSummary,
  EnvironmentSummary,
  ScanHistory,
} from "../types";
import { ScoreRing, SummaryBadges, FindingItem } from "../components";

export function RecommendationsTab({ data }: { data: OverviewData }) {
  const atRiskServers = data.servers.filter(
    (s) => s.findings_summary.critical + s.findings_summary.high > 0,
  );
  const atRiskEnvs = data.environments.filter(
    (e) => e.findings_summary.critical + e.findings_summary.high > 0,
  );

  if (atRiskServers.length === 0 && atRiskEnvs.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30 text-green-500" />
        <p className="font-medium">No critical or high findings</p>
        <p className="text-sm mt-1">
          All scanned servers and projects are looking good.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {atRiskServers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <ServerIcon className="h-4 w-4 text-muted-foreground" />
            Servers
          </h3>
          <div className="space-y-2">
            {atRiskServers.map((s) => (
              <RecommendationServerCard key={s.id} server={s} />
            ))}
          </div>
        </div>
      )}
      {atRiskEnvs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
            Environments
          </h3>
          <div className="space-y-2">
            {atRiskEnvs.map((e) => (
              <RecommendationEnvCard key={e.id} env={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendationServerCard({ server }: { server: ServerSummary }) {
  const [expanded, setExpanded] = useState(false);

  const { data: history } = useQuery<ScanHistory>({
    queryKey: ["security", "server-history", server.id],
    queryFn: () => api.get(`/security/servers/${server.id}/scans?limit=5`),
    enabled: expanded,
  });

  const criticalAndHigh = (history?.data ?? []).flatMap((scan) =>
    (scan.findings ?? []).filter(
      (f) => f.severity === "critical" || f.severity === "high",
    ),
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <ScoreRing score={server.score} />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{server.name}</p>
            <SummaryBadges summary={server.findings_summary} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : "View findings"}
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
            )}
          </Button>
        </div>
        {expanded && (
          <div className="mt-3 border-t pt-3 space-y-1">
            {criticalAndHigh.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No critical/high findings in recent scans.
              </p>
            ) : (
              criticalAndHigh.map((f) => <FindingItem key={f.id} finding={f} />)
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationEnvCard({ env }: { env: EnvironmentSummary }) {
  const [expanded, setExpanded] = useState(false);

  const { data: history } = useQuery<ScanHistory>({
    queryKey: ["security", "env-history", env.id],
    queryFn: () => api.get(`/security/environments/${env.id}/scans?limit=5`),
    enabled: expanded,
  });

  const criticalAndHigh = (history?.data ?? []).flatMap((scan) =>
    (scan.findings ?? []).filter(
      (f) => f.severity === "critical" || f.severity === "high",
    ),
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <ScoreRing score={env.score} />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">
              {env.project.name}{" "}
              <Badge variant="outline" className="text-xs ml-1">
                {env.type}
              </Badge>
            </p>
            <SummaryBadges summary={env.findings_summary} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : "View findings"}
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
            )}
          </Button>
        </div>
        {expanded && (
          <div className="mt-3 border-t pt-3 space-y-1">
            {criticalAndHigh.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No critical/high findings in recent scans.
              </p>
            ) : (
              criticalAndHigh.map((f) => <FindingItem key={f.id} finding={f} />)
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
