import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const FALLBACK_COLORS = ['#f59e0b', '#10b981', '#6366f1', '#f43f5e', '#06b6d4', '#8b5cf6', '#f97316', '#ec4899', '#14b8a6'];

export default function ObjectivePieChart({ data, objectives, totalCapacity, usedCapacity }) {
  // data: [{name, value}]
  const colorMap = {};
  objectives?.forEach(o => { colorMap[o.name] = o.color; });

  const chartData = data.filter(d => d.value > 0);
  const utilization = totalCapacity > 0 ? Math.round((usedCapacity / totalCapacity) * 100) : 0;

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No effort data yet
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={95}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={true}
          >
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={colorMap[entry.name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => `${value} weeks`} />
        </PieChart>
      </ResponsiveContainer>
      {totalCapacity > 0 && (
        <div className="text-center mt-2">
          <span className="text-xs font-medium text-muted-foreground">Capacity Utilization: </span>
          <span className={`text-sm font-bold ${utilization > 100 ? 'text-red-500' : utilization > 80 ? 'text-amber-500' : 'text-emerald-500'}`}>
            {utilization}%
          </span>
        </div>
      )}
    </div>
  );
}