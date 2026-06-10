import React from "react";
import { Monitor, Smartphone, Globe, Trash2, LogOut } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useSessionsQuery,
  useRevokeSessionMutation,
  useRevokeAllSessionsMutation,
} from "../hooks";
import type { ActiveSession } from "../api";

/** Parse a User-Agent string into a human-readable label. */
function parseUA(ua: string | null): string {
  if (!ua) return "Unknown browser";
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
    if (/Chrome/i.test(ua)) return "Chrome Mobile";
    if (/Safari/i.test(ua)) return "Mobile Safari";
    return "Mobile Browser";
  }
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  return "Browser";
}

function deviceIcon(ua: string | null) {
  if (!ua) return <Globe className="h-4 w-4 text-muted-foreground" />;
  if (/Mobile|Android|iPhone|iPad/i.test(ua))
    return <Smartphone className="h-4 w-4 text-muted-foreground" />;
  return <Monitor className="h-4 w-4 text-muted-foreground" />;
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

function SessionRow({
  session,
  isCurrent,
}: {
  session: ActiveSession;
  isCurrent: boolean;
}) {
  const revoke = useRevokeSessionMutation();

  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-b-0">
      <div className="flex-shrink-0">{deviceIcon(session.user_agent)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">
            {parseUA(session.user_agent)}
          </span>
          {isCurrent && (
            <Badge variant="secondary" className="text-xs">
              This session
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
          <span>{session.ip_address ?? "Unknown IP"}</span>
          <span>·</span>
          <span>Started {timeAgo(session.created_at)}</span>
          <span>·</span>
          <span>
            Expires{" "}
            {new Date(session.expires_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
      {!isCurrent && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => revoke.mutate(session.id)}
              disabled={revoke.isPending}
              aria-label="Revoke this session"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Revoke session</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function ActiveSessionsPanel() {
  const { data: sessions, isLoading } = useSessionsQuery();
  const revokeAll = useRevokeAllSessionsMutation();

  // The earliest session is typically the current one (just refreshed most recently)
  // We detect "current" as the most recently created session
  const currentSessionId = sessions?.length
    ? sessions.reduce((newest, s) =>
        new Date(s.created_at) > new Date(newest.created_at) ? s : newest,
      ).id
    : null;

  const otherSessions = sessions?.filter((s) => s.id !== currentSessionId) ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/40 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Monitor className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Active Sessions</CardTitle>
              <CardDescription>
                Devices currently signed in to your account.
              </CardDescription>
            </div>
          </div>
          {otherSessions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => revokeAll.mutate()}
              disabled={revokeAll.isPending}
            >
              <LogOut className="h-3.5 w-3.5" />
              Revoke all others
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 pb-2">
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Loading sessions…
          </div>
        ) : !sessions?.length ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No active sessions found.
          </div>
        ) : (
          <div>
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isCurrent={session.id === currentSessionId}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
