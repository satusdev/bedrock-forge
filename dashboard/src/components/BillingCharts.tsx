import { useState, useEffect } from 'react';

interface BillingStats {
  total_invoiced: number;
  total_paid: number;
  total_pending: number;
  total_overdue: number;
  invoice_count: number;
  paid_count: number;
  pending_count: number;
}

interface BillingChartsProps {
  periodDays?: number;
}

export function BillingCharts({ periodDays = 30 }: BillingChartsProps) {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [periodDays]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/invoices/stats/summary?period_days=${periodDays}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching billing stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse h-24 bg-gray-200 rounded-lg"></div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return <div className="text-gray-500">No billing data available</div>;
  }

  const cards = [
    {
      label: 'Total Invoiced',
      value: formatCurrency(stats.total_invoiced),
      sublabel: `${stats.invoice_count} invoices`,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      label: 'Total Paid',
      value: formatCurrency(stats.total_paid),
      sublabel: `${stats.paid_count} paid`,
      color: 'bg-green-50 text-green-700 border-green-200',
    },
    {
      label: 'Pending',
      value: formatCurrency(stats.total_pending),
      sublabel: `${stats.pending_count} invoices`,
      color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    },
    {
      label: 'Overdue',
      value: formatCurrency(stats.total_overdue),
      sublabel: 'Needs attention',
      color: stats.total_overdue > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-700 border-gray-200',
    },
  ];

  // Calculate percentages for visual bar
  const total = stats.total_paid + stats.total_pending + stats.total_overdue;
  const paidPct = total > 0 ? (stats.total_paid / total) * 100 : 0;
  const pendingPct = total > 0 ? (stats.total_pending / total) * 100 : 0;
  const overduePct = total > 0 ? (stats.total_overdue / total) * 100 : 0;

  return (
    <div className="billing-charts">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Billing Overview</h3>
        <span className="text-sm text-gray-500">Last {periodDays} days</span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`p-4 rounded-lg border ${card.color}`}
          >
            <div className="text-sm opacity-75">{card.label}</div>
            <div className="text-2xl font-bold mt-1">{card.value}</div>
            <div className="text-xs mt-1 opacity-60">{card.sublabel}</div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      {total > 0 && (
        <div className="mt-4">
          <div className="text-sm text-gray-600 mb-2">Payment Status Distribution</div>
          <div className="h-4 rounded-full overflow-hidden flex bg-gray-200">
            {paidPct > 0 && (
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${paidPct}%` }}
                title={`Paid: ${formatCurrency(stats.total_paid)}`}
              />
            )}
            {pendingPct > 0 && (
              <div
                className="bg-yellow-400 transition-all"
                style={{ width: `${pendingPct}%` }}
                title={`Pending: ${formatCurrency(stats.total_pending)}`}
              />
            )}
            {overduePct > 0 && (
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${overduePct}%` }}
                title={`Overdue: ${formatCurrency(stats.total_overdue)}`}
              />
            )}
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>🟢 Paid {paidPct.toFixed(0)}%</span>
            <span>🟡 Pending {pendingPct.toFixed(0)}%</span>
            <span>🔴 Overdue {overduePct.toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default BillingCharts;
