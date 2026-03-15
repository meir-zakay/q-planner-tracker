import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useQuarterSelection } from '@/components/QuarterContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const FALLBACK_COLORS = ['#0F52BA', '#0ea5e9', '#f59e0b', '#10b981', '#f43f5e', '#6366f1', '#f97316'];

export default function Leadership() {
  const { user } = useOutletContext();
  const { selectedYear, selectedQuarter } = useQuarterSelection();
  const [selectedTeamDetail, setSelectedTeamDetail] = useState(null);

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const { data: features = [] } = useQuery({ queryKey: ['features', selectedYear, selectedQuarter], queryFn: () => base44.entities.Feature.filter({ year: selectedYear, quarter: selectedQuarter }) });
  const { data: allEntries = [] } = useQuery({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter], queryFn: () => base44.entities.TeamPlanEntry.filter({ year: selectedYear, quarter: selectedQuarter }) });
  const { data: actualProgress = [] } = useQuery({ queryKey: ['actualProgress', selectedYear, selectedQuarter], queryFn: () => base44.entities.ActualProgress.filter({ year: selectedYear, quarter: selectedQuarter }) });

  const featureMap = useMemo(() => { const m = {}; features.forEach(f => { m[f.id] = f; }); return m; }, [features]);
  const entryMap = useMemo(() => { const m = {}; allEntries.forEach(e => { m[e.id] = e; }); return m; }, [allEntries]);
  const progressMap = useMemo(() => { const m = {}; actualProgress.forEach(p => { m[p.feature_id] = p; }); return m; }, [actualProgress]);

  // Overall metrics
  const totalBECapacity = teams.reduce((s, t) => s + (t.be_capacity_weeks || 0), 0);
  const totalFECapacity = teams.reduce((s, t) => s + (t.fe_capacity_weeks || 0), 0);
  const totalCapacity = totalBECapacity + totalFECapacity;

  const totalBEPlanned = allEntries.reduce((s, e) => s + (e.be_effort_weeks || 0), 0);
  const totalFEPlanned = allEntries.reduce((s, e) => s + (e.fe_effort_weeks || 0), 0);
  const totalPlanned = totalBEPlanned + totalFEPlanned;

  const totalBEActual = actualProgress.reduce((s, p) => s + (progressMap[p.feature_id]?.actual_progress_percent || 0) * (entryMap[allEntries.find(e => e.feature_id === p.feature_id)?.id]?.be_effort_weeks || 0) / 100, 0);
  const totalFEActual = actualProgress.reduce((s, p) => s + (progressMap[p.feature_id]?.actual_progress_percent || 0) * (entryMap[allEntries.find(e => e.feature_id === p.feature_id)?.id]?.fe_effort_weeks || 0) / 100, 0);
  const totalActual = totalBEActual + totalFEActual;

  const utilizationPct = totalCapacity > 0 ? Math.round((totalPlanned / totalCapacity) * 100) : 0;
  const utilizationColor = utilizationPct > 100 ? '#ef4444' : utilizationPct > 85 ? '#f59e0b' : '#0F52BA';

  // Team-level breakdown
  const teamMetrics = useMemo(() => {
    return teams.map(team => {
      const teamEntries = allEntries.filter(e => e.team_id === team.id);
      const teamProgress = actualProgress.filter(p => p.team_id === team.id);
      
      const bePlanned = teamEntries.reduce((s, e) => s + (e.be_effort_weeks || 0), 0);
      const fePlanned = teamEntries.reduce((s, e) => s + (e.fe_effort_weeks || 0), 0);
      const planned = bePlanned + fePlanned;

      const avgProgress = teamProgress.length > 0 
        ? Math.round(teamProgress.reduce((s, p) => s + (p.actual_progress_percent || 0), 0) / teamProgress.length)
        : 0;

      const blockedCount = teamProgress.filter(p => p.status === 'Blocked').length;

      return {
        name: team.name,
        planned,
        bePlanned,
        fePlanned,
        avgProgress,
        blockedCount,
        teamId: team.id
      };
    });
  }, [teams, allEntries, actualProgress]);

  // Blocked features across organization
  const blockedFeatures = useMemo(() => {
    return actualProgress
      .filter(p => p.status === 'Blocked')
      .map(p => ({
        featureTitle: featureMap[p.feature_id]?.title || 'Unknown',
        teamName: teams.find(t => t.id === p.team_id)?.name || 'Unknown',
        notes: p.notes || ''
      }));
  }, [actualProgress, featureMap, teams]);

  // Effort data for chart
  const effortData = [
    { category: 'Planned BE', value: totalBEPlanned },
    { category: 'Planned FE', value: totalFEPlanned },
    { category: 'Actual BE', value: Math.round(totalBEActual * 10) / 10 },
    { category: 'Actual FE', value: Math.round(totalFEActual * 10) / 10 }
  ];

  const progressData = teamMetrics.map(tm => ({
    name: tm.name,
    progress: tm.avgProgress
  }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          Organization Overview — <span className="text-primary font-medium">{selectedQuarter} {selectedYear}</span>
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
          <p className="text-xs text-muted-foreground mb-1">Total Capacity</p>
          <p className="text-2xl font-bold text-foreground">{totalCapacity}w</p>
          <p className="text-xs text-muted-foreground mt-2">{totalBECapacity}w BE / {totalFECapacity}w FE</p>
        </div>
        <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
          <p className="text-xs text-muted-foreground mb-1">Planned</p>
          <p className="text-2xl font-bold text-foreground">{totalPlanned}w</p>
          <p className="text-xs text-muted-foreground mt-2">{utilizationPct}% utilization</p>
        </div>
        <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
          <p className="text-xs text-muted-foreground mb-1">Avg Progress</p>
          <p className="text-2xl font-bold text-foreground">{actualProgress.length > 0 ? Math.round(actualProgress.reduce((s, p) => s + (p.actual_progress_percent || 0), 0) / actualProgress.length) : 0}%</p>
        </div>
        <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
          <p className="text-xs text-muted-foreground mb-1">Blocked Features</p>
          <p className={`text-2xl font-bold ${blockedFeatures.length > 0 ? 'text-red-600' : 'text-foreground'}`}>{blockedFeatures.length}</p>
        </div>
      </div>

      {/* Planned vs Actual Effort */}
      <div className="rounded-xl p-6 bg-slate-50 dark:bg-[#1a1530] border border-border">
        <h2 className="text-base font-semibold text-foreground mb-4">Planned vs Actual Effort</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={effortData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#0F52BA" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Team Progress */}
      <div className="rounded-xl p-6 bg-slate-50 dark:bg-[#1a1530] border border-border">
        <h2 className="text-base font-semibold text-foreground mb-4">Team Progress</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={progressData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="progress" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Team Summary Table */}
      <div className="rounded-xl p-6 bg-slate-50 dark:bg-[#1a1530] border border-border overflow-x-auto">
        <h2 className="text-base font-semibold text-foreground mb-4">Team Breakdown</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Team</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">BE Planned</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">FE Planned</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Avg Progress</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Blocked</th>
            </tr>
          </thead>
          <tbody>
            {teamMetrics.map(tm => (
              <tr key={tm.teamId} className="border-b border-border/50 hover:bg-white/50 dark:hover:bg-[#2a1f45]">
                <td className="py-3 px-3 font-medium text-foreground">{tm.name}</td>
                <td className="py-3 px-3 text-foreground">{tm.bePlanned}w</td>
                <td className="py-3 px-3 text-foreground">{tm.fePlanned}w</td>
                <td className="py-3 px-3">
                  <span className={`font-semibold ${tm.avgProgress >= 75 ? 'text-green-600' : tm.avgProgress >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {tm.avgProgress}%
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span className={tm.blockedCount > 0 ? 'text-red-600 font-semibold' : 'text-foreground'}>
                    {tm.blockedCount}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Blocked Features */}
      {blockedFeatures.length > 0 && (
        <div className="rounded-xl p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h2 className="text-base font-semibold text-red-700 dark:text-red-400">Blocked Features ({blockedFeatures.length})</h2>
          </div>
          <div className="space-y-2">
            {blockedFeatures.map((feature, idx) => (
              <div key={idx} className="p-3 bg-white dark:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-900/40">
                <p className="font-medium text-foreground">{feature.featureTitle}</p>
                <p className="text-xs text-muted-foreground">{feature.teamName}</p>
                {feature.notes && <p className="text-xs text-red-700 dark:text-red-400 mt-1">{feature.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}