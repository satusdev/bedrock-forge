import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface SecurityScoreGaugeProps {
  score: number;
  size?: number;
}

export function SecurityScoreGauge({
  score,
  size = 200,
}: SecurityScoreGaugeProps) {
  const data = [
    { name: "Score", value: score },
    { name: "Remaining", value: 100 - score },
  ];

  const getColor = (val: number) => {
    if (val >= 90) return "#22c55e"; // Green-500
    if (val >= 70) return "#84cc16"; // Lime-500
    if (val >= 50) return "#eab308"; // Yellow-500
    if (val >= 30) return "#f97316"; // Orange-500
    return "#ef4444"; // Red-500
  };

  const color = getColor(score);

  return (
    <div
      className="relative flex flex-col items-center justify-center"
      style={{ width: size, height: size / 1.5 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="80%"
            startAngle={180}
            endAngle={0}
            innerRadius="65%"
            outerRadius="90%"
            paddingAngle={0}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill="currentColor" className="text-muted/20" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <span
          className="text-4xl font-extrabold tracking-tight"
          style={{ color }}
        >
          {score}
        </span>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-1">
          Security Score
        </p>
      </div>
    </div>
  );
}
