import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  Send,
  Printer,
  Package,
  Calendar,
  User,
  FolderKanban,
  Download,
  Trash2,
} from "lucide-react";
import { api, getValidAccessToken } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { useBillingSettings } from "@/hooks/useBillingSettings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog } from "@/components/ui/alert-dialog";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

const STATUS_VARIANT: Record<
  InvoiceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  sent: "secondary",
  paid: "default",
  overdue: "destructive",
  cancelled: "outline",
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

interface InvoiceDetail {
  id: number;
  invoice_number: string;
  status: InvoiceStatus;
  total_amount: string;
  hosting_amount: string;
  support_amount: string;
  period_start: string;
  period_end: string;
  due_date: string;
  paid_at: string | null;
  created_at: string;
  project: { id: number; name: string } | null;
  client: { id: number; name: string } | null;
  hosting_package: { id: number; name: string; price_monthly: string } | null;
  support_package: { id: number; name: string; price_monthly: string } | null;
  hosting_package_snapshot: string | null;
  support_package_snapshot: string | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function fmtPeriod(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
    ? f(s)
    : `${f(s)} – ${f(e)}`;
}

function numMonths(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return (
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth()) +
    1
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { formatMoney } = useBillingSettings();

  const {
    data: invoice,
    isLoading,
    isError,
  } = useQuery<InvoiceDetail>({
    queryKey: ["invoice", id],
    queryFn: () => api.get(`/invoices/${id}`),
    enabled: !!id,
  });

  const [downloading, setDownloading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const downloadPdf = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      const token = await getValidAccessToken();
      const res = await fetch(`/api/invoices/${id}/pdf`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error("Failed to download PDF");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoice.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "Failed to download PDF", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const markPaid = useMutation({
    mutationFn: () => api.put(`/invoices/${id}/mark-paid`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice marked as paid" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const markSent = useMutation({
    mutationFn: () => api.put(`/invoices/${id}/mark-sent`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice marked as sent" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteInvoice = useMutation({
    mutationFn: () => api.delete(`/invoices/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice deleted" });
      navigate("/invoices");
    },
    onError: () =>
      toast({ title: "Failed to delete invoice", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-1">Invoice not found</h2>
        <p className="text-muted-foreground text-sm mb-4">
          This invoice may have been deleted or you don't have access.
        </p>
        <Button variant="outline" onClick={() => navigate("/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Invoices
        </Button>
      </div>
    );
  }

  const months = numMonths(invoice.period_start, invoice.period_end);
  const hostingName =
    invoice.hosting_package?.name ?? invoice.hosting_package_snapshot ?? null;
  const supportName =
    invoice.support_package?.name ?? invoice.support_package_snapshot ?? null;
  const hostingAmt = parseFloat(invoice.hosting_amount);
  const supportAmt = parseFloat(invoice.support_amount);
  const totalAmt = parseFloat(invoice.total_amount);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-1"
        onClick={() => navigate("/invoices")}
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        All Invoices
      </Button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">
              {invoice.invoice_number}
            </h1>
            <Badge
              variant={STATUS_VARIANT[invoice.status]}
              className="text-sm capitalize"
            >
              {STATUS_LABEL[invoice.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Period: {fmtPeriod(invoice.period_start, invoice.period_end)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap print:hidden">
          {invoice.status === "draft" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markSent.mutate()}
              disabled={markSent.isPending}
            >
              <Send className="h-4 w-4 mr-1.5" />
              Mark Sent
            </Button>
          )}
          {(invoice.status === "sent" || invoice.status === "overdue") && (
            <Button
              size="sm"
              onClick={() => markPaid.mutate()}
              disabled={markPaid.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Mark Paid
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={downloadPdf}
            disabled={downloading}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {downloading ? "Downloading..." : "Download PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={deleteInvoice.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Invoice card — print-friendly layout */}
      <div className="bg-card border rounded-xl overflow-hidden print:border-0 print:shadow-none">
        {/* Top: Client & Project */}
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-2">
              <User className="h-3.5 w-3.5" />
              Bill To
            </div>
            {invoice.client ? (
              <Link
                to={`/clients/${invoice.client.id}`}
                className="font-semibold text-lg hover:text-primary transition-colors"
              >
                {invoice.client.name}
              </Link>
            ) : (
              <span className="font-semibold text-lg text-muted-foreground">
                —
              </span>
            )}
            {invoice.project && (
              <Link
                to={`/projects/${invoice.project.id}`}
                className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
              >
                <FolderKanban className="h-3.5 w-3.5" />
                {invoice.project.name}
              </Link>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-2">
              <Calendar className="h-3.5 w-3.5" />
              Dates
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Period</span>
              <span className="font-medium">
                {fmtPeriod(invoice.period_start, invoice.period_end)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Due Date</span>
              <span className="font-medium">{fmtDate(invoice.due_date)}</span>
            </div>
            {invoice.paid_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid On</span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {fmtDate(invoice.paid_at)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span className="text-muted-foreground">
                {fmtDate(invoice.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="px-6 py-5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-4">
            <Package className="h-3.5 w-3.5" />
            Services
          </div>

          <div className="space-y-0 rounded-lg border overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2.5 bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Description</span>
              <span className="text-right">Rate/mo</span>
              <span className="text-right">Months</span>
              <span className="text-right">Amount</span>
            </div>

            {hostingAmt > 0 && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 border-t text-sm">
                <div>
                  <p className="font-medium">{hostingName ?? "Hosting"}</p>
                  <p className="text-xs text-muted-foreground">
                    Hosting Package
                  </p>
                </div>
                <span className="text-right text-muted-foreground tabular-nums">
                  {formatMoney(hostingAmt / months)}
                </span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {months}
                </span>
                <span className="text-right font-medium tabular-nums">
                  {formatMoney(invoice.hosting_amount)}
                </span>
              </div>
            )}

            {supportAmt > 0 && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 border-t text-sm">
                <div>
                  <p className="font-medium">{supportName ?? "Support"}</p>
                  <p className="text-xs text-muted-foreground">
                    Support Package
                  </p>
                </div>
                <span className="text-right text-muted-foreground tabular-nums">
                  {formatMoney(supportAmt / months)}
                </span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {months}
                </span>
                <span className="text-right font-medium tabular-nums">
                  {formatMoney(invoice.support_amount)}
                </span>
              </div>
            )}

            {/* Total */}
            <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 border-t bg-muted/30">
              <span className="font-semibold text-sm">Total</span>
              <span className="text-right text-lg font-bold tabular-nums">
                {formatMoney(totalAmt)}
              </span>
            </div>
          </div>
        </div>

        {/* Status footer */}
        {invoice.status === "paid" && invoice.paid_at && (
          <div className="px-6 py-3 bg-green-50 dark:bg-green-950/30 border-t flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm text-green-700 dark:text-green-400 font-medium">
              Paid on {fmtDate(invoice.paid_at)}
            </span>
          </div>
        )}
      </div>

      {/* Related links */}
      <div className="flex flex-wrap gap-3 print:hidden">
        {invoice.client && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/clients/${invoice.client.id}`}>
              <User className="h-4 w-4 mr-1.5" />
              View Client
            </Link>
          </Button>
        )}
        {invoice.project && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/projects/${invoice.project.id}`}>
              <FolderKanban className="h-4 w-4 mr-1.5" />
              View Project
            </Link>
          </Button>
        )}
      </div>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Invoice"
        description={`Invoice "${invoice.invoice_number}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={() => deleteInvoice.mutate()}
        isPending={deleteInvoice.isPending}
      />
    </div>
  );
}
