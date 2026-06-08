import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Environment, ServerOption } from "../types";
import {
  envSchema,
  EnvForm,
  ENV_TYPES,
  EnvTypeValue,
  parseProtectedPostTypes,
} from "../utils";
import { ProtectedTablesPicker } from "./ProtectedTablesPicker";
import { environmentsApi } from "../api";

export function EnvironmentFormDialog({
  open,
  onOpenChange,
  projectId,
  initial,
  servers,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: number;
  initial?: Environment;
  servers: ServerOption[];
  onSuccess: () => void;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EnvForm>({
    resolver: zodResolver(envSchema),
    defaultValues: {
      type: (initial?.type as EnvTypeValue) ?? "production",
      server_id: initial?.server.id ?? undefined,
      url: initial?.url ?? "",
      root_path: initial?.root_path ?? "",
      backup_path: initial?.backup_path ?? "",
      google_drive_folder_id: initial?.google_drive_folder_id ?? "",
    },
  });

  const [protectedTables, setProtectedTables] = useState<string[]>(
    initial?.protected_tables ?? [],
  );

  const [sqlProtectionQueriesText, setSqlProtectionQueriesText] =
    useState<string>(initial?.sql_protection_queries?.join("\n") ?? "");

  const [protectedPostTypesText, setProtectedPostTypesText] = useState<string>(
    initial?.protected_post_types?.join(", ") ?? "",
  );

  async function onSubmit(data: EnvForm) {
    try {
      const payload: Record<string, unknown> = {
        type: data.type,
        server_id: data.server_id,
        url: data.url,
        backup_path: data.backup_path || null,
        google_drive_folder_id: data.google_drive_folder_id || null,
        protected_tables: protectedTables,
        sql_protection_queries: sqlProtectionQueriesText
          .split("\n")
          .map((q) => q.trim())
          .filter(Boolean),
        protected_post_types: parseProtectedPostTypes(protectedPostTypesText),
      };
      if (initial) {
        await environmentsApi.updateEnvironment(projectId, initial.id, payload);
        toast({ title: "Environment updated" });
      } else {
        await environmentsApi.createEnvironment(projectId, payload);
        toast({ title: "Environment created" });
      }
      reset();
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Save failed. Please try again.";
      setError("root", { message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit Environment" : "Add Environment"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="env-type">Type *</Label>
              <Select
                defaultValue={initial?.type ?? "production"}
                onValueChange={(v) => setValue("type", v as EnvTypeValue)}
              >
                <SelectTrigger id="env-type">
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {ENV_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && (
                <p className="text-xs text-destructive">
                  {errors.type.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Server *</Label>
              <Select
                defaultValue={initial?.server.id?.toString()}
                onValueChange={(v) => setValue("server_id", Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select server…" />
                </SelectTrigger>
                <SelectContent>
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name} ({s.ip_address})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.server_id && (
                <p className="text-xs text-destructive">
                  {errors.server_id.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="env-url">Site URL *</Label>
            <Input
              id="env-url"
              {...register("url")}
              placeholder="https://example.com"
            />
            {errors.url && (
              <p className="text-xs text-destructive">{errors.url.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="env-root">Root Path *</Label>
            <Input
              id="env-root"
              {...register("root_path")}
              placeholder="/home/user/public_html"
            />
            {errors.root_path && (
              <p className="text-xs text-destructive">
                {errors.root_path.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="env-backup">
              Backup Path{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (optional)
              </span>
            </Label>
            <Input
              id="env-backup"
              {...register("backup_path")}
              placeholder="/home/user/backups"
            />
            <p className="text-xs text-muted-foreground">
              Persistent directory on the server for backup files
            </p>
            {errors.backup_path && (
              <p className="text-xs text-destructive">
                {errors.backup_path.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="env-gdrive">
              Google Drive Folder ID{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (optional)
              </span>
            </Label>
            <Input
              id="env-gdrive"
              {...register("google_drive_folder_id")}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            />
            <p className="text-xs text-muted-foreground">
              Backups for this environment are uploaded to this Google Drive
              folder
            </p>
            {errors.google_drive_folder_id && (
              <p className="text-xs text-destructive">
                {errors.google_drive_folder_id.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>
              Protected Tables{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (optional)
              </span>
            </Label>
            <ProtectedTablesPicker
              projectId={projectId}
              envId={initial?.id}
              value={protectedTables}
              onChange={setProtectedTables}
            />
            <p className="text-xs text-muted-foreground">
              WP table names preserved during DB push/clone and skipped during
              URL search-replace. Use for custom plugin tables that hold
              production-only data.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="env-post-types">
              Protected Custom Post Types{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (optional)
              </span>
            </Label>
            <Input
              id="env-post-types"
              value={protectedPostTypesText}
              onChange={(e) => setProtectedPostTypesText(e.target.value)}
              placeholder="project, course, lesson"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              WordPress custom post type identifiers (comma-separated, e.g.
              `project, course`) to preserve on the target during sync. Target
              posts, metadata, taxonomy links, comments, and directly attached
              media for these post types will not be overwritten.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="env-sql-queries">
              SQL Protection Queries{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (optional)
              </span>
            </Label>
            <textarea
              id="env-sql-queries"
              value={sqlProtectionQueriesText}
              onChange={(e) => setSqlProtectionQueriesText(e.target.value)}
              placeholder="DELETE FROM {prefix}posts WHERE post_type = 'shop_order';&#10;DELETE FROM {prefix}options WHERE option_name LIKE 'elementor_%';"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              SQL queries executed on the target database after DB sync but
              before URL rewrites. Enter one query per line. `{"{prefix}"}` will
              resolve to the target database prefix (e.g. `wp_`).
            </p>
          </div>

          <DialogFooter>
            {errors.root && (
              <p className="text-xs text-destructive w-full text-left">
                {errors.root.message}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : initial ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
