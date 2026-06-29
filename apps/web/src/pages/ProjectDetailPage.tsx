import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Globe,
  Package,
  Shield,
  User2,
  Pencil,
  ExternalLink,
  History,
  Puzzle,
  RefreshCw,
  Undo2,
  Wrench,
  GitCompare,
  Palette,
  Cpu,
  FileCog,
  ListChecks,
  Archive,
  RotateCcw,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnvironmentsTab } from "./project-detail/EnvironmentsTab";
import { BackupsTab } from "./project-detail/BackupsTab";
import { PluginsTab } from "./project-detail/PluginsTab";
import { SyncTab } from "./project-detail/SyncTab";
import { RestoreTab } from "./project-detail/RestoreTab";
import { ToolsTab } from "./project-detail/ToolsTab";
import { DriftTab } from "./project-detail/DriftTab";
import { ThemesTab } from "./project-detail/ThemesTab";
import { WpCoreTab } from "./project-detail/WpCoreTab";
import { RemoteOpsTab } from "./project-detail/RemoteOpsTab";
import { SecurityTab } from "./project-detail/SecurityTab";
import { ProjectFormDialog } from "./ProjectsPage";
import { ResourceActivityFeed } from "@/components/ResourceActivityFeed";
import { ArchiveDialog, RestoreDialog } from "@/components/ProjectArchiveDialogs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWebSocketEvent, useSubscribeEnvironment } from "@/lib/websocket";
import { toast } from "@/hooks/use-toast";
import { ExecutionLogPanel } from "@/components/ui/execution-log-panel";


interface Server {
  id: number;
  name: string;
  ip_address: string;
  status: string;
}

interface Environment {
  id: number;
  type: string;
  url?: string;
  root_path?: string;
  backup_path?: string;
  google_drive_folder_id: string | null;
  server: Server;
}

interface Project {
  id: number;
  name: string;
  status: "active" | "inactive" | "archived";
  client: { id: number; name: string };
  hosting_package: { id: number; name: string; price_monthly: number } | null;
  support_package: { id: number; name: string; price_monthly: number } | null;
  environments: Environment[];
  created_at: string;
}

function ProjectHeader({
  project,
  onEdit,
  onArchive,
  onRestore,
}: {
  project: Project;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const navigate = useNavigate();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge
            variant="success"
            className="font-semibold shadow-sm text-xs px-2.5 py-1 capitalize"
          >
            Active
          </Badge>
        );
      case "inactive":
        return (
          <Badge
            variant="warning"
            className="font-semibold shadow-sm text-xs px-2.5 py-1 capitalize"
          >
            Inactive
          </Badge>
        );
      default:
        return (
          <Badge
            variant="secondary"
            className="font-semibold shadow-sm text-xs px-2.5 py-1 capitalize"
          >
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-1 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => navigate("/projects")}
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        All Projects
      </Button>

      <div className="flex flex-wrap items-start gap-4 justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/75 bg-clip-text text-transparent">
              {project.name}
            </h1>
            {getStatusBadge(project.status)}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm mt-2">
            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-muted/80 text-muted-foreground">
              <User2 className="h-3 w-3" />
            </div>
            <span className="font-medium">{project.client.name}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="shadow-sm hover:bg-accent/50 transition-colors"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit Project Details
          </Button>

          {project.status === "archived" ? (
            <Button
              variant="default"
              size="sm"
              className="shadow-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0 transition-all duration-200 hover:shadow-md"
              onClick={onRestore}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Restore Archive
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="shadow-sm text-destructive hover:text-destructive border-destructive/20 hover:border-destructive/40 hover:bg-destructive/5 transition-colors"
              onClick={onArchive}
            >
              <Archive className="h-4 w-4 mr-1.5" />
              Archive Project
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2">
        {project.hosting_package && (
          <div className="flex items-center gap-3.5 rounded-xl border bg-card/45 hover:bg-card/85 transition-all duration-200 shadow-sm p-4 backdrop-blur-sm group">
            <div className="p-2.5 rounded-xl bg-info/10 text-info border border-info/20 group-hover:scale-105 transition-transform duration-200">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                Hosting Package
              </p>
              <p className="text-sm font-semibold tracking-tight mt-0.5">
                {project.hosting_package.name}
              </p>
              <p className="text-xs text-muted-foreground/80 mt-0.5">
                ${project.hosting_package.price_monthly}/mo
              </p>
            </div>
          </div>
        )}
        {project.support_package && (
          <div className="flex items-center gap-3.5 rounded-xl border bg-card/45 hover:bg-card/85 transition-all duration-200 shadow-sm p-4 backdrop-blur-sm group">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900 group-hover:scale-105 transition-transform duration-200">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                Support Package
              </p>
              <p className="text-sm font-semibold tracking-tight mt-0.5">
                {project.support_package.name}
              </p>
              <p className="text-xs text-muted-foreground/80 mt-0.5">
                ${project.support_package.price_monthly}/mo
              </p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3.5 rounded-xl border bg-card/45 hover:bg-card/85 transition-all duration-200 shadow-sm p-4 backdrop-blur-sm group">
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400 border border-purple-100 dark:border-purple-900 group-hover:scale-105 transition-transform duration-200">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              Environments
            </p>
            <p className="text-sm font-semibold tracking-tight mt-0.5">
              {project.environments.length}{" "}
              {project.environments.length === 1
                ? "Environment"
                : "Environments"}
            </p>
            <p className="text-xs text-muted-foreground/80 mt-0.5 truncate max-w-[200px]">
              {project.environments.map((e) => e.type).join(", ") ||
                "None configured"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-4 border-b pb-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-10 w-80" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
        <Skeleton className="h-[76px] rounded-xl" />
        <Skeleton className="h-[76px] rounded-xl" />
        <Skeleton className="h-[76px] rounded-xl" />
      </div>
    </div>
  );
}

export function ProjectDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const [activeJobExecutionId, setActiveJobExecutionId] = useState<number | null>(null);
  const [activeBullJobId, setActiveBullJobId] = useState<string | null>(null);
  const [activeJobType, setActiveJobType] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobStep, setJobStep] = useState<string | null>(null);

  const archiveMutation = useMutation({
    mutationFn: (options: { createBackup: boolean; deleteFromCyberpanel: boolean }) =>
      api.post<{ projectId: number; jobExecutionId: number; jobId: string }>(
        `/projects/${projectId}/archive`,
        options,
      ),
    onSuccess: (result) => {
      setArchiveOpen(false);
      if (result) {
        setActiveJobExecutionId(result.jobExecutionId);
        setActiveBullJobId(result.jobId);
        setActiveJobType("project:archive");
        setJobProgress(0);
        setJobStatus("active");
        setJobStep("Queueing archival task...");
        toast({
          title: "Archival process initiated",
          description: "Project status changed to archived and deprovisioning task started.",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Archival failed to start",
        description: err.response?.data?.message || err.message || "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (environmentBackups: Record<string, number>) =>
      api.post<{ projectId: number; jobExecutionId: number; jobId: string }>(
        `/projects/${projectId}/restore-archive`,
        { environmentBackups },
      ),
    onSuccess: (result) => {
      setRestoreOpen(false);
      if (result) {
        setActiveJobExecutionId(result.jobExecutionId);
        setActiveBullJobId(result.jobId);
        setActiveJobType("project:restore");
        setJobProgress(0);
        setJobStatus("active");
        setJobStep("Queueing restoration task...");
        toast({
          title: "Restoration process initiated",
          description: "Project status changed to active and reprovisioning task started.",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Restoration failed to start",
        description: err.response?.data?.message || err.message || "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  useWebSocketEvent("job:progress", (raw: unknown) => {
    const event = raw as {
      queueName: string;
      jobId: string;
      progress: number;
      step?: string;
    };
    if (event.queueName === "projects" && event.jobId === activeBullJobId) {
      setJobProgress(event.progress);
      if (event.step) setJobStep(event.step);
    }
  });

  useWebSocketEvent("job:completed", (raw: unknown) => {
    const event = raw as {
      queueName: string;
      jobId: string;
    };
    if (event.queueName === "projects" && event.jobId === activeBullJobId) {
      setJobProgress(100);
      setJobStatus("completed");
      setJobStep("Task completed successfully.");
      toast({ title: "Project action succeeded" });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setTimeout(() => {
        setActiveJobExecutionId(null);
        setActiveBullJobId(null);
        setJobProgress(null);
        setJobStep(null);
        setJobStatus(null);
      }, 4000);
    }
  });

  useWebSocketEvent("job:failed", (raw: unknown) => {
    const event = raw as {
      queueName: string;
      jobId: string;
      error?: string;
    };
    if (event.queueName === "projects" && event.jobId === activeBullJobId) {
      setJobStatus("failed");
      setJobProgress(null);
      setJobStep(event.error || "An error occurred during execution.");
      toast({
        title: "Project action failed",
        description: event.error ?? "An unexpected error occurred",
        variant: "destructive",
      });
    }
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "environments";
  const [activatedTabs, setActivatedTabs] = useState<Set<string>>(
    new Set([currentTab]),
  );

  useEffect(() => {
    setActivatedTabs((prev) => {
      if (prev.has(currentTab)) return prev;
      const next = new Set(prev);
      next.add(currentTab);
      return next;
    });
  }, [currentTab]);

  const {
    data: project,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["project", projectId],
    enabled: !!projectId,
    queryFn: () => api.get<Project>(`/projects/${projectId}`),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: () =>
      api
        .get<{ items: { id: number; name: string }[] }>("/clients?limit=100")
        .then((r) => r.items),
  });

  const { data: hostingPkgs = [] } = useQuery({
    queryKey: ["packages-hosting"],
    queryFn: () =>
      api.get<{ id: number; name: string; price_monthly: number }[]>(
        "/packages/hosting",
      ),
  });

  const { data: supportPkgs = [] } = useQuery({
    queryKey: ["packages-support"],
    queryFn: () =>
      api.get<{ id: number; name: string; price_monthly: number }[]>(
        "/packages/support",
      ),
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
        <HeaderSkeleton />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="container mx-auto py-16 px-4 text-center text-muted-foreground">
        <p className="text-lg font-medium">Project not found</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Go Back
        </Button>
      </div>
    );
  }

  const environments = project.environments ?? [];

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      <ProjectHeader
        project={project}
        onEdit={() => setEditOpen(true)}
        onArchive={() => setArchiveOpen(true)}
        onRestore={() => setRestoreOpen(true)}
      />

      {activeJobExecutionId && (
        <div className="border rounded-xl p-5 space-y-3 bg-card shadow-sm backdrop-blur-sm border-primary/20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 text-sm font-semibold">
              {jobStatus === "failed" ? (
                <XCircle className="h-5 w-5 text-destructive animate-pulse" />
              ) : jobStatus === "completed" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 animate-bounce" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
              <span className="capitalize">
                {activeJobType === "project:archive" ? "Archiving Project" : "Restoring Project"}
              </span>
            </div>
            {jobStatus === "failed" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setActiveJobExecutionId(null);
                  setActiveBullJobId(null);
                  setJobProgress(null);
                  setJobStep(null);
                  setJobStatus(null);
                }}
              >
                Dismiss
              </Button>
            )}
          </div>

          <div className="space-y-1">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  jobStatus === "failed"
                    ? "bg-destructive"
                    : jobStatus === "completed"
                    ? "bg-green-500"
                    : "bg-primary"
                }`}
                style={{ width: `${jobProgress ?? 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span>{jobStep || "Initializing..."}</span>
              <span className="font-semibold">{jobProgress ?? 0}%</span>
            </div>
          </div>

          {activeJobExecutionId && (
            <div className="mt-4 border-t pt-4">
              <ExecutionLogPanel
                jobExecutionId={activeJobExecutionId}
                isActive={jobStatus !== "completed" && jobStatus !== "failed"}
              />
            </div>
          )}
        </div>
      )}

      <Tabs
        value={currentTab}
        className="space-y-6"
        onValueChange={(v) => {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("tab", v);
            return next;
          });
        }}
      >
        <TabsList className="flex-wrap h-auto gap-1 bg-muted/60 p-1 border border-border/40 rounded-xl shadow-sm backdrop-blur-sm">
          <TabsTrigger
            value="environments"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Globe className="h-3.5 w-3.5 opacity-70" />
            Environments
            {environments.length > 0 && (
              <span className="ml-1 text-xs opacity-60 bg-muted px-1.5 py-0.5 rounded-full font-semibold border border-border/30">
                {environments.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="backups"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <History className="h-3.5 w-3.5 opacity-70" />
            Backups
          </TabsTrigger>
          <TabsTrigger
            value="plugins"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Puzzle className="h-3.5 w-3.5 opacity-70" />
            Plugins
          </TabsTrigger>
          <TabsTrigger
            value="sync"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <RefreshCw className="h-3.5 w-3.5 opacity-70" />
            Sync
          </TabsTrigger>
          <TabsTrigger
            value="restore"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Undo2 className="h-3.5 w-3.5 opacity-70" />
            Restore
          </TabsTrigger>
          <TabsTrigger
            value="tools"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Wrench className="h-3.5 w-3.5 opacity-70" />
            Tools
          </TabsTrigger>
          <TabsTrigger
            value="drift"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <GitCompare className="h-3.5 w-3.5 opacity-70" />
            Drift
          </TabsTrigger>
          <TabsTrigger
            value="themes"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Palette className="h-3.5 w-3.5 opacity-70" />
            Themes
          </TabsTrigger>
          <TabsTrigger
            value="files-config"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <FileCog className="h-3.5 w-3.5 opacity-70" />
            Files & Config
          </TabsTrigger>
          <TabsTrigger
            value="wp-core"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Cpu className="h-3.5 w-3.5 opacity-70" />
            WP Core
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Shield className="h-3.5 w-3.5 opacity-70" />
            Security
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <ListChecks className="h-3.5 w-3.5 opacity-70" />
            Activity
          </TabsTrigger>
        </TabsList>


        <TabsContent value="environments">
          {activatedTabs.has("environments") && (
            <EnvironmentsTab projectId={projectId} />
          )}
        </TabsContent>

        <TabsContent value="backups">
          {activatedTabs.has("backups") && (
            <BackupsTab projectId={projectId} environments={environments} />
          )}
        </TabsContent>

        <TabsContent value="plugins">
          {activatedTabs.has("plugins") && (
            <PluginsTab projectId={projectId} environments={environments} />
          )}
        </TabsContent>

        <TabsContent value="sync">
          {activatedTabs.has("sync") && (
            <SyncTab projectId={projectId} environments={environments} />
          )}
        </TabsContent>

        <TabsContent value="restore">
          {activatedTabs.has("restore") && (
            <RestoreTab projectId={projectId} environments={environments} />
          )}
        </TabsContent>

        <TabsContent value="tools">
          {activatedTabs.has("tools") && (
            <ToolsTab environments={environments} />
          )}
        </TabsContent>

        <TabsContent value="drift">
          {activatedTabs.has("drift") && (
            <DriftTab projectId={projectId} environments={environments} />
          )}
        </TabsContent>

        <TabsContent value="themes">
          {activatedTabs.has("themes") && (
            <ThemesTab projectId={projectId} environments={environments} />
          )}
        </TabsContent>

        <TabsContent value="wp-core">
          {activatedTabs.has("wp-core") && (
            <WpCoreTab environments={environments} />
          )}
        </TabsContent>

        <TabsContent value="files-config">
          {activatedTabs.has("files-config") && (
            <RemoteOpsTab
              projectId={projectId}
              projectName={project.name}
              environments={environments}
            />
          )}
        </TabsContent>

        <TabsContent value="security">
          {activatedTabs.has("security") && (
            <SecurityTab projectId={projectId} environments={environments} />
          )}
        </TabsContent>

        <TabsContent value="activity">
          <div className="border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Project Activity Log</h3>
            <ResourceActivityFeed resourceType="project" resourceId={projectId} />
          </div>
        </TabsContent>
      </Tabs>


      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={
          project as unknown as Parameters<
            typeof ProjectFormDialog
          >[0]["initial"]
        }
        clients={clients}
        hostingPackages={hostingPkgs}
        supportPackages={supportPkgs}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["project", projectId] });
          qc.invalidateQueries({ queryKey: ["projects"] });
          setEditOpen(false);
        }}
      />

      <ArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        projectName={project.name}
        onConfirm={(options) => archiveMutation.mutate(options)}
        isPending={archiveMutation.isPending}
      />

      <RestoreDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        environments={environments}
        onConfirm={(selections) => restoreMutation.mutate(selections)}
        isPending={restoreMutation.isPending}
      />
    </div>
  );
}


