import React, { useState, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Edit2, StickyNote } from 'lucide-react';

export default function Tracking() {
  const { user, userRole, selectedYear, selectedQuarter } = useOutletContext();
  const qc = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState(() => localStorage.getItem('selectedTeamId') || '');
  const [editingProgress, setEditingProgress] = useState(null);
  const [viewingNotes, setViewingNotes] = useState(null);
  const [progressForm, setProgressForm] = useState({ percent: '', startSprint: '', endSprint: '', status: "Didn't Start", notes: '' });

  const { selectedCrew } = useOutletContext();
  const { data: teamsRaw = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const teams = useMemo(() => {
    const filtered = selectedCrew ? teamsRaw.filter(t => t.crew === selectedCrew) : teamsRaw;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [teamsRaw, selectedCrew]);

  // Reset selected team when crew changes and the team no longer belongs to the new crew
  useEffect(() => {
    if (selectedTeamId && teams.length > 0 && !teams.find(t => t.id === selectedTeamId)) {
      setSelectedTeamId('');
      localStorage.removeItem('selectedTeamId');
      qc.removeQueries({ queryKey: ['teamPlanEntries'] });
      qc.removeQueries({ queryKey: ['actualProgress'] });
      qc.removeQueries({ queryKey: ['signedPlan'] });
    }
  }, [selectedCrew, teams]);

  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const isAdmin = userRole === 'app_admin' || userRole === 'admin';
  const isTeamLead = selectedTeam?.team_lead_email === user?.email;
  const canEdit = isAdmin || isTeamLead;
  
  const { data: features = [] } = useQuery({ queryKey: ['features', selectedYear, selectedQuarter], queryFn: () => base44.entities.Feature.filter({ year: selectedYear, quarter: selectedQuarter }) });
  const { data: quarterConfigs = [] } = useQuery({ queryKey: ['quarterConfigs'], queryFn: () => base44.entities.QuarterConfig.list() });
  const { data: signedPlan = null } = useQuery({ queryKey: ['signedPlan', selectedTeamId, selectedYear, selectedQuarter], queryFn: () => selectedTeamId ? base44.entities.SignedQuarterPlan.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter }).then(r => r[0] || null) : null, enabled: !!selectedTeamId });
  const { data: teamPlanEntriesRaw = [] } = useQuery({ queryKey: ['teamPlanEntries', selectedTeamId, selectedYear, selectedQuarter], queryFn: () => selectedTeamId ? base44.entities.TeamPlanEntry.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter }) : [], enabled: !!selectedTeamId });
  const { data: actualProgressRaw = [] } = useQuery({ queryKey: ['actualProgress', selectedTeamId, selectedYear, selectedQuarter], queryFn: () => selectedTeamId ? base44.entities.ActualProgress.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter }) : [], enabled: !!selectedTeamId });

  // Guard: only use data that actually belongs to the current selected team
  const teamPlanEntries = selectedTeamId ? teamPlanEntriesRaw.filter(e => e.team_id === selectedTeamId) : [];
  const actualProgress = selectedTeamId ? actualProgressRaw.filter(p => p.team_id === selectedTeamId) : [];

  const handleTeamChange = (id) => { setSelectedTeamId(id); localStorage.setItem('selectedTeamId', id); };

  const sprints = useMemo(() => {
    const config = quarterConfigs.find(c => c.year === selectedYear && c.quarter === selectedQuarter);
    return config?.sprints || ['S1','S2','S3','S4','S5','S6'];
  }, [quarterConfigs, selectedYear, selectedQuarter]);

  const featureMap = useMemo(() => { const m = {}; features.forEach(f => { m[f.id] = f; }); return m; }, [features]);
  const progressMap = useMemo(() => { const m = {}; actualProgress.forEach(p => { m[p.feature_id] = p; }); return m; }, [actualProgress]);

  const updateProgressMutation = useMutation({
    mutationFn: async ({ featureId, percent, startSprint, endSprint, plannedStart, plannedEnd, status, notes = '' }) => {
      const existing = progressMap[featureId];
      let finalStatus = status;
      
      // Auto-update status to "In Progress" if progress > 0 and current status is "Didn't Start"
      if (percent > 0 && status === "Didn't Start") {
        finalStatus = "In Progress";
      }
      
      const data = { 
        actual_progress_percent: percent,
        actual_start_sprint: startSprint || plannedStart,
        actual_end_sprint: endSprint || plannedEnd,
        status: finalStatus,
        notes: notes
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
      setNotesOpen(null);
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

  const plannedFeatures = [...teamPlanEntries]
    .filter(entry => entry.excluded_from_allocation !== true)
    .sort((a, b) => {
      // Sort by start sprint index (timeline order), fall back to sort_order/priority
      const getStartIdx = (entry) => {
        const activeSprints = sprints.filter(s => {
          const alloc = entry.sprint_allocations?.find(a => a.sprint === s);
          return (alloc?.be_weeks || 0) + (alloc?.fe_weeks || 0) > 0;
        });
        return activeSprints.length > 0 ? sprints.indexOf(activeSprints[0]) : 999;
      };
      const si = getStartIdx(a);
      const sj = getStartIdx(b);
      if (si !== sj) return si - sj;
      // Tie-break: shorter span first
      const getEndIdx = (entry) => {
        const activeSprints = sprints.filter(s => {
          const alloc = entry.sprint_allocations?.find(a => a.sprint === s);
          return (alloc?.be_weeks || 0) + (alloc?.fe_weeks || 0) > 0;
        });
        return activeSprints.length > 0 ? sprints.indexOf(activeSprints[activeSprints.length - 1]) : 999;
      };
      const ei = getEndIdx(a);
      const ej = getEndIdx(b);
      if (ei !== ej) return ei - ej;
      // Final tie-break by sort_order / priority
      const oa = a.sort_order ?? featureMap[a.feature_id]?.priority ?? 999;
      const ob = b.sort_order ?? featureMap[b.feature_id]?.priority ?? 999;
      return oa - ob;
    })
    .map(entry => {
    const feat = featureMap[entry.feature_id];
    const actual = progressMap[entry.feature_id];
    const totalPlannedWeeks = (entry.be_effort_weeks || 0) + (entry.fe_effort_weeks || 0);
    const daysPerWeek = 5;
    const totalPlannedDays = totalPlannedWeeks * daysPerWeek;
    const daysSinceStart = Math.max(0, Math.floor((new Date() - new Date(selectedYear, (parseInt(selectedQuarter[1]) - 1) * 3, 1)) / (1000 * 60 * 60 * 24)));
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
      healthStatus: status,
      sprintRange,
      actualRange,
      featureStatus: actual?.status || "Didn't Start",
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
                <div key={feature.id} className="rounded-xl p-4 bg-panel border border-border transition-all hover:brightness-125 hover:border-indigo-500/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="font-medium text-foreground">{feature.title}</h3>
                      </div>
                      <div className="flex gap-8 text-sm">
                        <div className="text-left w-32">
                          <p className="text-xs text-muted-foreground">Plan</p>
                          <p className="font-medium text-foreground truncate">{feature.sprintRange ? `${feature.sprintRange.start} → ${feature.sprintRange.end}` : '—'}</p>
                        </div>
                        <div className="text-left w-32">
                          <p className="text-xs text-muted-foreground">Planned Effort</p>
                          <p className="font-medium text-foreground">{feature.plannedWeeks}w</p>
                        </div>
                        <div className="text-left w-36">
                          <p className="text-xs text-muted-foreground">Expected Progress</p>
                          <p className="font-medium text-foreground">{feature.expectedProgress}%</p>
                        </div>
                        <div className="text-left w-36">
                          <p className="text-xs text-muted-foreground">Actual</p>
                          <p className="font-medium truncate" style={{
                            color: sprints.indexOf(feature.actualRange?.end) > sprints.indexOf(feature.sprintRange?.end) ? '#dc2626'
                              : sprints.indexOf(feature.actualRange?.start) > sprints.indexOf(feature.sprintRange?.start) ? '#f97316'
                              : '#16a34a'
                          }}>
                            {feature.actualRange?.start && feature.actualRange?.end ? `${feature.actualRange.start} → ${feature.actualRange.end}` : '—'}
                          </p>
                        </div>
                        <div className="text-left w-36">
                          <p className="text-xs text-muted-foreground">Actual Progress</p>
                          <p className={`font-medium ${feature.healthStatus === 'ahead' ? 'text-green-600' : feature.healthStatus === 'behind' ? 'text-red-600' : 'text-blue-600'}`}>
                            {feature.actualProgress}%
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex gap-2">
                           <div className="flex-1 bg-muted rounded-full h-2">
                             <div className="h-2 rounded-full bg-blue-500" style={{ width: `${feature.expectedProgress}%` }} />
                           </div>
                           <div className="flex-1 bg-muted rounded-full h-2">
                             <div className={`h-2 rounded-full ${feature.healthStatus === 'ahead' ? 'bg-green-500' : feature.healthStatus === 'behind' ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${feature.actualProgress}%` }} />
                           </div>
                         </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 shrink-0 pt-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700 dark:bg-slate-800 whitespace-nowrap ${
                        feature.featureStatus === 'Done' ? 'text-green-400' :
                        feature.featureStatus === 'Blocked' ? 'text-red-400' :
                        feature.featureStatus === 'On Hold' ? 'text-yellow-400' :
                        feature.featureStatus === 'Testing' ? 'text-blue-400' :
                        feature.featureStatus === 'In Progress' ? 'text-purple-400' :
                        'text-slate-300'
                      }`}>
                        {feature.featureStatus}
                      </span>
                      {feature.actual?.notes ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewingNotes(feature)}
                          className="shrink-0 text-blue-500 hover:text-blue-600 h-6 w-6"
                          title="View note"
                        >
                          <StickyNote className="w-4 h-4 fill-current" />
                        </Button>
                      ) : (
                        <div className="w-6 h-6 flex items-center justify-center text-muted-foreground/30">
                          <StickyNote className="w-4 h-4" />
                        </div>
                      )}
                      {canEdit && (
                        <Button
                           variant="ghost"
                           size="icon"
                           onClick={() => { setEditingProgress(feature); setProgressForm({ percent: String(feature.actualProgress), startSprint: feature.actualRange?.start || '', endSprint: feature.actualRange?.end || '', status: feature.featureStatus, notes: feature.actual?.notes || '' }); }}
                           className="shrink-0 h-6 w-6"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Dialog open={!!viewingNotes} onOpenChange={(o) => !o && setViewingNotes(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{viewingNotes?.title}</DialogTitle></DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-3">Note:</p>
            <p className="text-foreground whitespace-pre-wrap">{viewingNotes?.actual?.notes}</p>
          </div>
        </DialogContent>
      </Dialog>

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
              <label className="text-sm font-medium text-foreground">Status</label>
              <Select value={progressForm.status} onValueChange={v => setProgressForm(p => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Didn't Start">Didn't Start</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="On Hold">On Hold</SelectItem>
                  <SelectItem value="Blocked">Blocked</SelectItem>
                  <SelectItem value="Testing">Testing</SelectItem>
                  <SelectItem value="Done">Done</SelectItem>
                </SelectContent>
              </Select>
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Notes</label>
              <textarea
                value={progressForm.notes}
                onChange={(e) => setProgressForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Add notes about this feature's progress..."
                className="w-full h-24 p-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
               status: progressForm.status,
               plannedStart: editingProgress.sprintRange?.start,
               plannedEnd: editingProgress.sprintRange?.end,
               notes: progressForm.notes
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