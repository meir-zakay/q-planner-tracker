import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

export default function TeamGanttChart({ teams, planEntries, features, sprints }) {
  const chartData = useMemo(() => {
    if (!teams.length || !sprints.length) return [];

    return sprints.map(sprint => {
      let beTotalUsed = 0;
      let feTotalUsed = 0;

      planEntries.forEach(entry => {
        const alloc = entry.sprint_allocations?.find(a => a.sprint === sprint);
        if (alloc) {
          beTotalUsed += alloc.be_weeks || 0;
          feTotalUsed += alloc.fe_weeks || 0;
        }
      });

      const beTotalCapacity = teams.reduce((sum, t) => sum + (t.be_capacity_weeks || 0) / sprints.length, 0);
      const feTotalCapacity = teams.reduce((sum, t) => sum + (t.fe_capacity_weeks || 0) / sprints.length, 0);

      return {
        sprint,
        beCapacity: Math.round(beTotalCapacity * 2) / 2,
        feCapacity: Math.round(feTotalCapacity * 2) / 2,
        beUsed: Math.round(beTotalUsed * 2) / 2,
        feUsed: Math.round(feTotalUsed * 2) / 2,
      };
    });
  }, [teams, planEntries, sprints]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
        <h3 className="font-semibold text-foreground mb-4">Team Allocation Timeline</h3>
        <div className="text-center py-12 text-muted-foreground text-sm">
          No team data available
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
      <h3 className="font-semibold text-foreground mb-4">Team Allocation Timeline</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
          <XAxis 
            dataKey="team" 
            angle={-45} 
            textAnchor="end" 
            height={100}
            tick={{ fontSize: 12 }}
          />
          <YAxis label={{ value: 'Weeks', angle: -90, position: 'insideLeft' }} />
          <Tooltip 
            formatter={(value, name) => {
              const labels = { beAllocated: 'BE Used', feAllocated: 'FE Used', beCapacity: 'BE Capacity', feCapacity: 'FE Capacity' };
              return [value.toFixed(1), labels[name] || name];
            }}
            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          />
          <Legend />
          <Bar dataKey="beCapacity" fill="#0F52BA" opacity={0.3} name="BE Capacity" />
          <Bar dataKey="beAllocated" fill="#0F52BA" name="BE Used" />
          <Bar dataKey="feCapacity" fill="#10b981" opacity={0.3} name="FE Capacity" />
          <Bar dataKey="feAllocated" fill="#10b981" name="FE Used" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#0F52BA' }} />
          <span>Backend</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: '#10b981' }} />
          <span>Frontend</span>
        </div>
      </div>
    </div>
  );
}