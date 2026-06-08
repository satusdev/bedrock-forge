import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { X, Database, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { TABLE_NAME_REGEX } from "../utils";
import { environmentsApi } from "../api";

export function ProtectedTablesPicker({
  projectId,
  envId,
  value,
  onChange,
}: {
  projectId: number;
  envId: number | undefined;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [allTables, setAllTables] = useState<string[]>([]);
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [manualInput, setManualInput] = useState("");

  const fetchMutation = useMutation({
    mutationFn: () => {
      if (!envId) throw new Error("Environment ID is required");
      return environmentsApi.getDbTables(projectId, envId);
    },
    onSuccess: (data) => setAllTables(data),
    onError: () =>
      toast({
        title: "Failed to load tables from server",
        variant: "destructive",
      }),
  });

  const openDialog = () => {
    setPendingSelection([...value]);
    setSearch("");
    setDialogOpen(true);
  };

  const addManual = () => {
    const name = manualInput.trim();
    if (!name) return;
    if (!TABLE_NAME_REGEX.test(name)) {
      toast({
        title: "Invalid table name",
        description:
          "Use the exact MySQL table name with only letters, numbers, underscores, and dollar signs.",
        variant: "destructive",
      });
      return;
    }
    if (!value.includes(name)) onChange([...value, name]);
    setManualInput("");
  };

  const filtered = allTables.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      {/* Selected badges */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1">
              {t}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== t))}
                className="ml-0.5 rounded-sm hover:text-destructive focus:outline-none"
                aria-label={`Remove ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Manual input + Browse button */}
      <div className="flex gap-2">
        <Input
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addManual();
            }
          }}
          placeholder="Type table name…"
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={addManual}>
          Add
        </Button>
        {envId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openDialog}
          >
            Browse
          </Button>
        )}
      </div>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No tables protected. Add table names to preserve them during DB
          push/clone.
        </p>
      )}

      {/* Browse dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Protected Tables</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fetchMutation.mutate()}
              disabled={fetchMutation.isPending}
            >
              {fetchMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading tables…
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  {allTables.length > 0
                    ? "Reload tables from server"
                    : "Load tables from server"}
                </>
              )}
            </Button>

            {allTables.length > 0 && (
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tables…"
                className="h-8"
              />
            )}

            {allTables.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded border divide-y">
                {filtered.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3">
                    No tables match
                  </p>
                )}
                {filtered.map((t) => {
                  const selected = pendingSelection.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setPendingSelection((prev) =>
                          selected ? prev.filter((x) => x !== t) : [...prev, t],
                        )
                      }
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors",
                        selected && "bg-primary/10 text-primary font-medium",
                      )}
                    >
                      <CheckCircle2
                        className={cn(
                          "h-4 w-4 shrink-0",
                          selected
                            ? "text-primary"
                            : "text-muted-foreground opacity-20",
                        )}
                      />
                      {t}
                    </button>
                  );
                })}
              </div>
            )}

            {allTables.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {pendingSelection.length} table
                {pendingSelection.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChange(pendingSelection);
                setDialogOpen(false);
              }}
            >
              Apply ({pendingSelection.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
