import React, { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useQuarterSelection } from '@/components/QuarterContext';
import ObjectivePieChart from '@/components/ObjectivePieChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, ListChecks, CalendarRange, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const { userRole } = useOutletContext();
  const { selectedYear, selectedQuarter } = useQuarterSelection();

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const { data: features = [] } = useQuery({ queryKey: ['features', selectedYear, selectedQuarter], queryFn: () => base44.entities.Feature.filter({ year: selectedYear, quarter: selectedQuarter }) });
  const { data: objectives = [] } = useQuery({ queryKey: ['objectives'], queryFn: () => base44.entities.Objective.list() });
  const { data: allEntries = [] } = useQuery({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter], queryFn: () => base44.entities.TeamPlanEntry.filter({ year: selectedYear, quarter: selectedQuarter }) });

  const featureMap = useMemo(() => {
    const m = {};
    features.forEach(f => { m[f.id] = f; });
    return m;
  }, [features]);

  const totalBECapacity = teams.reduce((s, t) => s + (t.be_capacity_weeks || 0), 0);
  const totalFECapacity = teams.reduce((s, t) => s + (t.fe_capacity_weeks || 0), 0);

  const effortByObjective = useMemo(() => {
    const map = {};
    allEntries.forEach(entry => {
      const feat = featureMap[entry.feature_id];
      if (!feat) return;
      const obj = feat.objective || 'Unknown';
      const effort = (entry.be_effort_weeks || 0) + (entry.fe_effort_weeks || 0);
      map[obj] = (map[obj] || 0) + effort;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [allEntries, featureMap]);

  const totalUsed = allEntries.reduce((s, e) => s + (e.be_effort_weeks || 0) + (e.fe_effort_weeks || 0), 0);
  const totalCapacity = totalBECapacity + totalFECapacity;

  const stats = [
    { label: 'Teams', value: teams.length, icon: Users, color: 'text-indigo-500' },
    { label: 'Features', value: features.length, icon: ListChecks, color: 'text-emerald-500' },
    { label: 'BE Capacity', value: `${totalBECapacity}w`, icon: CalendarRange, color: 'text-amber-500' },
    { label: 'FE Capacity', value: `${totalFECapacity}w`, icon: TrendingUp, color: 'text-cyan-500' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">{selectedQuarter} {selectedYear} — All Teams Overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                </div>
                <stat.icon className={`w-8 h-8 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Effort by Objective</CardTitle>
            <p className="text-xs text-muted-foreground">{selectedQuarter} {selectedYear} — All Teams</p>
          </CardHeader>
          <CardContent>
            <ObjectivePieChart
              data={effortByObjective}
              objectives={objectives}
              totalCapacity={totalCapacity}
              usedCapacity={totalUsed}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teams Capacity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teams.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No teams created yet</p>}
              {teams.map(team => {
                const teamEntries = allEntries.filter(e => e.team_id === team.id);
                const beUsed = teamEntries.reduce((s, e) => s + (e.be_effort_weeks || 0), 0);
                const feUsed = teamEntries.reduce((s, e) => s + (e.fe_effort_weeks || 0), 0);
                const bePct = team.be_capacity_weeks > 0 ? Math.min(100, Math.round((beUsed / team.be_capacity_weeks) * 100)) : 0;
                const fePct = team.fe_capacity_weeks > 0 ? Math.min(100, Math.round((feUsed / team.fe_capacity_weeks) * 100)) : 0;
                return (
                  <div key={team.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-foreground">{team.name}</span>
                      <span className="text-muted-foreground">{team.team_lead_name || 'No lead'}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-6 text-muted-foreground">BE</span>
                        <div className="flex-1 bg-secondary rounded-full h-2">
                          <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${bePct}%` }} />
                        </div>
                        <span className="w-16 text-right text-muted-foreground">{beUsed}/{team.be_capacity_weeks}w</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-6 text-muted-foreground">FE</span>
                        <div className="flex-1 bg-secondary rounded-full h-2">
                          <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${fePct}%` }} />
                        </div>
                        <span className="w-16 text-right text-muted-foreground">{feUsed}/{team.fe_capacity_weeks}w</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}