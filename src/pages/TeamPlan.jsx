import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useQuarterSelection } from '@/components/QuarterContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Pencil, Info, AlertTriangle, Server, Monitor } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const DEFAULT_SPRINTS = { Q1: ['S1','S2','S3','S4','S5','S6'], Q2: ['S7','S8','S9','S10','S11','S12'], Q3: ['S13','S14','S15','S16','S17','S18'], Q4: ['S19','S20','S21','S22','S23','S24'] };
const FALLBACK_COLORS = ['#4f46e5','#0ea5e9','#f59e0b','#10b981','#f43f5e','#8b5cf6','#f97316'];

function distributeEffort(totalEffort, sprintCapacities) {
  const allocations = sprintCapacities.map(() => 0);
  let remaining = totalEffort;
  for (let i = 0; i < sprintCapacities.length && remaining > 0; i++) {
    const alloc = Math.min(remaining, sprintCapacities[i]);
    allocations[i] = Number(alloc.toFixed(1));
    remaining = Number((remaining - alloc).toFixed(1));
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
  const [editEntryId, setEditEntryId] = useState(null);
  const [editEffort, setEditEffort] = useState({ be: '', fe: '' });
  const [editCell, setEditCell] = useState(null);
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
  const isAdmin = userRole === 'admin';
  const isTeamLead = selectedTeam?.team_lead_email === user?.email;
  const canEdit = isAdmin || isTeamLead;

  const sprints = useMemo(() => {
    const config = quarterConfigs.find(c => c.year === selectedYear && c.quarter === selectedQuarter);
    return config?.sprints || DEFAULT_SPRINTS[selectedQuarter] || ['S1','S2','S3','S4','S5','S6'];
  }, [quarterConfigs, selectedYear, selectedQuarter]);

  const numSprints = sprints.length;
  const beSprintCap = selectedTeam ? (selectedTeam.be_capacity_weeks || 0) / numSprints : 0;
  const feSprintCap = selectedTeam ? (selectedTeam.fe_capacity_weeks || 0) / numSprints : 0;

  const featureMap = useMemo(() => { const m = {}; allFeatures.forEach(f => { m[f.id] = f; }); return m; }, [allFeatures]);
  const colorMap = useMemo(() => { const m = {}; objectives.forEach(o => { m[o.name] = o.color; }); return m; }, [objectives]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const pa = featureMap[a.feature_id]?.priority || 999;
      const pb = featureMap[b.feature_id]?.priority || 999;
      return pa - pb;
    });
  }, [entries, featureMap]);

  const addedFeatureIds = useMemo(() => new Set(entries.map(e => e.feature_id)), [entries]);
  const availableFeatures = useMemo(() => allFeatures.filter(f => !addedFeatureIds.has(f.id)).sort((a, b) => (a.priority || 0) - (b.priority || 0)), [allFeatures, addedFeatureIds]);

  // Per sprint totals (for capacity header)
  const sprintTotals = useMemo(() => sprints.map((s, i) => {
    let be = 0, fe = 0;
    sortedEntries.forEach(entry => {
      const alloc = entry.sprint_allocations?.find(a => a.sprint === s);
      be += alloc?.be_weeks || 0;
      fe += alloc?.fe_weeks || 0;
    });
    return { be, fe };
  }), [sortedEntries, sprints]);

  const totalBEUsed = sortedEntries.reduce((s, e) => s + (e.be_effort_weeks || 0), 0);
  const totalFEUsed = sortedEntries.reduce((s, e) => s + (e.fe_effort_weeks || 0), 0);
  const totalBECap = selectedTeam?.be_capacity_weeks || 0;
  const totalFECap = selectedTeam?.fe_capacity_weeks || 0;
  const totalCapacity = totalBECap + totalFECap;
  const totalUsed = totalBEUsed + totalFEUsed;

  const effortByObjective = useMemo(() => {
    const map = {};
    sortedEntries.forEach(entry => {
      const feat = featureMap[entry.feature_id];
      if (!feat) return;
      const obj = feat.objective || 'Other';
      const effort = (entry.be_effort_weeks || 0) + (entry.fe_effort_weeks || 0);
      map[obj] = (map[obj] || 0) + effort;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [sortedEntries, featureMap]);

  const utilizationPct = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;
  const utilizationColor = utilizationPct > 100 ? '#ef4444' : utilizationPct > 85 ? '#f59e0b' : '#4f46e5';

  const addEntryMutation = useMutation({
    mutationFn: async ({ featureId, beEffort, feEffort }) => {
      const existing = sortedEntries;
      const beUsedPerSprint = sprints.map((s) => existing.reduce((sum, e) => { const a = e.sprint_allocations?.find(a => a.sprint === s); return sum + (a?.be_weeks || 0); }, 0));
      const feUsedPerSprint = sprints.map((s) => existing.reduce((sum, e) => { const a = e.sprint_allocations?.find(a => a.sprint === s); return sum + (a?.fe_weeks || 0); }, 0));
      const beRem = beUsedPerSprint.map(u => Math.max(0, beSprintCap - u));
      const feRem = feUsedPerSprint.map(u => Math.max(0, feSprintCap - u));
      const beAllocs = distributeEffort(beEffort, beRem);
      const feAllocs = distributeEffort(feEffort, feRem);
      const sprint_allocations = sprints.map((s, i) => ({ sprint: s, be_weeks: beAllocs[i], fe_weeks: feAllocs[i] }));
      return base44.entities.TeamPlanEntry.create({ team_id: selectedTeamId, feature_id: featureId, be_effort_weeks: beEffort, fe_effort_weeks: feEffort, sprint_allocations, year: selectedYear, quarter: selectedQuarter });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }); setAddFeatureOpen(false); setSelectedFeatureId(''); setEffortForm({ be: '', fe: '' }); toast({ title: 'Feature added' }); },
  });

  const removeEntryMutation = useMutation({
    mutationFn: (id) => base44.entities.TeamPlanEntry.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }),
  });

  const updateEffortMutation = useMutation({
    mutationFn: async ({ entry, beEffort, feEffort }) => {
      const otherEntries = sortedEntries.filter(e => e.id !== entry.id);
      const beUsedPerSprint = sprints.map((s) => otherEntries.reduce((sum, e) => { const a = e.sprint_allocations?.find(a => a.sprint === s); return sum + (a?.be_weeks || 0); }, 0));
      const feUsedPerSprint = sprints.map((s) => otherEntries.reduce((sum, e) => { const a = e.sprint_allocations?.find(a => a.sprint === s); return sum + (a?.fe_weeks || 0); }, 0));
      const beRem = beUsedPerSprint.map(u => Math.max(0, beSprintCap - u));
      const feRem = feUsedPerSprint.map(u => Math.max(0, feSprintCap - u));
      const beAllocs = distributeEffort(beEffort, beRem);
      const feAllocs = distributeEffort(feEffort, feRem);
      const sprint_allocations = sprints.map((s, i) => ({ sprint: s, be_weeks: beAllocs[i], fe_weeks: feAllocs[i] }));
      return base44.entities.TeamPlanEntry.update(entry.id, { be_effort_weeks: beEffort, fe_effort_weeks: feEffort, sprint_allocations });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }); setEditEntryId(null); },
  });

  const updateCellMutation = useMutation({
    mutationFn: async ({ entry, sprintName, type, newVal }) => {
      const newAllocs = sprints.map((s) => {
        const existing = entry.sprint_allocations?.find(a => a.sprint === s) || { sprint: s, be_weeks: 0, fe_weeks: 0 };
        if (s === sprintName) return { ...existing, [type === 'be' ? 'be_weeks' : 'fe_weeks']: newVal };
        return existing;
      });
      const newBE = newAllocs.reduce((s, a) => s + (a.be_weeks || 0), 0);
      const newFE = newAllocs.reduce((s, a) => s + (a.fe_weeks || 0), 0);
      return base44.entities.TeamPlanEntry.update(entry.id, { sprint_allocations: newAllocs, be_effort_weeks: newBE, fe_effort_weeks: newFE });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }); setEditCell(null); },
  });

  const objColor = (name) => colorMap[name] || '#94a3b8';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-52 bg-card">
              <SelectValue placeholder="Select a team..." />
            </SelectTrigger>
            <SelectContent>
              {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedTeamId && (
            <span className="text-sm font-medium text-primary">{selectedQuarter}-{selectedYear}</span>
          )}
        </div>
        {canEdit && selectedTeamId && (
          <Button onClick={() => setAddFeatureOpen(true)} className="gap-2"><Plus className="w-4 h-4" />Add Feature</Button>
        )}
      </div>

      {!selectedTeamId ? (
        <div className="text-center py-24 text-muted-foreground">
          <Info className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a team to view their quarterly plan</p>
        </div>
      ) : (
        <>
          {/* Sprint Allocation Section */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-base font-semibold text-foreground mb-1">Sprint Allocation — {selectedTeam?.name}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-sm">
              <span>
                BE:{' '}
                <span className={totalBEUsed > totalBECap ? 'text-red-500 font-semibold' : 'text-primary font-semibold'}>{totalBEUsed}w</span>
                {' / '}
                <span className="text-muted-foreground">{totalBECap}w</span>
                {totalBEUsed > totalBECap && <span className="text-red-500 text-xs ml-1">(over capacity!)</span>}
              </span>
              <span>
                FE:{' '}
                <span className={totalFEUsed > totalFECap ? 'text-red-500 font-semibold' : 'text-primary font-semibold'}>{totalFEUsed}w</span>
                {' / '}
                <span className="text-muted-foreground">{totalFECap}w</span>
                {totalFEUsed > totalFECap && <span className="text-red-500 text-xs ml-1">(over capacity!)</span>}
              </span>
              {canEdit && <span className="text-xs text-muted-foreground italic">Click any effort value to edit it</span>}
            </div>

            {/* Sprint Cards */}
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${numSprints}, minmax(0, 1fr))` }}>
              {sprints.map((sprint, si) => {
                const beUsed = sprintTotals[si]?.be || 0;
                const feUsed = sprintTotals[si]?.fe || 0;
                const beOver = beUsed > beSprintCap;
                const feOver = feUsed > feSprintCap;

                // Features with BE allocation in this sprint
                const beFeatures = sortedEntries.filter(e => {
                  const a = e.sprint_allocations?.find(a => a.sprint === sprint);
                  return (a?.be_weeks || 0) > 0;
                });
                const feFeatures = sortedEntries.filter(e => {
                  const a = e.sprint_allocations?.find(a => a.sprint === sprint);
                  return (a?.fe_weeks || 0) > 0;
                });

                return (
                  <div key={sprint} className="border border-border rounded-lg overflow-hidden min-w-0">
                    {/* Sprint header */}
                    <div className="px-2.5 py-2 bg-muted/30 border-b border-border text-center">
                      <p className="font-semibold text-foreground text-sm">{sprint}</p>
                      <p className="text-[10px] text-muted-foreground">2 weeks</p>
                    </div>

                    {/* BE Section */}
                    <div className="p-2 border-b border-border/50">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">BE</span>
                        <span className={`text-[10px] font-semibold ${beOver ? 'text-red-500' : 'text-foreground'}`}>
                          {beUsed}/{beSprintCap.toFixed(0)}w
                        </span>
                      </div>
                      {/* BE progress bar */}
                      <div className="w-full bg-muted rounded-full h-1 mb-2">
                        <div className="h-1 rounded-full" style={{ width: `${Math.min(100, beSprintCap > 0 ? (beUsed / beSprintCap) * 100 : 0)}%`, backgroundColor: beOver ? '#ef4444' : '#4f46e5' }} />
                      </div>
                      <div className="space-y-1">
                        {beFeatures.map(entry => {
                          const feat = featureMap[entry.feature_id];
                          const alloc = entry.sprint_allocations?.find(a => a.sprint === sprint);
                          const cellKey = `${entry.id}-${sprint}-be`;
                          return (
                            <div key={entry.id} className="bg-primary/5 rounded px-1.5 py-1">
                              <p className="text-[10px] text-foreground font-medium leading-tight truncate">{feat?.title}</p>
                              {canEdit && editCell?.key === cellKey ? (
                                <Input autoFocus type="number" min="0" step="0.5" value={editCellValue}
                                  onChange={e => setEditCellValue(e.target.value)}
                                  onBlur={() => updateCellMutation.mutate({ entry, sprintName: sprint, type: 'be', newVal: Number(editCellValue) })}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditCell(null); }}
                                  className="h-5 w-14 text-[10px] p-0.5 mt-0.5 border-primary/40"
                                />
                              ) : (
                                <p
                                  className={`text-[10px] font-semibold text-primary mt-0.5 ${canEdit ? 'cursor-pointer hover:underline' : ''}`}
                                  onClick={canEdit ? () => { setEditCell({ key: cellKey }); setEditCellValue(String(alloc?.be_weeks || 0)); } : undefined}
                                >
                                  {alloc?.be_weeks || 0}w
                                </p>
                              )}
                            </div>
                          );
                        })}
                        {beFeatures.length === 0 && <p className="text-[10px] text-muted-foreground/50 text-center py-1">—</p>}
                      </div>
                    </div>

                    {/* FE Section */}
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">FE</span>
                        <span className={`text-[10px] font-semibold ${feOver ? 'text-red-500' : 'text-foreground'}`}>
                          {feUsed}/{feSprintCap.toFixed(0)}w
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1 mb-2">
                        <div className="h-1 rounded-full" style={{ width: `${Math.min(100, feSprintCap > 0 ? (feUsed / feSprintCap) * 100 : 0)}%`, backgroundColor: feOver ? '#ef4444' : '#10b981' }} />
                      </div>
                      <div className="space-y-1">
                        {feFeatures.map(entry => {
                          const feat = featureMap[entry.feature_id];
                          const alloc = entry.sprint_allocations?.find(a => a.sprint === sprint);
                          const cellKey = `${entry.id}-${sprint}-fe`;
                          return (
                            <div key={entry.id} className="bg-emerald-500/5 rounded px-1.5 py-1">
                              <p className="text-[10px] text-foreground font-medium leading-tight truncate">{feat?.title}</p>
                              {canEdit && editCell?.key === cellKey ? (
                                <Input autoFocus type="number" min="0" step="0.5" value={editCellValue}
                                  onChange={e => setEditCellValue(e.target.value)}
                                  onBlur={() => updateCellMutation.mutate({ entry, sprintName: sprint, type: 'fe', newVal: Number(editCellValue) })}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditCell(null); }}
                                  className="h-5 w-14 text-[10px] p-0.5 mt-0.5 border-emerald-400/40"
                                />
                              ) : (
                                <p
                                  className={`text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 ${canEdit ? 'cursor-pointer hover:underline' : ''}`}
                                  onClick={canEdit ? () => { setEditCell({ key: cellKey }); setEditCellValue(String(alloc?.fe_weeks || 0)); } : undefined}
                                >
                                  {alloc?.fe_weeks || 0}w
                                </p>
                              )}
                            </div>
                          );
                        })}
                        {feFeatures.length === 0 && <p className="text-[10px] text-muted-foreground/50 text-center py-1">—</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom: Planned Features + Pie Chart */}
          <div className="grid lg:grid-cols-[1fr_320px] gap-6">
            {/* Planned Features */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Planned Features</h3>
                {canEdit && <p className="text-xs text-muted-foreground italic">Click <Pencil className="w-3 h-3 inline" /> to set effort estimates</p>}
              </div>
              <div className="space-y-2">
                {sortedEntries.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No features planned yet</p>}
                {sortedEntries.map(entry => {
                  const feat = featureMap[entry.feature_id];
                  if (!feat) return null;
                  const isEditing = editEntryId === entry.id;
                  return (
                    <div key={entry.id} className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-border text-[10px] font-bold text-muted-foreground shrink-0">
                        {feat.priority}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{feat.title}</p>
                        {feat.objective && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white mt-0.5" style={{ backgroundColor: objColor(feat.objective) }}>
                            {feat.objective}
                          </span>
                        )}
                      </div>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Server className="w-3 h-3 text-muted-foreground" />
                            <Input type="number" min="0" step="0.5" value={editEffort.be} onChange={e => setEditEffort(p => ({ ...p, be: e.target.value }))} className="h-7 w-16 text-xs" placeholder="0" />
                          </div>
                          <div className="flex items-center gap-1">
                            <Monitor className="w-3 h-3 text-muted-foreground" />
                            <Input type="number" min="0" step="0.5" value={editEffort.fe} onChange={e => setEditEffort(p => ({ ...p, fe: e.target.value }))} className="h-7 w-16 text-xs" placeholder="0" />
                          </div>
                          <Button size="sm" className="h-7 text-xs px-2" onClick={() => updateEffortMutation.mutate({ entry, beEffort: Number(editEffort.be) || 0, feEffort: Number(editEffort.fe) || 0 })}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditEntryId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Server className="w-3 h-3" />
                            <span className="font-medium text-foreground">{entry.be_effort_weeks || 0}w</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Monitor className="w-3 h-3" />
                            <span className="font-medium text-foreground">{entry.fe_effort_weeks || 0}w</span>
                          </div>
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => { setEditEntryId(entry.id); setEditEffort({ be: String(entry.be_effort_weeks || 0), fe: String(entry.fe_effort_weeks || 0) }); }}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeEntryMutation.mutate(entry.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pie Chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-1">Effort by Objective</h3>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Capacity Utilization</p>
                <p className="text-sm font-bold" style={{ color: utilizationColor }}>{utilizationPct}%</p>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 mb-1">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(utilizationPct, 100)}%`, backgroundColor: utilizationColor }} />
              </div>
              <p className="text-[11px] text-muted-foreground mb-4">{totalUsed}w used of {totalCapacity}w total</p>

              {effortByObjective.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">No data yet</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={effortByObjective} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" nameKey="name">
                        {effortByObjective.map((entry, index) => (
                          <Cell key={entry.name} fill={colorMap[entry.name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [`${value}w`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {effortByObjective.map((entry, index) => {
                      const total = effortByObjective.reduce((s, d) => s + d.value, 0);
                      const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                      const color = colorMap[entry.name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
                      return (
                        <div key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span>{entry.name} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Add Feature Dialog */}
      <Dialog open={addFeatureOpen} onOpenChange={(o) => { if (!o) setAddFeatureOpen(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Feature to Plan</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Feature</Label>
              <Select value={selectedFeatureId} onValueChange={setSelectedFeatureId}>
                <SelectTrigger><SelectValue placeholder="Select a feature" /></SelectTrigger>
                <SelectContent>{availableFeatures.map(f => <SelectItem key={f.id} value={f.id}>#{f.priority} — {f.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5" />BE Effort (weeks)</Label>
                <Input type="number" min="0" step="0.5" value={effortForm.be} onChange={e => setEffortForm(p => ({ ...p, be: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5" />FE Effort (weeks)</Label>
                <Input type="number" min="0" step="0.5" value={effortForm.fe} onChange={e => setEffortForm(p => ({ ...p, fe: e.target.value }))} placeholder="0" />
              </div>
            </div>
            {(Number(effortForm.be) > totalBECap || Number(effortForm.fe) > totalFECap) && (
              <div className="flex items-center gap-2 text-amber-600 text-xs bg-amber-50 dark:bg-amber-950 p-2.5 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />Effort exceeds total team capacity for this quarter
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFeatureOpen(false)}>Cancel</Button>
            <Button onClick={() => addEntryMutation.mutate({ featureId: selectedFeatureId, beEffort: Number(effortForm.be) || 0, feEffort: Number(effortForm.fe) || 0 })} disabled={addEntryMutation.isPending || !selectedFeatureId}>Add to Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}