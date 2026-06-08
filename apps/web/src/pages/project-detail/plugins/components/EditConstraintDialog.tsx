import { useState, FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plugin } from "../types";

export function EditConstraintDialog({
  plugin,
  onClose,
  onSave,
  isPending,
}: {
  plugin: Plugin;
  onClose: () => void;
  onSave: (slug: string, constraint: string) => void;
  isPending: boolean;
}) {
  const [value, setValue] = useState(plugin.composer_constraint ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim()) onSave(plugin.slug, value.trim());
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Constraint — {plugin.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Version constraint</label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. ^8.0 or ^8.1.2"
              disabled={isPending}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Current:{" "}
              <code className="bg-muted px-1 rounded">
                {plugin.composer_constraint ?? "none"}
              </code>
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim() || isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              Update Constraint
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
