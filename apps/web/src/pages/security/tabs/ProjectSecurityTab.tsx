import React, { useState } from "react";
import {
  FolderKanban,
  RefreshCw,
  Lock,
  Clock,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OverviewData, EnvironmentSummary } from "../types";
import { ScoreRing, SummaryBadges } from "../components";
import { EnvironmentScanHistory } from "../scan-history";
import { HardenDialog, ScanDialog } from "../dialogs";
import { ProjectSchedulesTab } from "./ScheduleTabs";

export function ProjectSecurityTab({ data }: { data: OverviewData }) {
  const [scanDialog, setScanDialog] = useState<{
    open: boolean;
    envId: number;
    envName: string;
  } | null>(null);
  const [hardenDialog, setHardenDialog] = useState<{
    open: boolean;
    envId: number;
    envName: string;
    initialActions?: string[];
  } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showSchedules, setShowSchedules] = useState(false);

  const byProject = data.environments.reduce<
    Record<string, EnvironmentSummary[]>
  >((acc, env) => {
    const key = `${env.project.id}:${env.project.name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(env);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(byProject).map(([projectKey, envs]) => {
        const projectName = projectKey.split(":").slice(1).join(":");
        return (
          <Card key={projectKey}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                {projectName}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {envs.map((env) => {
                  const isExpanded = expandedId === env.id;
                  return (
                    <div key={env.id} className="px-4 py-3">
                      <div className="flex items-center gap-4">
                        <ScoreRing score={env.score} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {env.type}
                            </Badge>
                            <a
                              href={env.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted-foreground hover:underline truncate max-w-xs"
                            >
                              {env.url}
                            </a>
                          </div>
                          <SummaryBadges summary={env.findings_summary} />
                          {env.last_scanned_at && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Last scan:{" "}
                              {new Date(env.last_scanned_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {env.last_scanned_at && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : env.id)
                              }
                            >
                              {isExpanded ? "Hide" : "History"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setHardenDialog({
                                open: true,
                                envId: env.id,
                                envName: `${projectName} / ${env.type}`,
                              })
                            }
                          >
                            <Lock className="h-3.5 w-3.5 mr-1.5" />
                            Harden
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setScanDialog({
                                open: true,
                                envId: env.id,
                                envName: `${projectName} / ${env.type}`,
                              })
                            }
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                            Scan
                          </Button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 border-t pt-3">
                          <EnvironmentScanHistory
                            envId={env.id}
                            onFix={(actionId) =>
                              setHardenDialog({
                                open: true,
                                envId: env.id,
                                envName: `${projectName} / ${env.type}`,
                                initialActions: [actionId],
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {data.environments.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FolderKanban className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>No environments found.</p>
        </div>
      )}

      {scanDialog && (
        <ScanDialog
          open={scanDialog.open}
          onClose={() => setScanDialog(null)}
          targetType="environment"
          targetId={scanDialog.envId}
          targetName={scanDialog.envName}
        />
      )}
      {hardenDialog && (
        <HardenDialog
          open={hardenDialog.open}
          onClose={() => setHardenDialog(null)}
          targetType="environment"
          targetId={hardenDialog.envId}
          targetName={hardenDialog.envName}
          initialActions={hardenDialog.initialActions}
        />
      )}

      <div className="border rounded-lg bg-card">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          onClick={() => setShowSchedules((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Scan Schedules
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showSchedules ? "rotate-180" : ""}`}
          />
        </button>
        {showSchedules && (
          <div className="border-t px-4 py-4">
            <ProjectSchedulesTab data={data} />
          </div>
        )}
      </div>
    </div>
  );
}
