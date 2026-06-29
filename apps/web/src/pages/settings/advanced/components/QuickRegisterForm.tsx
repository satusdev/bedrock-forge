import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { advancedApi } from "../api";

const newSettingSchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "Only letters, digits, underscores, dots, dashes",
    ),
  value: z.string().min(1, "Value is required"),
});

type NewSettingForm = z.infer<typeof newSettingSchema>;

export function QuickRegisterForm() {
  const qc = useQueryClient();
  const {
    register: regNew,
    handleSubmit: handleNew,
    reset: resetNew,
    setError: setNewError,
    formState: { errors: newErrors, isSubmitting: isCreating },
  } = useForm<NewSettingForm>({ resolver: zodResolver(newSettingSchema) });

  async function onNew(data: NewSettingForm) {
    try {
      await advancedApi.updateSetting(data.key, data.value);
      qc.invalidateQueries({ queryKey: ["settings"] });
      resetNew();
      toast({ title: "Setting created" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Create failed. Please try again.";
      setNewError("root", { message });
    }
  }

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="bg-muted/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-lg">
            <Plus className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Quick Register</CardTitle>
            <CardDescription>
              Add a new low-level configuration key.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form
          onSubmit={handleNew(onNew)}
          className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end"
        >
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="new-key"
                className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Key Name
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-muted-foreground hover:text-foreground">
                    <Info className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  A dot-separated identifier for the settings key, e.g. &apos;app.maintenance_mode&apos;.
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="new-key"
              {...regNew("key")}
              placeholder="app.feature_flag"
              className="font-mono text-xs bg-muted/20"
            />
            {newErrors.key && (
              <p className="text-[10px] text-destructive font-bold uppercase">
                {newErrors.key.message}
              </p>
            )}
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="new-val"
                className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Value
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-muted-foreground hover:text-foreground">
                    <Info className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  The setting value. Can be a string, serialized JSON, number, or boolean representation (&apos;true&apos; / &apos;false&apos;).
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="new-val"
              {...regNew("value")}
              placeholder="enabled"
              className="bg-muted/20"
            />
            {newErrors.value && (
              <p className="text-[10px] text-destructive font-bold uppercase">
                {newErrors.value.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              type="submit"
              size="sm"
              disabled={isCreating}
              className="w-full"
            >
              {isCreating ? "Saving\u2026" : "Add Key"}
            </Button>
          </div>
          {newErrors.root && (
            <div className="md:col-span-5 p-2 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-xs text-destructive text-center">
                {newErrors.root.message}
              </p>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
