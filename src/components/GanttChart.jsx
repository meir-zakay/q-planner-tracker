import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

export default function GanttChart({ entries, sprints, featureMap, colorMap, darkMode }) {
  const chartData = useMemo(() => {
    return sprints.map((sprint, idx) => {
      const item = { sprint, sprintIdx: idx };
      entries.forEach(entry => {
        const feat = featureMap[entry.feature_id];
        if (!feat) return;
        const alloc = entry.sprint_allocations?.find(a => a.sprint === sprint);
        const totalEffort = (alloc?.be_weeks || 0) + (alloc?.fe_weeks || 0);
        if (totalEffort > 0) {
          item[`feat-${entry.id}`] = totalEffort;
        }
      });
      return item;
    });
  }, [entries, sprints, featureMap]);

  const features = useMemo(() => entries.filter(e => featureMap[e.feature_id]), [entries, featureMap]);

  if (features.length === 0) {
    return (
      <div className={`rounded-xl p-5 ${darkMode ? 'bg-[#1a1530]' : 'bg-slate-50'} border border-border`}>
        <h3 className="font-semibold text-foreground mb-4">Feature Timeline</h3>
        <p className="text-sm text-muted-foreground text-center py-8">No features to display</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl p-5 ${darkMode ? 'bg-[#1a1530]' : 'bg-slate-50'} border border-border`}>
      <h3 className="font-semibold text-foreground mb-4">Feature Timeline</h3>
      <ResponsiveContainer width="100%" height={Math.max(300, features.length * 35)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="sprint" width={60} tick={{ fontSize: 12 }} />
          <Tooltip 
            contentStyle={{
              backgroundColor: darkMode ? '#1a1530' : '#fff',
              border: `1px solid hsl(var(--border))`,
              borderRadius: '6px'
            }}
            formatter={(value) => `${value}w`}
          />
          {features.map((entry) => {
            const feat = featureMap[entry.feature_id];
            const color = colorMap[feat?.objective] || '#0F52BA';
            return (
              <Bar
                key={`feat-${entry.id}`}
                dataKey={`feat-${entry.id}`}
                name={feat?.title}
                stackId="effort"
                fill={color}
                radius={[0, 4, 4, 0]}
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}