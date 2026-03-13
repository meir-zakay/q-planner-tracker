import React, { useState, useMemo, useRef, useCallback } from 'react';
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
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const DEFAULT_SPRINTS = { Q1: ['S1','S2','S3','S4','S5','S6'], Q2: ['S7','S8','S9','S10','S11','S12'], Q3: ['S13','S14','S15','S16','S17','S18'], Q4: ['S19','S20','S21','S22','S23','S24'] };
const FALLBACK_COLORS = ['#4f46e5','#0ea5e9','#f59e0b','#10b981','#f43f5e','#8b5cf6','#f97316'];

function roundHalf(n) {
  return Math.round(n * 2) / 2;
}

// Distribute totalEffort across sprints greedily from the first sprint with capacity,
// filling each sprint up to its cap (rounded to 0.5 steps).
function distributeEffort(totalEffort, sprintCapacities) {
  const allocations = sprintCapacities.map(() => 0);
  let remaining = Number(totalEffort.toFixed(2));
  for (let i = 0; i < sprintCapacities.length && remaining > 0.01; i++) {
    const cap = sprintCapacities[i];
    if (cap <= 0.001) continue;
    const raw = Math.min(remaining, cap);
    const alloc = roundHalf(raw);
    const actual = Math.min(alloc, cap);
    allocations[i] = actual;
    remaining = Number((remaining - actual).toFixed(2));
  }
  return allocations;
}

// Re-allocate ALL entries in priority order given a set of "pinned" sprint-starts
// and per-sprint caps. Returns a map of entryId -> sprint_allocations array.
// pinnedStarts: { [entryId]: sprintIdx } — the earliest sprint the entry can start from.
function reallocateAll(entriesInOrder, sprints, beSprintCaps, feSprintCaps, pinnedStarts = {}) {
  // Track remaining capacity per sprint for BE and FE separately
  const beRem = [...beSprintCaps];
  const feRem = [...feSprintCaps];

  const result = {};
  for (const entry of entriesInOrder) {
    const startIdx = pinnedStarts[entry.id] ?? 0;
    const beTotal = entry.be_effort_weeks || 0;
    const feTotal = entry.fe_effort_weeks || 0;

    // Available caps from startIdx onward (zero before)
    const beCaps = beRem.map((c, i) => i < startIdx ? 0 : c);
    const feCaps = feRem.map((c, i) => i < startIdx ? 0 : c);

    const beAllocs = distributeEffort(beTotal, beCaps);
    const feAllocs = distributeEffort(feTotal, feCaps);

    // Subtract from remaining
    beAllocs.forEach((v, i) => { beRem[i] = Number((beRem[i] - v).toFixed(2)); });
    feAllocs.forEach((v, i) => { feRem[i] = Number((feRem[i] - v).toFixed(2)); });

    result[entry.id] = sprints.map((s, i) => ({ sprint: s, be_weeks: beAllocs[i], fe_weeks: feAllocs[i] }));
  }
  return result;
}

export default function TeamPlan() {
  const { user, userRole } = useOutletContext();
  const { selectedYear, selectedQuarter } = useQuarterSelection();
  const qc = useQueryClient();

  const [selectedTeamId, setSelectedTeamId] = useState(() => localStorage.getItem('selectedTeamId') || '');
  const [addFeatureOpen, setAddFeatureOpen] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState('');
  const [customFeatureTitle, setCustomFeatureTitle] = useState('');
  const [customFeatureObjective, setCustomFeatureObjective] = useState('');
  const [addMode, setAddMode] = useState('existing'); // 'existing' | 'custom'
  const [effortForm, setEffortForm] = useState({ be: '', fe: '' });
  const [editEntryId, setEditEntryId] = useState(null);
  const [editEffort, setEditEffort] = useState({ be: '', fe: '' });
  const [editCell, setEditCell] = useState(null);
  const [editCellValue, setEditCellValue] = useState('');

  const { data: teamsRaw = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const teams = useMemo(() => [...teamsRaw].sort((a, b) => a.name.localeCompare(b.name)), [teamsRaw]);
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

  const handleTeamChange = (id) => { setSelectedTeamId(id); localStorage.setItem('selectedTeamId', id); };
  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const isAdmin = userRole === 'admin';
  const isTeamLead = selectedTeam?.team_lead_email === user?.email;
  const canEdit = isAdmin || isTeamLead;

  const sprints = useMemo(() => {
    const config = quarterConfigs.find(c => c.year === selectedYear && c.quarter === selectedQuarter);
    return config?.sprints || DEFAULT_SPRINTS[selectedQuarter] || ['S1','S2','S3','S4','S5','S6'];
  }, [quarterConfigs, selectedYear, selectedQuarter]);

  const numSprints = sprints.length;

  // Compute per-sprint capacities rounded to 0 or 0.5 steps,
  // distributing the fractional remainder across the first N sprints.
  // e.g. 6.3 cap/sprint → fraction=0.3, 0.3*6=1.8 → floor=1 sprint gets +0.5 (round 1.8→2? no)
  // Actually: total = rawCap * numSprints; distribute fairly.
  // Each sprint gets either floor(rawCap rounded to 0.5) or that + 0.5.
  // We use: base = roundHalf(floor of rawCap to nearest 0.5), remainder in 0.5 units spread across first k sprints.
  function computeSprintCaps(totalCapacity, nSprints) {
    if (nSprints === 0 || totalCapacity <= 0) return Array(nSprints).fill(0);
    const rawPerSprint = totalCapacity / nSprints;
    // Floor to nearest 0.5
    const base = Math.floor(rawPerSprint * 2) / 2;
    // How many 0.5 units are left to distribute?
    const totalIn05 = Math.round(totalCapacity * 2); // total in 0.5-unit steps
    const baseIn05 = base * 2;
    const extraUnits = totalIn05 - baseIn05 * nSprints; // how many sprints get +0.5
    const caps = Array(nSprints).fill(base);
    for (let i = 0; i < extraUnits && i < nSprints; i++) {
      caps[i] = base + 0.5;
    }
    return caps;
  }

  const beSprintCaps = useMemo(() => computeSprintCaps(selectedTeam?.be_capacity_weeks || 0, numSprints), [selectedTeam, numSprints]);
  const feSprintCaps = useMemo(() => computeSprintCaps(selectedTeam?.fe_capacity_weeks || 0, numSprints), [selectedTeam, numSprints]);
  // Single scalar cap (max) used for display headers — use the first sprint's cap as representative
  const beSprintCap = beSprintCaps[0] ?? 0;
  const feSprintCap = feSprintCaps[0] ?? 0;

  const featureMap = useMemo(() => { const m = {}; allFeatures.forEach(f => { m[f.id] = f; }); return m; }, [allFeatures]);
  const colorMap = useMemo(() => { const m = {}; objectives.forEach(o => { m[o.name] = o.color; }); return m; }, [objectives]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      // Use sort_order if set, otherwise fall back to feature priority
      const oa = a.sort_order ?? featureMap[a.feature_id]?.priority ?? 999;
      const ob = b.sort_order ?? featureMap[b.feature_id]?.priority ?? 999;
      return oa - ob;
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

  // Save re-allocated results for all affected entries in parallel
  const saveReallocated = async (allocMap) => {
    await Promise.all(
      Object.entries(allocMap).map(([id, sprint_allocations]) => {
        const newBE = sprint_allocations.reduce((s, a) => s + (a.be_weeks || 0), 0);
        const newFE = sprint_allocations.reduce((s, a) => s + (a.fe_weeks || 0), 0);
        return base44.entities.TeamPlanEntry.update(id, { sprint_allocations, be_effort_weeks: newBE, fe_effort_weeks: newFE });
      })
    );
    qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] });
  };

  const addEntryMutation = useMutation({
    mutationFn: async ({ featureId, customTitle, beEffort, feEffort }) => {
      let fid = featureId;
      if (!fid && customTitle) {
        const maxPriority = allFeatures.length > 0 ? Math.max(...allFeatures.map(f => f.priority || 0)) : 0;
        const newFeature = await base44.entities.Feature.create({ title: customTitle, objective: customFeatureObjective || undefined, priority: maxPriority + 1, quarter: selectedQuarter, year: selectedYear });
        fid = newFeature.id;
      }
      // Temporarily add new entry with zero allocs to get its priority, then reallocate all
      const newEntry = await base44.entities.TeamPlanEntry.create({
        team_id: selectedTeamId, feature_id: fid,
        be_effort_weeks: beEffort, fe_effort_weeks: feEffort,
        sprint_allocations: sprints.map(s => ({ sprint: s, be_weeks: 0, fe_weeks: 0 })),
        year: selectedYear, quarter: selectedQuarter
      });
      // Fetch updated entries and reallocate all
      const fresh = await base44.entities.TeamPlanEntry.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter });
      const ordered = [...fresh].sort((a, b) => {
        const pa = allFeatures.find(f => f.id === a.feature_id)?.priority || 999;
        const pb = allFeatures.find(f => f.id === b.feature_id)?.priority || 999;
        return pa - pb;
      });
      const allocMap = reallocateAll(ordered, sprints, beSprintCaps, feSprintCaps);
      await saveReallocated(allocMap);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] });
      qc.invalidateQueries({ queryKey: ['features', selectedYear, selectedQuarter] });
      setAddFeatureOpen(false); setSelectedFeatureId(''); setCustomFeatureTitle(''); setCustomFeatureObjective(''); setAddMode('existing'); setEffortForm({ be: '', fe: '' });
    },
  });

  const removeEntryMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.TeamPlanEntry.delete(id);
      // Re-fetch remaining entries and reallocate
      const remaining = await base44.entities.TeamPlanEntry.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter });
      const ordered = [...remaining].sort((a, b) => {
        const pa = allFeatures.find(f => f.id === a.feature_id)?.priority || 999;
        const pb = allFeatures.find(f => f.id === b.feature_id)?.priority || 999;
        return pa - pb;
      });
      if (ordered.length > 0) {
        const allocMap = reallocateAll(ordered, sprints, beSprintCaps, feSprintCaps);
        await saveReallocated(allocMap);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }),
  });

  const updateEffortMutation = useMutation({
    mutationFn: async ({ entry, beEffort, feEffort }) => {
      // Update totals then reallocate all entries from scratch
      const updated = { ...entry, be_effort_weeks: beEffort, fe_effort_weeks: feEffort };
      const allEntries = sortedEntries.map(e => e.id === entry.id ? updated : e);
      const allocMap = reallocateAll(allEntries, sprints, beSprintCaps, feSprintCaps);
      await saveReallocated(allocMap);
    },
    onSuccess: () => { setEditEntryId(null); },
  });

  const updateCellMutation = useMutation({
    mutationFn: async ({ entry, sprintName, type, newVal }) => {
      const sprintIdx = sprints.indexOf(sprintName);
      const key = type === 'be' ? 'be_weeks' : 'fe_weeks';
      const totalEffortKey = type === 'be' ? 'be_effort_weeks' : 'fe_effort_weeks';
      const sprintCaps = type === 'be' ? beSprintCaps : feSprintCaps;
      const otherEntries = sortedEntries.filter(e => e.id !== entry.id);

      // Clamp to available capacity in this sprint
      const othersUsedInSprint = otherEntries.reduce((sum, e) => {
        const a = e.sprint_allocations?.find(a => a.sprint === sprintName);
        return sum + (a?.[key] || 0);
      }, 0);
      const availableInSprint = Math.max(0, (sprintCaps[sprintIdx] ?? 0) - othersUsedInSprint);
      const clampedVal = roundHalf(Math.min(newVal, availableInSprint));

      // Lock sprints 0..sprintIdx for this entry, redistribute remainder after
      const lockedAllocs = sprints.map((s, i) => {
        const a = entry.sprint_allocations?.find(a => a.sprint === s) || { sprint: s, be_weeks: 0, fe_weeks: 0 };
        if (s === sprintName) return { ...a, [key]: clampedVal };
        return { ...a };
      });

      const lockedEffort = lockedAllocs.slice(0, sprintIdx + 1).reduce((sum, a) => sum + (a[key] || 0), 0);
      const totalEffort = entry[totalEffortKey] || 0;
      const remainingEffort = Math.max(0, Number((totalEffort - lockedEffort).toFixed(2)));

      // Build a temporary "modified entry" with locked allocs for prior sprints
      const modifiedEntry = { ...entry, sprint_allocations: lockedAllocs };

      // Now reallocate all entries: entries before this one keep their allocs locked,
      // this entry distributes remaining effort from sprintIdx+1 onward,
      // and entries after reallocate in remaining capacity
      const pinnedStarts = {};
      const allEntries = sortedEntries.map(e => e.id === entry.id ? modifiedEntry : e);

      // For the edited entry, distribute remaining effort after locked sprints
      const afterCaps = sprints.map((s, i) => {
        if (i <= sprintIdx) return 0;
        const othersUsed = otherEntries.reduce((sum, e) => {
          const a = e.sprint_allocations?.find(a => a.sprint === s);
          return sum + (a?.[key] || 0);
        }, 0);
        return Math.max(0, (sprintCaps[i] ?? 0) - othersUsed);
      });
      const afterAllocs = distributeEffort(remainingEffort, afterCaps);
      const finalAllocs = lockedAllocs.map((a, i) => i > sprintIdx ? { ...a, [key]: afterAllocs[i] } : a);

      const newBE = finalAllocs.reduce((s, a) => s + (a.be_weeks || 0), 0);
      const newFE = finalAllocs.reduce((s, a) => s + (a.fe_weeks || 0), 0);
      await base44.entities.TeamPlanEntry.update(entry.id, { sprint_allocations: finalAllocs, be_effort_weeks: newBE, fe_effort_weeks: newFE });

      // Now re-pack all other entries with updated capacity
      const updatedEntry = { ...entry, sprint_allocations: finalAllocs, be_effort_weeks: newBE, fe_effort_weeks: newFE };
      const allUpdated = sortedEntries.map(e => e.id === entry.id ? updatedEntry : e);
      const allocMap = reallocateAll(allUpdated, sprints, beSprintCaps, feSprintCaps);
      // Only save the OTHER entries (edited one is already saved)
      const othersAllocMap = Object.fromEntries(Object.entries(allocMap).filter(([id]) => id !== entry.id));
      if (Object.keys(othersAllocMap).length > 0) await saveReallocated(othersAllocMap);
      else qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] });
    },
    onSuccess: () => { setEditCell(null); },
  });

  // Use a ref to always have fresh state in the drag handler (avoids stale closure)
  const dndStateRef = useRef({});
  dndStateRef.current = { sortedEntries, sprints, beSprintCaps, feSprintCaps, canEdit };

  const handleDragEnd = useCallback((result) => {
    const { sortedEntries: entries, sprints: sprintList, beSprintCaps: beCaps, feSprintCaps: feCaps, canEdit: canEditNow } = dndStateRef.current;
    if (!result.destination || !canEditNow) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId) return;

    // draggableId format: "entryId-drag-be-S1" or "entryId-drag-fe-S2"
    const dragMatch = draggableId.match(/^(.+)-drag-(be|fe)-(.+)$/);
    if (!dragMatch) return;
    const [, entryId, type] = dragMatch;
    const destSprint = destination.droppableId.replace(new RegExp(`-${type}$`), '');

    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    const destSprintIdx = sprintList.indexOf(destSprint);
    if (destSprintIdx < 0) return;

    // Reallocate ALL entries: dragged entry gets pinned to start at destSprintIdx
    const pinnedStarts = { [entryId]: destSprintIdx };
    const allocMap = reallocateAll(entries, sprintList, beCaps, feCaps, pinnedStarts);
    saveReallocated(allocMap);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const objColor = (name) => colorMap[name] || '#94a3b8';

  const getSprintRange = (entry) => {
    const activeSprints = sprints.filter(s => {
      const alloc = entry.sprint_allocations?.find(a => a.sprint === s);
      return (alloc?.be_weeks || 0) + (alloc?.fe_weeks || 0) > 0;
    });
    if (activeSprints.length === 0) return null;
    return { start: activeSprints[0], end: activeSprints[activeSprints.length - 1] };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Select value={selectedTeamId} onValueChange={handleTeamChange}>
          <SelectTrigger className="w-52 bg-card">
            <SelectValue placeholder="Select a team..." />
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {canEdit && (
          <Button onClick={() => setAddFeatureOpen(true)} disabled={!selectedTeamId} className="gap-2"><Plus className="w-4 h-4" />Add Feature</Button>
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
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${numSprints}, minmax(0, 1fr))` }}>
                {sprints.map((sprint, si) => {
                  const beUsed = sprintTotals[si]?.be || 0;
                  const feUsed = sprintTotals[si]?.fe || 0;
                  const thisBeSprintCap = beSprintCaps[si] ?? 0;
                  const thisFeSprintCap = feSprintCaps[si] ?? 0;
                  const beOver = beUsed > thisBeSprintCap;
                  const feOver = feUsed > thisFeSprintCap;

                  const beFeatures = sortedEntries.filter(e => (e.sprint_allocations?.find(a => a.sprint === sprint)?.be_weeks || 0) > 0);
                  const feFeatures = sortedEntries.filter(e => (e.sprint_allocations?.find(a => a.sprint === sprint)?.fe_weeks || 0) > 0);

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
                          <span className={`text-[10px] font-semibold ${beOver ? 'text-red-500' : 'text-foreground'}`}>{beUsed}/{thisBeSprintCap}w</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1 mb-2">
                          <div className="h-1 rounded-full" style={{ width: `${Math.min(100, thisBeSprintCap > 0 ? (beUsed / thisBeSprintCap) * 100 : 0)}%`, backgroundColor: beOver ? '#ef4444' : '#4f46e5' }} />
                        </div>
                        <Droppable droppableId={`${sprint}-be`}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={`space-y-1 min-h-[2.5rem] rounded-md transition-colors duration-150 ${snapshot.isDraggingOver ? 'bg-primary/10 ring-1 ring-primary/30 ring-inset' : ''}`}
                            >
                              {beFeatures.map((entry, idx) => {
                               const feat = featureMap[entry.feature_id];
                               const alloc = entry.sprint_allocations?.find(a => a.sprint === sprint);
                               const cellKey = `${entry.id}-${sprint}-be`;
                               const dragId = `${entry.id}-drag-be-${sprint}`;
                               const featColor = feat?.objective ? objColor(feat.objective) : null;
                               return (
                                 <Draggable key={cellKey} draggableId={dragId} index={idx} isDragDisabled={!canEdit}>
                                   {(drag, dragSnapshot) => (
                                     <div
                                       ref={drag.innerRef}
                                       {...drag.draggableProps}
                                       {...drag.dragHandleProps}
                                       style={{ ...drag.draggableProps.style, ...(featColor ? { backgroundColor: `${featColor}22`, borderColor: `${featColor}55` } : {}) }}
                                       className={`rounded px-1.5 py-1 border ${!featColor ? 'bg-primary/10 border-primary/20' : ''} ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${dragSnapshot.isDragging ? 'shadow-lg opacity-95 z-50' : ''}`}
                                     >
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
                                           className={`text-[10px] font-semibold text-primary mt-0.5 ${canEdit ? 'hover:underline cursor-pointer' : ''}`}
                                           onClick={canEdit ? (e) => { e.stopPropagation(); setEditCell({ key: cellKey }); setEditCellValue(String(alloc?.be_weeks || 0)); } : undefined}
                                         >
                                           {alloc?.be_weeks || 0}w
                                         </p>
                                       )}
                                     </div>
                                   )}
                                 </Draggable>
                               );
                              })}
                              {provided.placeholder}
                              {beFeatures.length === 0 && <p className="text-[10px] text-muted-foreground/50 text-center py-1">—</p>}
                            </div>
                          )}
                        </Droppable>
                      </div>

                      {/* FE Section */}
                      <div className="p-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase">FE</span>
                          <span className={`text-[10px] font-semibold ${feOver ? 'text-red-500' : 'text-foreground'}`}>{feUsed}/{thisFeSprintCap}w</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1 mb-2">
                          <div className="h-1 rounded-full" style={{ width: `${Math.min(100, thisFeSprintCap > 0 ? (feUsed / thisFeSprintCap) * 100 : 0)}%`, backgroundColor: feOver ? '#ef4444' : '#10b981' }} />
                        </div>
                        <Droppable droppableId={`${sprint}-fe`}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              className={`space-y-1 min-h-[2.5rem] rounded-md transition-colors duration-150 ${snapshot.isDraggingOver ? 'bg-emerald-500/10 ring-1 ring-emerald-400/30 ring-inset' : ''}`}
                            >
                              {feFeatures.map((entry, idx) => {
                               const feat = featureMap[entry.feature_id];
                               const alloc = entry.sprint_allocations?.find(a => a.sprint === sprint);
                               const cellKey = `${entry.id}-${sprint}-fe`;
                               const dragId = `${entry.id}-drag-fe-${sprint}`;
                               const featColor = feat?.objective ? objColor(feat.objective) : null;
                               return (
                                 <Draggable key={cellKey} draggableId={dragId} index={idx} isDragDisabled={!canEdit}>
                                   {(drag, dragSnapshot) => (
                                     <div
                                       ref={drag.innerRef}
                                       {...drag.draggableProps}
                                       {...drag.dragHandleProps}
                                       style={{ ...drag.draggableProps.style, ...(featColor ? { backgroundColor: `${featColor}22`, borderColor: `${featColor}55` } : {}) }}
                                       className={`rounded px-1.5 py-1 border ${!featColor ? 'bg-emerald-500/10 border-emerald-500/20' : ''} ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${dragSnapshot.isDragging ? 'shadow-lg opacity-95 z-50' : ''}`}
                                     >
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
                                           className={`text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 ${canEdit ? 'hover:underline cursor-pointer' : ''}`}
                                           onClick={canEdit ? (e) => { e.stopPropagation(); setEditCell({ key: cellKey }); setEditCellValue(String(alloc?.fe_weeks || 0)); } : undefined}
                                         >
                                           {alloc?.fe_weeks || 0}w
                                         </p>
                                       )}
                                     </div>
                                   )}
                                 </Draggable>
                               );
                              })}
                              {provided.placeholder}
                              {feFeatures.length === 0 && <p className="text-[10px] text-muted-foreground/50 text-center py-1">—</p>}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    </div>
                  );
                })}
              </div>
            </DragDropContext>
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
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {feat.objective && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white" style={{ backgroundColor: objColor(feat.objective) }}>
                              {feat.objective}
                            </span>
                          )}
                          {(() => { const range = getSprintRange(entry); return range ? (
                            <span className="text-[10px] text-muted-foreground">
                              {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
                            </span>
                          ) : null; })()}
                        </div>
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
      <Dialog open={addFeatureOpen} onOpenChange={(o) => { if (!o) { setAddFeatureOpen(false); setAddMode('existing'); setSelectedFeatureId(''); setCustomFeatureTitle(''); setCustomFeatureObjective(''); setEffortForm({ be: '', fe: '' }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Feature to Plan</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button size="sm" variant={addMode === 'existing' ? 'default' : 'outline'} className="flex-1" onClick={() => setAddMode('existing')}>From Features List</Button>
              <Button size="sm" variant={addMode === 'custom' ? 'default' : 'outline'} className="flex-1" onClick={() => setAddMode('custom')}>New Custom Feature</Button>
            </div>
            {addMode === 'existing' ? (
              <div className="space-y-1.5">
                <Label>Feature</Label>
                <Select value={selectedFeatureId} onValueChange={setSelectedFeatureId}>
                  <SelectTrigger><SelectValue placeholder="Select a feature" /></SelectTrigger>
                  <SelectContent>{availableFeatures.map(f => <SelectItem key={f.id} value={f.id}>#{f.priority} — {f.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Feature Title</Label>
                  <Input value={customFeatureTitle} onChange={e => setCustomFeatureTitle(e.target.value)} placeholder="Enter feature name..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Objective <span className="text-destructive">*</span></Label>
                  <Select value={customFeatureObjective} onValueChange={setCustomFeatureObjective}>
                    <SelectTrigger><SelectValue placeholder="Select an objective..." /></SelectTrigger>
                    <SelectContent>{objectives.map(o => <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
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
            <Button variant="outline" onClick={() => { setAddFeatureOpen(false); setAddMode('existing'); setSelectedFeatureId(''); setCustomFeatureTitle(''); setCustomFeatureObjective(''); setEffortForm({ be: '', fe: '' }); }}>Cancel</Button>
            <Button
              onClick={() => addEntryMutation.mutate({ featureId: selectedFeatureId, customTitle: customFeatureTitle, beEffort: Number(effortForm.be) || 0, feEffort: Number(effortForm.fe) || 0 })}
              disabled={addEntryMutation.isPending || (addMode === 'existing' ? !selectedFeatureId : (!customFeatureTitle.trim() || !customFeatureObjective))}
            >Add to Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}