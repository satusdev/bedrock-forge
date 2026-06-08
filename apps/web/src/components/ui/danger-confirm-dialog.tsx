import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DangerConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmation: string;
  confirmLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
}

export function DangerConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmation,
  confirmLabel = "Confirm",
  isPending = false,
  onConfirm,
}: DangerConfirmDialogProps) {
  const [value, setValue] = useState("");
  const canConfirm = value.trim() === confirmation.trim();

  useEffect(() => {
    if (!open) setValue("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="danger-confirm">
            Type{" "}
            <span className="font-semibold text-foreground">
              {confirmation}
            </span>{" "}
            to continue
          </Label>
          <Input
            id="danger-confirm"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={isPending}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!canConfirm || isPending}
          >
            {isPending ? "Processing..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
