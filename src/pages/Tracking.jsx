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
  const [selectedTeamId, setSelectedTeamId] = useState(() => localStorage.getItem('selectedTeamId') || '');
  const [editingProgress, setEditingProgress] = useState(null);
  const [progressForm, setProgressForm] = useState({ percent: '', startSprint: '', endSprint: '', status: "Didn't Start" });

  const { data: teamsRaw = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const teams = useMemo(() => [...teamsRaw].sort((a, b) => a.name.localeCompare(b.name)), [teamsRaw]);
  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  
  const { data: features = [] } = useQuery({ queryKey: ['features', selectedYear, selectedQuarter], queryFn: () => base44.entities.Feature.filter({ year: selectedYear, quarter: selectedQuarter }) });
  const { data: quarterConfigs = [] } = useQuery({ queryKey: ['quarterConfigs'], queryFn: () => base44.entities.QuarterConfig.list() });
  const { data: signedPlan = null } = useQuery({ queryKey: ['signedPlan', selectedTeamId, selectedYear, selectedQuarter], queryFn: () => selectedTeamId ? base44.entities.SignedQuarterPlan.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter }).then(r => r[0] || null) : null, enabled: !!selectedTeamId });
  const { data: teamPlanEntries = [] } = useQuery({ queryKey: ['teamPlanEntries', selectedTeamId, selectedYear, selectedQuarter], queryFn: () => selectedTeamId ? base44.entities.TeamPlanEntry.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter }) : [], enabled: !!selectedTeamId });
  const { data: actualProgress = [] } = useQuery({ queryKey: ['actualProgress', selectedTeamId, selectedYear, selectedQuarter], queryFn: () => selectedTeamId ? base44.entities.ActualProgress.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter }) : [], enabled: !!selectedTeamId });

  const handleTeamChange = (id) => { setSelectedTeamId(id); localStorage.setItem('selectedTeamId', id); };

  const sprints = useMemo(() => {
    const config = quarterConfigs.find(c => c.year === selectedYear && c.quarter === selectedQuarter);
    return config?.sprints || ['S1','S2','S3','S4','S5','S6'];
  }, [quarterConfigs, selectedYear, selectedQuarter]);

  const featureMap = useMemo(() => { const m = {}; features.forEach(f => { m[f.id] = f; }); return m; }, [features]);
  const progressMap = useMemo(() => { const m = {}; actualProgress.forEach(p => { m[p.feature_id] = p; }); return m; }, [actualProgress]);

  const updateProgressMutation = useMutation({
    mutationFn: async ({ featureId, percent, startSprint, endSprint, plannedStart, plannedEnd, status }) => {
      const existing = progressMap[featureId];
      const data = { 
        actual_progress_percent: percent,
        actual_start_sprint: startSprint || plannedStart,
        actual_end_sprint: endSprint || plannedEnd,
        status: status || "Didn't Start"
      };
      
      if (existing) {
        return base44.entities.ActualProgress.update(existing.id, data);
      } else {
        return base44.entities.ActualProgress.create({
          team_id: selectedTeamId,
          feature_id: featureId,
          quarter: selectedQuarter,
          year: selectedYear,
          ...data
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['actualProgress'] });
      setEditingProgress(null);
    }
  });

  const getSprintRange = (entry) => {
    const activeSprints = sprints.filter(s => {
      const alloc = entry.sprint_allocations?.find(a => a.sprint === s);
      return (alloc?.be_weeks || 0) + (alloc?.fe_weeks || 0) > 0;
    });
    if (activeSprints.length === 0) return null;
    return { start: activeSprints[0], end: activeSprints[activeSprints.length - 1] };
  };

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
    const sprintRange = getSprintRange(entry);

    const actualRange = {
      start: actual?.actual_start_sprint || sprintRange?.start || '',
      end: actual?.actual_end_sprint || sprintRange?.end || ''
    };

    return {
      id: entry.id,
      featureId: entry.feature_id,
      title: feat?.title || 'Unknown',
      plannedWeeks: totalPlannedWeeks,
      expectedProgress,
      actualProgress: actualPercent,
      status,
      sprintRange,
      actualRange,
      entry,
      actual
    };
  });

  if (!selectedTeamId) {
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
          <Select value={selectedTeamId} onValueChange={handleTeamChange}>
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
      {selectedTeamId && (
        <Select value={selectedTeamId} onValueChange={handleTeamChange}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

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
                <div key={feature.id} className="rounded-xl p-2 bg-slate-50 dark:bg-[#1a1530] border border-border transition-all duration-200 hover:shadow-md hover:border-primary/40 hover:bg-slate-100 dark:hover:bg-[#2d1f47]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground mb-1.5">{feature.title}</h3>
                      <div className="grid grid-cols-5 gap-3 text-sm">
                        <div className="text-left">
                          <p className="text-xs text-muted-foreground">Plan</p>
                          <p className="font-medium text-foreground">{feature.sprintRange ? `${feature.sprintRange.start} → ${feature.sprintRange.end}` : '—'}</p>
                        </div>
                        <div className="text-left">
                          <p className="text-xs text-muted-foreground">Planned Effort</p>
                          <p className="font-medium text-foreground">{feature.plannedWeeks}w</p>
                        </div>
                        <div className="text-left">
                          <p className="text-xs text-muted-foreground">Expected Progress</p>
                          <p className="font-medium text-foreground">{feature.expectedProgress}%</p>
                        </div>
                        <div className="text-left">
                          <p className="text-xs text-muted-foreground">Actual</p>
                          <p className="font-medium" style={{
                            color: sprints.indexOf(feature.actualRange?.end) > sprints.indexOf(feature.sprintRange?.end) ? '#dc2626'
                              : sprints.indexOf(feature.actualRange?.start) > sprints.indexOf(feature.sprintRange?.start) ? '#f97316'
                              : '#16a34a'
                          }}>
                            {feature.actualRange?.start && feature.actualRange?.end ? `${feature.actualRange.start} → ${feature.actualRange.end}` : '—'}
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="text-xs text-muted-foreground">Actual Progress</p>
                          <p className={`font-medium ${feature.status === 'ahead' ? 'text-green-600' : feature.status === 'behind' ? 'text-red-600' : 'text-blue-600'}`}>
                            {feature.actualProgress}%
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
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
                       onClick={() => { setEditingProgress(feature); setProgressForm({ percent: String(feature.actualProgress), startSprint: feature.actualRange?.start || '', endSprint: feature.actualRange?.end || '' }); }}
                       className="shrink-0 mt-0"
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Start Sprint</label>
                <Select value={progressForm.startSprint} onValueChange={v => setProgressForm(p => ({ ...p, startSprint: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sprint" />
                  </SelectTrigger>
                  <SelectContent>
                    {sprints.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">End Sprint</label>
                <Select value={progressForm.endSprint} onValueChange={v => setProgressForm(p => ({ ...p, endSprint: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sprint" />
                  </SelectTrigger>
                  <SelectContent>
                    {sprints.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Actual Progress (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={progressForm.percent}
                onChange={e => setProgressForm(p => ({ ...p, percent: e.target.value }))}
                placeholder="0"
                className="text-lg"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProgress(null)}>Cancel</Button>
            <Button
              onClick={() => updateProgressMutation.mutate({ 
                featureId: editingProgress.featureId, 
                percent: Number(progressForm.percent), 
                startSprint: progressForm.startSprint, 
                endSprint: progressForm.endSprint,
                plannedStart: editingProgress.sprintRange?.start,
                plannedEnd: editingProgress.sprintRange?.end
              })}
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