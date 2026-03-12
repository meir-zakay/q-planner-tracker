import React, { useState, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useQuarterSelection } from '@/components/QuarterContext';
import ObjectivePieChart from '@/components/ObjectivePieChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Info, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const DEFAULT_SPRINTS = { Q1: ['S1','S2','S3','S4','S5','S6'], Q2: ['S7','S8','S9','S10','S11','S12'], Q3: ['S13','S14','S15','S16','S17','S18'], Q4: ['S19','S20','S21','S22','S23','S24'] };

function distributeEffort(totalEffort, sprintCapacities) {
  const allocations = sprintCapacities.map(() => 0);
  let remaining = totalEffort;
  for (let i = 0; i < sprintCapacities.length && remaining > 0; i++) {
    const alloc = Math.min(remaining, sprintCapacities[i]);
    allocations[i] = alloc;
    remaining -= alloc;
  }
  return allocations;
}

export default function TeamPlan() {
  const { user, userRole } = useOutletContext();
  const { selectedYear, selectedQuarter } = useQuarterSelection();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [addFeatureOpen, setAddFeatureOpen] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState('');
  const [effortForm, setEffortForm] = useState({ be: '', fe: '' });
  const [editCell, setEditCell] = useState(null); // {entryId, sprintIdx, type}
  const [editCellValue, setEditCellValue] = useState('');

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const { data: allFeatures = [] } = useQuery({
    queryKey: ['features', selectedYear, selectedQuarter],
    queryFn: () => base44.entities.Feature.filter({ year: selectedYear, quarter: selectedQuarter }),
  });
  const { data: objectives = [] } = useQuery({ queryKey: ['objectives'], queryFn: () => base44.entities.Objective.list() });
  const { data: quarterConfigs = [] } = useQuery({ queryKey: ['quarterConfigs'], queryFn: () => base44.entities.QuarterConfig.list() });

  const { data: entries = [] } = useQuery({
    queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId],
    queryFn: () => selectedTeamId
      ? base44.entities.TeamPlanEntry.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter })
      : Promise.resolve([]),
    enabled: !!selectedTeamId,
  });

  const selectedTeam = teams.find(t => t.id === selectedTeamId);

  // Determine if current user can edit this team's plan
  const isAdmin = userRole === 'admin';
  const isTeamLead = selectedTeam?.team_lead_email === user?.email;
  const canEdit = isAdmin || isTeamLead;

  // Get sprints for the selected quarter
  const sprints = useMemo(() => {
    const config = quarterConfigs.find(c => c.year === selectedYear && c.quarter === selectedQuarter);
    return config?.sprints || DEFAULT_SPRINTS[selectedQuarter] || ['S1','S2','S3','S4','S5','S6'];
  }, [quarterConfigs, selectedYear, selectedQuarter]);

  const numSprints = sprints.length;

  // Per-sprint capacities
  const beSprintCap = selectedTeam ? (selectedTeam.be_capacity_weeks || 0) / numSprints : 0;
  const feSprintCap = selectedTeam ? (selectedTeam.fe_capacity_weeks || 0) / numSprints : 0;

  // Sort entries by feature priority
  const featureMap = useMemo(() => {
    const m = {};
    allFeatures.forEach(f => { m[f.id] = f; });
    return m;
  }, [allFeatures]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const pa = featureMap[a.feature_id]?.priority || 999;
      const pb = featureMap[b.feature_id]?.priority || 999;
      return pa - pb;
    });
  }, [entries, featureMap]);

  // Already-added feature IDs
  const addedFeatureIds = useMemo(() => new Set(entries.map(e => e.feature_id)), [entries]);

  // Available features to add
  const availableFeatures = useMemo(() => {
    return allFeatures.filter(f => !addedFeatureIds.has(f.id)).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }, [allFeatures, addedFeatureIds]);

  // Compute running totals per sprint
  const sprintBEUsed = useMemo(() => {
    const totals = Array(numSprints).fill(0);
    sortedEntries.forEach(entry => {
      if (!entry.sprint_allocations) return;
      sprints.forEach((s, i) => {
        const alloc = entry.sprint_allocations.find(a => a.sprint === s);
        totals[i] += alloc?.be_weeks || 0;
      });
    });
    return totals;
  }, [sortedEntries, sprints]);

  const sprintFEUsed = useMemo(() => {
    const totals = Array(numSprints).fill(0);
    sortedEntries.forEach(entry => {
      if (!entry.sprint_allocations) return;
      sprints.forEach((s, i) => {
        const alloc = entry.sprint_allocations.find(a => a.sprint === s);
        totals[i] += alloc?.fe_weeks || 0;
      });
    });
    return totals;
  }, [sortedEntries, sprints]);

  const addEntryMutation = useMutation({
    mutationFn: async ({ featureId, beEffort, feEffort }) => {
      // Compute remaining BE/FE capacity per sprint considering existing allocations
      const beRemainingPerSprint = sprints.map((_, i) => Math.max(0, beSprintCap - sprintBEUsed[i]));
      const feRemainingPerSprint = sprints.map((_, i) => Math.max(0, feSprintCap - sprintFEUsed[i]));

      const beAllocs = distributeEffort(beEffort, beRemainingPerSprint);
      const feAllocs = distributeEffort(feEffort, feRemainingPerSprint);

      const sprint_allocations = sprints.map((s, i) => ({ sprint: s, be_weeks: beAllocs[i], fe_weeks: feAllocs[i] }));

      return base44.entities.TeamPlanEntry.create({
        team_id: selectedTeamId,
        feature_id: featureId,
        be_effort_weeks: beEffort,
        fe_effort_weeks: feEffort,
        sprint_allocations,
        year: selectedYear,
        quarter: selectedQuarter,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] });
      setAddFeatureOpen(false);
      setSelectedFeatureId('');
      setEffortForm({ be: '', fe: '' });
      toast({ title: 'Feature added to plan' });
    },
  });

  const removeEntryMutation = useMutation({
    mutationFn: (id) => base44.entities.TeamPlanEntry.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }),
  });

  const updateCellMutation = useMutation({
    mutationFn: async ({ entry, sprintIdx, type, newVal }) => {
      const newAllocs = sprints.map((s, i) => {
        const existing = entry.sprint_allocations?.find(a => a.sprint === s) || { sprint: s, be_weeks: 0, fe_weeks: 0 };
        if (i === sprintIdx) {
          return { ...existing, [type === 'be' ? 'be_weeks' : 'fe_weeks']: newVal };
        }
        return existing;
      });
      // Recalculate total effort from allocations
      const newBE = newAllocs.reduce((s, a) => s + (a.be_weeks || 0), 0);
      const newFE = newAllocs.reduce((s, a) => s + (a.fe_weeks || 0), 0);
      return base44.entities.TeamPlanEntry.update(entry.id, {
        sprint_allocations: newAllocs,
        be_effort_weeks: newBE,
        fe_effort_weeks: newFE,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] });
      setEditCell(null);
    },
  });

  const effortByObjective = useMemo(() => {
    const map = {};
    sortedEntries.forEach(entry => {
      const feat = featureMap[entry.feature_id];
      if (!feat) return;
      const obj = feat.objective || 'Unknown';
      const effort = (entry.be_effort_weeks || 0) + (entry.fe_effort_weeks || 0);
      map[obj] = (map[obj] || 0) + effort;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [sortedEntries, featureMap]);

  const totalUsed = sortedEntries.reduce((s, e) => s + (e.be_effort_weeks || 0) + (e.fe_effort_weeks || 0), 0);
  const totalCapacity = (selectedTeam?.be_capacity_weeks || 0) + (selectedTeam?.fe_capacity_weeks || 0);

  const objectiveColor = (name) => {
    const obj = objectives.find(o => o.name === name);
    return obj?.color || '#94a3b8';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Plan</h1>
          <p className="text-sm text-muted-foreground mt-1">{selectedQuarter} {selectedYear} — Sprint Allocation</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select a team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {canEdit && selectedTeamId && (
            <Button onClick={() => setAddFeatureOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />Add Feature
            </Button>
          )}
        </div>
      </div>

      {!selectedTeamId ? (
        <div className="text-center py-20 text-muted-foreground">
          <Info className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Select a team to view their plan</p>
        </div>
      ) : (
        <>
          {selectedTeam && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Team Lead', value: selectedTeam.team_lead_name || 'None' },
                { label: 'BE Devs', value: `${selectedTeam.be_developers || 0}` },
                { label: `BE Capacity (${selectedQuarter})`, value: `${selectedTeam.be_capacity_weeks || 0}w (${beSprintCap.toFixed(1)}w/sprint)` },
                { label: `FE Capacity (${selectedQuarter})`, value: `${selectedTeam.fe_capacity_weeks || 0}w (${feSprintCap.toFixed(1)}w/sprint)` },
              ].map(stat => (
                <Card key={stat.label}>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Sprint Allocation Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sprint Allocations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-8">#</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground min-w-48">Feature</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-20">Obj.</th>
                      <th className="text-center px-2 py-2.5 font-medium text-muted-foreground w-16">Total BE</th>
                      <th className="text-center px-2 py-2.5 font-medium text-muted-foreground w-16">Total FE</th>
                      {sprints.map(s => (
                        <th key={s} className="text-center px-2 py-2.5 font-medium text-muted-foreground w-20" colSpan={2}>
                          {s}
                        </th>
                      ))}
                      {canEdit && <th className="w-10" />}
                    </tr>
                    <tr className="border-b border-border bg-muted/20">
                      <th colSpan={5} />
                      {sprints.map(s => (
                        <React.Fragment key={s}>
                          <th className="text-center px-1 py-1 text-[10px] text-indigo-500 font-medium">BE</th>
                          <th className="text-center px-1 py-1 text-[10px] text-emerald-500 font-medium">FE</th>
                        </React.Fragment>
                      ))}
                      {canEdit && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEntries.map((entry) => {
                      const feat = featureMap[entry.feature_id];
                      if (!feat) return null;
                      return (
                        <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-2 text-muted-foreground">{feat.priority}</td>
                          <td className="px-4 py-2">
                            <div>
                              <p className="font-medium text-foreground">{feat.title}</p>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            {feat.objective && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white" style={{ backgroundColor: objectiveColor(feat.objective) }}>
                                {feat.objective}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-indigo-500">{entry.be_effort_weeks || 0}w</td>
                          <td className="px-2 py-2 text-center font-semibold text-emerald-500">{entry.fe_effort_weeks || 0}w</td>
                          {sprints.map((s, i) => {
                            const alloc = entry.sprint_allocations?.find(a => a.sprint === s) || { be_weeks: 0, fe_weeks: 0 };
                            const beKey = `${entry.id}-${i}-be`;
                            const feKey = `${entry.id}-${i}-fe`;
                            return (
                              <React.Fragment key={s}>
                                <td className="px-1 py-2 text-center">
                                  {canEdit && editCell?.key === beKey ? (
                                    <Input
                                      autoFocus
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      value={editCellValue}
                                      onChange={e => setEditCellValue(e.target.value)}
                                      onBlur={() => { updateCellMutation.mutate({ entry, sprintIdx: i, type: 'be', newVal: Number(editCellValue) }); }}
                                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditCell(null); }}
                                      className="h-6 w-14 text-center text-xs p-0 border-indigo-300"
                                    />
                                  ) : (
                                    <span
                                      className={`inline-block px-1.5 rounded ${alloc.be_weeks > 0 ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-medium' : 'text-muted-foreground'} ${canEdit ? 'cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900' : ''}`}
                                      onClick={canEdit ? () => { setEditCell({ key: beKey }); setEditCellValue(String(alloc.be_weeks || 0)); } : undefined}
                                    >
                                      {alloc.be_weeks > 0 ? `${alloc.be_weeks}` : '—'}
                                    </span>
                                  )}
                                </td>
                                <td className="px-1 py-2 text-center">
                                  {canEdit && editCell?.key === feKey ? (
                                    <Input
                                      autoFocus
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      value={editCellValue}
                                      onChange={e => setEditCellValue(e.target.value)}
                                      onBlur={() => { updateCellMutation.mutate({ entry, sprintIdx: i, type: 'fe', newVal: Number(editCellValue) }); }}
                                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditCell(null); }}
                                      className="h-6 w-14 text-center text-xs p-0 border-emerald-300"
                                    />
                                  ) : (
                                    <span
                                      className={`inline-block px-1.5 rounded ${alloc.fe_weeks > 0 ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground'} ${canEdit ? 'cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900' : ''}`}
                                      onClick={canEdit ? () => { setEditCell({ key: feKey }); setEditCellValue(String(alloc.fe_weeks || 0)); } : undefined}
                                    >
                                      {alloc.fe_weeks > 0 ? `${alloc.fe_weeks}` : '—'}
                                    </span>
                                  )}
                                </td>
                              </React.Fragment>
                            );
                          })}
                          {canEdit && (
                            <td className="px-2 py-2 text-center">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeEntryMutation.mutate(entry.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}

                    {/* Capacity row */}
                    <tr className="border-t-2 border-border bg-muted/30 font-medium">
                      <td colSpan={5} className="px-4 py-2 text-xs text-muted-foreground">Capacity Used</td>
                      {sprints.map((s, i) => (
                        <React.Fragment key={s}>
                          <td className="px-1 py-2 text-center">
                            <span className={`text-[11px] font-semibold ${sprintBEUsed[i] > beSprintCap ? 'text-red-500' : 'text-indigo-500'}`}>
                              {sprintBEUsed[i].toFixed(1)}/{beSprintCap.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-1 py-2 text-center">
                            <span className={`text-[11px] font-semibold ${sprintFEUsed[i] > feSprintCap ? 'text-red-500' : 'text-emerald-500'}`}>
                              {sprintFEUsed[i].toFixed(1)}/{feSprintCap.toFixed(1)}
                            </span>
                          </td>
                        </React.Fragment>
                      ))}
                      {canEdit && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Effort by Objective</CardTitle>
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
        </>
      )}

      {/* Add Feature Dialog */}
      <Dialog open={addFeatureOpen} onOpenChange={(o) => { if (!o) setAddFeatureOpen(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Feature to Plan</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Feature</Label>
              <Select value={selectedFeatureId} onValueChange={setSelectedFeatureId}>
                <SelectTrigger><SelectValue placeholder="Select a feature" /></SelectTrigger>
                <SelectContent>
                  {availableFeatures.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      #{f.priority} — {f.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>BE Effort (weeks)</Label>
                <Input type="number" min="0" step="0.5" value={effortForm.be} onChange={e => setEffortForm(p => ({ ...p, be: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>FE Effort (weeks)</Label>
                <Input type="number" min="0" step="0.5" value={effortForm.fe} onChange={e => setEffortForm(p => ({ ...p, fe: e.target.value }))} placeholder="0" />
              </div>
            </div>
            {selectedFeatureId && (Number(effortForm.be) > (selectedTeam?.be_capacity_weeks || 0) || Number(effortForm.fe) > (selectedTeam?.fe_capacity_weeks || 0)) && (
              <div className="flex items-center gap-2 text-amber-600 text-xs bg-amber-50 dark:bg-amber-950 p-2 rounded">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Effort exceeds team capacity for this quarter
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFeatureOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addEntryMutation.mutate({ featureId: selectedFeatureId, beEffort: Number(effortForm.be) || 0, feEffort: Number(effortForm.fe) || 0 })}
              disabled={addEntryMutation.isPending || !selectedFeatureId}
            >
              Add to Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}