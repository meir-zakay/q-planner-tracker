import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Edit2 } from 'lucide-react';

export default function Tracking() {
  const { user, selectedYear, selectedQuarter } = useOutletContext();
  const qc = useQueryClient();
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [editingProgress, setEditingProgress] = useState(null);
  const [progressValue, setProgressValue] = useState('');

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const { data: features = [] } = useQuery({ queryKey: ['features', selectedYear, selectedQuarter], queryFn: () => base44.entities.Feature.filter({ year: selectedYear, quarter: selectedQuarter }) });
  const { data: signedPlan = null } = useQuery({ queryKey: ['signedPlan', selectedTeam?.id, selectedYear, selectedQuarter], queryFn: () => selectedTeam ? base44.entities.SignedQuarterPlan.filter({ team_id: selectedTeam.id, year: selectedYear, quarter: selectedQuarter }).then(r => r[0] || null) : null, enabled: !!selectedTeam });
  const { data: teamPlanEntries = [] } = useQuery({ queryKey: ['teamPlanEntries', selectedTeam?.id, selectedYear, selectedQuarter], queryFn: () => selectedTeam ? base44.entities.TeamPlanEntry.filter({ team_id: selectedTeam.id, year: selectedYear, quarter: selectedQuarter }) : [], enabled: !!selectedTeam });
  const { data: actualProgress = [] } = useQuery({ queryKey: ['actualProgress', selectedTeam?.id, selectedYear, selectedQuarter], queryFn: () => selectedTeam ? base44.entities.ActualProgress.filter({ team_id: selectedTeam.id, year: selectedYear, quarter: selectedQuarter }) : [], enabled: !!selectedTeam });

  const featureMap = useMemo(() => { const m = {}; features.forEach(f => { m[f.id] = f; }); return m; }, [features]);
  const progressMap = useMemo(() => { const m = {}; actualProgress.forEach(p => { m[p.feature_id] = p; }); return m; }, [actualProgress]);

  const updateProgressMutation = useMutation({
    mutationFn: async ({ featureId, percent }) => {
      const existing = progressMap[featureId];
      if (existing) {
        return base44.entities.ActualProgress.update(existing.id, { actual_progress_percent: percent });
      } else {
        return base44.entities.ActualProgress.create({
          team_id: selectedTeam.id,
          feature_id: featureId,
          quarter: selectedQuarter,
          year: selectedYear,
          actual_progress_percent: percent
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['actualProgress'] });
      setEditingProgress(null);
    }
  });

  const plannedFeatures = teamPlanEntries.map(entry => {
    const feat = featureMap[entry.feature_id];
    const actual = progressMap[entry.feature_id];
    const totalPlannedWeeks = (entry.be_effort_weeks || 0) + (entry.fe_effort_weeks || 0);
    const daysPerWeek = 5;
    const totalPlannedDays = totalPlannedWeeks * daysPerWeek;
    const daysSinceStart = Math.floor((new Date() - new Date(selectedYear, selectedQuarter.charCodeAt(1) - 1, 1)) / (1000 * 60 * 60 * 24));
    const quarterDays = 90;
    const expectedProgress = Math.min(100, Math.round((daysSinceStart / quarterDays) * 100));
    const actualPercent = actual?.actual_progress_percent || 0;
    const status = actualPercent > expectedProgress ? 'ahead' : actualPercent < expectedProgress - 10 ? 'behind' : 'on-track';

    return {
      id: entry.id,
      featureId: entry.feature_id,
      title: feat?.title || 'Unknown',
      plannedWeeks: totalPlannedWeeks,
      expectedProgress,
      actualProgress: actualPercent,
      status
    };
  });

  if (!selectedTeam) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            Tracking for <span className="text-primary font-medium">{selectedQuarter} {selectedYear}</span>
          </p>
        </div>
        <div className="rounded-xl p-8 bg-slate-50 dark:bg-[#1a1530] border border-border flex flex-col items-center gap-4">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
          <p className="text-center text-muted-foreground">Select a team to view tracking data</p>
          <Select value={selectedTeam?.id || ''} onValueChange={id => setSelectedTeam(teams.find(t => t.id === id))}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Choose a team..." />
            </SelectTrigger>
            <SelectContent>
              {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {selectedTeam.name} · <span className="text-primary font-medium">{selectedQuarter} {selectedYear}</span>
          </p>
        </div>
        <Select value={selectedTeam?.id || ''} onValueChange={id => setSelectedTeam(teams.find(t => t.id === id))}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!signedPlan ? (
        <div className="rounded-xl p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
          <p className="text-sm text-amber-900 dark:text-amber-100">This team's plan for {selectedQuarter} {selectedYear} has not been signed yet. Sign the plan on the Team Plan page to enable tracking.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4">
            {plannedFeatures.length === 0 ? (
              <div className="rounded-xl p-8 bg-slate-50 dark:bg-[#1a1530] border border-border text-center text-muted-foreground">
                No features planned for this team this quarter
              </div>
            ) : (
              plannedFeatures.map(feature => (
                <div key={feature.id} className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground mb-2">{feature.title}</h3>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Planned Effort</p>
                          <p className="font-medium text-foreground">{feature.plannedWeeks}w</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Expected Progress</p>
                          <p className="font-medium text-foreground">{feature.expectedProgress}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Actual Progress</p>
                          <p className={`font-medium ${feature.status === 'ahead' ? 'text-green-600' : feature.status === 'behind' ? 'text-red-600' : 'text-blue-600'}`}>
                            {feature.actualProgress}%
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Expected</span>
                          <span>Actual</span>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className="h-2 rounded-full bg-blue-500" style={{ width: `${feature.expectedProgress}%` }} />
                          </div>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className={`h-2 rounded-full ${feature.status === 'ahead' ? 'bg-green-500' : feature.status === 'behind' ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${feature.actualProgress}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditingProgress(feature); setProgressValue(String(feature.actualProgress)); }}
                      className="shrink-0 mt-2"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Dialog open={!!editingProgress} onOpenChange={(o) => !o && setEditingProgress(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Progress: {editingProgress?.title}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Actual Progress (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={progressValue}
                onChange={e => setProgressValue(e.target.value)}
                placeholder="0"
                className="text-lg"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProgress(null)}>Cancel</Button>
            <Button
              onClick={() => updateProgressMutation.mutate({ featureId: editingProgress.featureId, percent: Number(progressValue) })}
              disabled={updateProgressMutation.isPending}
            >
              Save Progress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}