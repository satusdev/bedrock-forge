import React from 'react';
import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TrendData {
	date: string;
	score: number;
}

export function SecurityTrendChart({ data }: { data: TrendData[] }) {
	if (data.length === 0) return null;

	return (
		<Card className="col-span-1 lg:col-span-3">
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-semibold flex items-center justify-between">
					Security Health Trend
					<span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider">
						Last 30 Days
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="px-2 pt-4">
				<div className="h-[200px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart
							data={data}
							margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
						>
							<defs>
								<linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
									<stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
								</linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
							<XAxis
								dataKey="date"
								axisLine={false}
								tickLine={false}
								tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
								minTickGap={30}
								tickFormatter={(val) => {
									const date = new Date(val);
									return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
								}}
							/>
							<YAxis
								domain={[0, 100]}
								axisLine={false}
								tickLine={false}
								tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
							/>
							<Tooltip
								content={({ active, payload }) => {
									if (active && payload && payload.length) {
										return (
											<div className="bg-popover border rounded-lg p-2 shadow-lg text-xs">
												<p className="font-medium">{new Date(payload[0].payload.date).toLocaleDateString()}</p>
												<p className="text-primary font-bold mt-1">Score: {payload[0].value}</p>
											</div>
										);
									}
									return null;
								}}
							/>
							<Area
								type="monotone"
								dataKey="score"
								stroke="var(--primary)"
								strokeWidth={2}
								fillOpacity={1}
								fill="url(#colorScore)"
								animationDuration={1500}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}
