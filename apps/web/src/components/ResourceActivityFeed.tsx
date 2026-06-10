import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, User, Info } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";

interface AuditLogEntry {
  id: number;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user: { id: number; name: string; email: string } | null;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Maps an action string to a human-readable label and badge colour. */
function parseAction(action: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (action.endsWith(".create") || action.endsWith(".created")) return { label: action, variant: "default" };
  if (action.endsWith(".delete") || action.endsWith(".deleted")) return { label: action, variant: "destructive" };
  if (action.endsWith(".update") || action.endsWith(".updated")) return { label: action, variant: "secondary" };
  return { label: action, variant: "outline" };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ResourceActivityFeedProps {
  resourceType: string;
  resourceId: number;
  limit?: number;
  className?: string;
}

/**
 * Reusable activity feed component. Displays filtered audit log entries
 * for a specific resource (server, project, environment, client, etc.).
 */
export function ResourceActivityFeed({
  resourceType,
  resourceId,
  limit = 25,
  className,
}: ResourceActivityFeedProps) {
  const { data, isLoading } = useQuery<AuditLogResponse>({
    queryKey: ["audit-logs", resourceType, resourceId, limit],
    queryFn: () =>
      api.get(
        `/audit-logs?resource_type=${resourceType}&resource_id=${resourceId}&limit=${limit}`,
      ),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className={className}>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-muted/40 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const entries = data?.data ?? [];

  if (entries.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 text-center ${className ?? ""}`}>
        <Info className="h-8 w-8 text-muted-foreground mb-3 opacity-50" />
        <p className="font-medium text-sm">No activity recorded</p>
        <p className="text-xs text-muted-foreground mt-1">
          Actions taken on this resource will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-1">
        {entries.map((entry) => {
          const { label, variant } = parseAction(entry.action);
          return (
            <div
              key={entry.id}
              className="flex items-start gap-3 py-3 px-3 rounded-lg hover:bg-muted/30 transition-colors"
            >
              {/* Action badge */}
              <Badge variant={variant} className="shrink-0 font-mono text-xs mt-0.5">
                {label}
              </Badge>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  {entry.user && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {entry.user.name}
                    </span>
                  )}
                  {entry.ip_address && (
                    <span className="font-mono">{entry.ip_address}</span>
                  )}
                  <span className="flex items-center gap-1 ml-auto shrink-0">
                    <Clock className="h-3 w-3" />
                    {timeAgo(entry.created_at)}
                  </span>
                </div>
                {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate font-mono">
                    {JSON.stringify(entry.metadata).slice(0, 120)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data && data.total > limit && (
        <p className="text-xs text-center text-muted-foreground mt-4">
          Showing {limit} of {data.total} events · View all in{" "}
          <a href="/audit-logs" className="underline hover:text-primary">
            Audit Logs
          </a>
        </p>
      )}
    </div>
  );
}
