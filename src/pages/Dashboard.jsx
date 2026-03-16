import React, { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useQuarterSelection } from '@/components/QuarterContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Users, ListChecks, Server, Monitor } from 'lucide-react';
import TeamGanttChart from '@/components/TeamGanttChart';

const FALLBACK_COLORS = ['#0F52BA','#0ea5e9','#f59e0b','#10b981','#f43f5e','#6366f1','#f97316'];

export default function Dashboard() {
  const { user } = useOutletContext();
  const { selectedYear, selectedQuarter } = useQuarterSelection();

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const { data: features = [] } = useQuery({ queryKey: ['features', selectedYear, selectedQuarter], queryFn: () => base44.entities.Feature.filter({ year: selectedYear, quarter: selectedQuarter }) });
  const { data: objectives = [] } = useQuery({ queryKey: ['objectives'], queryFn: () => base44.entities.Objective.list() });
  const { data: allEntries = [] } = useQuery({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter], queryFn: () => base44.entities.TeamPlanEntry.filter({ year: selectedYear, quarter: selectedQuarter }) });
  const { data: quarterConfigs = [] } = useQuery({ queryKey: ['quarterConfigs'], queryFn: () => base44.entities.QuarterConfig.list() });

  const featureMap = useMemo(() => { const m = {}; features.forEach(f => { m[f.id] = f; }); return m; }, [features]);
  const colorMap = useMemo(() => { const m = {}; objectives.forEach(o => { m[o.name] = o.color; }); return m; }, [objectives]);

  const totalBECapacity = teams.reduce((s, t) => s + (t.be_capacity_weeks || 0), 0);
  const totalFECapacity = teams.reduce((s, t) => s + (t.fe_capacity_weeks || 0), 0);
  const totalCapacity = totalBECapacity + totalFECapacity;

  const totalBEEffort = allEntries.reduce((s, e) => s + (e.be_effort_weeks || 0), 0);
  const totalFEEffort = allEntries.reduce((s, e) => s + (e.fe_effort_weeks || 0), 0);
  const totalUsed = totalBEEffort + totalFEEffort;

  const effortByObjective = useMemo(() => {
    const map = {};
    allEntries.forEach(entry => {
      const feat = featureMap[entry.feature_id];
      if (!feat) return;
      const obj = feat.objective || 'Other';
      const effort = (entry.be_effort_weeks || 0) + (entry.fe_effort_weeks || 0);
      map[obj] = (map[obj] || 0) + effort;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [allEntries, featureMap]);

  const utilizationPct = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;
  const utilizationColor = utilizationPct > 100 ? '#ef4444' : utilizationPct > 85 ? '#f59e0b' : '#0F52BA';

  const stats = [
    { label: 'Teams', value: teams.length, icon: Users, bg: 'bg-blue-50 dark:bg-blue-950/40', iconColor: 'text-blue-500' },
    { label: 'Features', value: features.length, icon: ListChecks, bg: 'bg-blue-50 dark:bg-blue-950/40', iconColor: 'text-blue-600' },
    { label: 'BE Effort (weeks)', value: totalBEEffort, icon: Server, bg: 'bg-blue-50 dark:bg-blue-950/40', iconColor: 'text-blue-500' },
    { label: 'FE Effort (weeks)', value: totalFEEffort, icon: Monitor, bg: 'bg-emerald-50 dark:bg-emerald-950/40', iconColor: 'text-emerald-500' },
  ];

  const firstName = user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          Overview for <span className="text-primary font-medium">{selectedQuarter} {selectedYear}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-xl p-5 flex items-center gap-4 bg-slate-50 dark:bg-[#1a1530] border border-border dark:border-[hsl(228_25%_14%)]">
            <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center shrink-0`}>
              <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground leading-none">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <TeamGanttChart 
        teams={teams} 
        planEntries={allEntries} 
        features={features} 
        sprints={quarterConfigs.find(c => c.year === selectedYear && c.quarter === selectedQuarter)?.sprints || []}
        objectives={objectives}
      />

      <div className="rounded-xl p-6 bg-slate-50 dark:bg-[#1a1530] border border-border dark:border-[hsl(228_25%_14%)]">
        <h2 className="text-base font-semibold text-foreground mb-1">Effort by Objective</h2>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">Capacity Utilization</p>
          <p className="text-sm font-bold" style={{ color: utilizationColor }}>{utilizationPct}%</p>
        </div>
        <div className="w-full bg-muted rounded-full h-2 mb-1">
          <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(utilizationPct, 100)}%`, backgroundColor: utilizationColor }} />
        </div>
        <p className="text-xs text-muted-foreground mb-6">{totalUsed}w used of {totalCapacity}w total</p>

        {effortByObjective.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No effort data for this quarter</div>
        ) : (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={effortByObjective} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2} dataKey="value" nameKey="name">
                  {effortByObjective.map((entry, index) => (
                    <Cell key={entry.name} fill={colorMap[entry.name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value}w`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
              {effortByObjective.map((entry, index) => {
                const total = effortByObjective.reduce((s, d) => s + d.value, 0);
                const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                const color = colorMap[entry.name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
                return (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span>{entry.name} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}