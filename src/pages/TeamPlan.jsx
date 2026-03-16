import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useQuarterSelection } from '@/components/QuarterContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Pencil, Info, Server, Monitor, CircleCheck, CircleMinus, Wrench, CheckCircle, Users2 } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


const DEFAULT_SPRINTS = { Q1: ['S1','S2','S3','S4','S5','S6'], Q2: ['S7','S8','S9','S10','S11','S12'], Q3: ['S13','S14','S15','S16','S17','S18'], Q4: ['S19','S20','S21','S22','S23','S24'] };
const FALLBACK_COLORS = ['#0F52BA','#0ea5e9','#f59e0b','#10b981','#f43f5e','#6366f1','#f97316'];

function roundHalf(n) {
  return Math.round(n * 2) / 2;
}

// Distribute totalEffort across sprints greedily.
// physicalCaps: actual available capacity per sprint.
// parallelismCaps: optional per-sprint parallelism cap (max this feature can use per sprint).
// When a sprint's physical capacity is below the parallelism cap, the deficit carries forward
// so the next sprint can compensate and avoid tiny spill-over.
function distributeEffort(totalEffort, physicalCaps, parallelismCaps = null) {
  const allocations = physicalCaps.map(() => 0);
  let remaining = Number(totalEffort.toFixed(2));
  let deficit = 0; // accumulated shortfall from parallelism cap due to physical constraints

  for (let i = 0; i < physicalCaps.length && remaining > 0.01; i++) {
    const physCap = physicalCaps[i];
    const maxCap = parallelismCaps ? parallelismCaps[i] : Infinity;

    if (physCap <= 0.001) {
      // Sprint fully consumed by other features; accumulate deficit if we had effort to place
      if (maxCap < Infinity && remaining > 0) deficit += maxCap;
      continue;
    }

    // Allow up to maxCap + carried-forward deficit
    const effectiveCap = maxCap === Infinity ? physCap : Math.min(physCap, maxCap + deficit);
    const raw = Math.min(remaining, effectiveCap);
    const alloc = roundHalf(raw);
    const actual = Math.min(alloc, effectiveCap);
    allocations[i] = actual;
    remaining = Number((remaining - actual).toFixed(2));

    // Update deficit: if physical was the limiting factor, carry the gap forward
    if (maxCap < Infinity) {
      if (physCap < maxCap) {
        deficit += maxCap - actual; // placed less than maxCap due to physical constraint
      } else {
        deficit = 0; // had full room, reset
      }
    }
  }

  // Place any remainder in the last sprint (allows overallocation edge case)
  if (remaining > 0.01 && physicalCaps.length > 0) {
    allocations[physicalCaps.length - 1] = Number((allocations[physicalCaps.length - 1] + remaining).toFixed(2));
  }
  return allocations;
}

// Re-allocate ALL entries in priority order given a set of "pinned" sprint-starts
// and per-sprint caps. Returns a map of entryId -> sprint_allocations array.
// pinnedStarts: { [entryId]: sprintIdx } — the earliest sprint the entry can start from.
// beDevs/feDevs: total developers on the team (used to compute parallelism fraction).
function reallocateAll(entriesInOrder, sprints, beSprintCaps, feSprintCaps, pinnedStarts = {}, beDevs = 1, feDevs = 1) {
  // Track remaining capacity per sprint for BE and FE separately
  const beRem = [...beSprintCaps];
  const feRem = [...feSprintCaps];

  const result = {};
  for (const entry of entriesInOrder) {
    const startIdx = pinnedStarts[entry.id] ?? 0;
    const beTotal = entry.be_effort_weeks || 0;
    const feTotal = entry.fe_effort_weeks || 0;
    const beParallelism = entry.be_parallelism || 1;
    const feParallelism = entry.fe_parallelism || 1;

    // Fraction of sprint capacity this feature can consume based on parallelism vs total devs
    const beFraction = beDevs > 0 ? Math.min(1, beParallelism / beDevs) : 1;
    const feFraction = feDevs > 0 ? Math.min(1, feParallelism / feDevs) : 1;

    // Per-sprint max for this feature based on original sprint caps (not remaining)
    // Then intersect with actual remaining to avoid over-allocation
    const beMaxPerSprint = beSprintCaps.map(c => roundHalf(c * beFraction));
    const feMaxPerSprint = feSprintCaps.map(c => roundHalf(c * feFraction));
    // physicalCaps = remaining capacity in sprint (capped by parallelism but NOT combined)
    // parallelismCaps = per-sprint max for this feature based on parallelism fraction
    const bePCaps = beRem.map((c, i) => i < startIdx ? 0 : c);
    const fePCaps = feRem.map((c, i) => i < startIdx ? 0 : c);
    const beParCaps = beMaxPerSprint.map((c, i) => i < startIdx ? 0 : c);
    const feParCaps = feMaxPerSprint.map((c, i) => i < startIdx ? 0 : c);

    const beAllocs = distributeEffort(beTotal, bePCaps, beParCaps);
    const feAllocs = distributeEffort(feTotal, fePCaps, feParCaps);

    // Subtract from remaining capacity (clamp to 0 to avoid negative)
    beAllocs.forEach((v, i) => { beRem[i] = Number(Math.max(0, beRem[i] - v).toFixed(2)); });
    feAllocs.forEach((v, i) => { feRem[i] = Number(Math.max(0, feRem[i] - v).toFixed(2)); });

    result[entry.id] = sprints.map((s, i) => ({ sprint: s, be_weeks: beAllocs[i], fe_weeks: feAllocs[i] }));
  }
  return result;
}

export default function TeamPlan() {
  const { user, userRole, darkMode } = useOutletContext();
  const { selectedYear, selectedQuarter } = useQuarterSelection();
  const qc = useQueryClient();

  const [selectedTeamId, setSelectedTeamId] = useState(() => localStorage.getItem('selectedTeamId') || '');
  const [manualMode, setManualMode] = useState(() => localStorage.getItem('manualMode') === 'true');
  const [addFeatureOpen, setAddFeatureOpen] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState('');
  const [customFeatureTitle, setCustomFeatureTitle] = useState('');
  const [customFeatureObjective, setCustomFeatureObjective] = useState('');
  const [addMode, setAddMode] = useState('existing'); // 'existing' | 'custom'
  const [effortForm, setEffortForm] = useState({ be: '', fe: '', beParallelism: '1', feParallelism: '1' });
  const [editEntryId, setEditEntryId] = useState(null);
  const [editEffort, setEditEffort] = useState({ be: '', fe: '', beParallelism: '', feParallelism: '' });
  const [editCell, setEditCell] = useState(null);
  const [editCellValue, setEditCellValue] = useState('');
  // assignSprintEntry removed — using DnD for manual mode sprint assignment

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
  const { data: signedPlan = null } = useQuery({
    queryKey: ['signedPlan', selectedTeamId, selectedYear, selectedQuarter],
    queryFn: () => selectedTeamId
      ? base44.entities.SignedQuarterPlan.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter }).then(r => r[0] || null)
      : Promise.resolve(null),
    enabled: !!selectedTeamId,
  });

  const handleTeamChange = (id) => { setSelectedTeamId(id); localStorage.setItem('selectedTeamId', id); };
  const toggleManualMode = () => {
    const next = !manualMode;
    setManualMode(next);
    localStorage.setItem('manualMode', String(next));
  };
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
  const utilizationColor = utilizationPct > 100 ? '#ef4444' : utilizationPct > 85 ? '#f59e0b' : '#0F52BA';

  // Save re-allocated results for all affected entries in parallel, preserving parallelism
  // entriesForParallelism: optional array of entries to use as source of parallelism values (e.g., when they've been updated but not yet synced)
  const saveReallocated = async (allocMap, entriesForParallelism = null) => {
    const entrySource = entriesForParallelism || sortedEntries;
    await Promise.all(
      Object.entries(allocMap).map(([id, sprint_allocations]) => {
        const entry = entrySource.find(e => e.id === id);
        const newBE = sprint_allocations.reduce((s, a) => s + (a.be_weeks || 0), 0);
        const newFE = sprint_allocations.reduce((s, a) => s + (a.fe_weeks || 0), 0);
        return base44.entities.TeamPlanEntry.update(id, { 
          sprint_allocations, 
          be_effort_weeks: newBE, 
          fe_effort_weeks: newFE,
          be_parallelism: entry?.be_parallelism || 1,
          fe_parallelism: entry?.fe_parallelism || 1
        });
      })
    );
    qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] });
  };

  const toggleExcludeMutation = useMutation({
    mutationFn: async ({ entry, excluded }) => {
      // If excluding, clear sprint allocations and zero out effort
      if (excluded) {
        await base44.entities.TeamPlanEntry.update(entry.id, {
          excluded_from_allocation: true,
          sprint_allocations: sprints.map(s => ({ sprint: s, be_weeks: 0, fe_weeks: 0 })),
        });
      } else {
        await base44.entities.TeamPlanEntry.update(entry.id, { excluded_from_allocation: false });
      }
      // Re-fetch and reallocate only included entries
      const fresh = await base44.entities.TeamPlanEntry.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter });
      const included = fresh.filter(e => !e.excluded_from_allocation);
      const ordered = [...included].sort((a, b) => {
        const oa = a.sort_order ?? allFeatures.find(f => f.id === a.feature_id)?.priority ?? 999;
        const ob = b.sort_order ?? allFeatures.find(f => f.id === b.feature_id)?.priority ?? 999;
        return oa - ob;
      });
      if (ordered.length > 0) {
        const allocMap = reallocateAll(ordered, sprints, beSprintCaps, feSprintCaps, {}, selectedTeam?.be_developers || 1, selectedTeam?.fe_developers || 1);
        await saveReallocated(allocMap);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }),
  });

  const addEntryMutation = useMutation({
    mutationFn: async ({ featureId, customTitle, beEffort, feEffort, beParallelism, feParallelism }) => {
      let fid = featureId;
      if (!fid && customTitle) {
        const maxPriority = allFeatures.length > 0 ? Math.max(...allFeatures.map(f => f.priority || 0)) : 0;
        const newFeature = await base44.entities.Feature.create({ title: customTitle, objective: customFeatureObjective || undefined, priority: maxPriority + 1, quarter: selectedQuarter, year: selectedYear, team_plan_only: true });
        fid = newFeature.id;
      }
      // Create new entry with parallelism settings
      const newEntry = await base44.entities.TeamPlanEntry.create({
        team_id: selectedTeamId, feature_id: fid,
        be_effort_weeks: beEffort, fe_effort_weeks: feEffort,
        be_parallelism: beParallelism || 1, fe_parallelism: feParallelism || 1,
        sprint_allocations: sprints.map(s => ({ sprint: s, be_weeks: 0, fe_weeks: 0 })),
        year: selectedYear, quarter: selectedQuarter
      });
      if (!manualMode) {
        // Fetch updated entries and reallocate only included entries
        const fresh = await base44.entities.TeamPlanEntry.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter });
        const included = fresh.filter(e => !e.excluded_from_allocation);
        const ordered = [...included].sort((a, b) => {
          const oa = a.sort_order ?? allFeatures.find(f => f.id === a.feature_id)?.priority ?? 999;
          const ob = b.sort_order ?? allFeatures.find(f => f.id === b.feature_id)?.priority ?? 999;
          return oa - ob;
        });
        const allocMap = reallocateAll(ordered, sprints, beSprintCaps, feSprintCaps, {}, selectedTeam?.be_developers || 1, selectedTeam?.fe_developers || 1);
        await saveReallocated(allocMap, ordered);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] });
      qc.invalidateQueries({ queryKey: ['features', selectedYear, selectedQuarter] });
      setAddFeatureOpen(false); setSelectedFeatureId(''); setCustomFeatureTitle(''); setCustomFeatureObjective(''); setAddMode('existing'); setEffortForm({ be: '', fe: '', beParallelism: '1', feParallelism: '1' });
    },
  });

  const removeEntryMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.TeamPlanEntry.delete(id);
      if (!manualMode) {
        // Re-fetch remaining entries and reallocate only included
        const remaining = await base44.entities.TeamPlanEntry.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter });
        const included = remaining.filter(e => !e.excluded_from_allocation);
        const ordered = [...included].sort((a, b) => {
          const oa = a.sort_order ?? allFeatures.find(f => f.id === a.feature_id)?.priority ?? 999;
          const ob = b.sort_order ?? allFeatures.find(f => f.id === b.feature_id)?.priority ?? 999;
          return oa - ob;
        });
        if (ordered.length > 0) {
          const allocMap = reallocateAll(ordered, sprints, beSprintCaps, feSprintCaps, {}, selectedTeam?.be_developers || 1, selectedTeam?.fe_developers || 1);
          await saveReallocated(allocMap);
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }),
  });

  const updateEffortMutation = useMutation({
    mutationFn: async ({ entry, beEffort, feEffort, beParallelism, feParallelism }) => {
      const updateData = { be_effort_weeks: beEffort, fe_effort_weeks: feEffort };
      if (beParallelism !== undefined && beParallelism > 0) updateData.be_parallelism = beParallelism;
      if (feParallelism !== undefined && feParallelism > 0) updateData.fe_parallelism = feParallelism;

      if (manualMode) {
        // In manual mode: just save totals and parallelism, no reallocation
        await base44.entities.TeamPlanEntry.update(entry.id, updateData);
        qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] });
      } else {
        // Update totals and parallelism, then reallocate all included entries from scratch
        const updated = { ...entry, ...updateData };
        const allEntries = sortedEntries.filter(e => !e.excluded_from_allocation).map(e => e.id === entry.id ? updated : e);
        const allocMap = reallocateAll(allEntries, sprints, beSprintCaps, feSprintCaps, {}, selectedTeam?.be_developers || 1, selectedTeam?.fe_developers || 1);
        await saveReallocated(allocMap, allEntries);
      }
    },
    onSuccess: () => { setEditEntryId(null); },
  });

  const updateCellMutation = useMutation({
    mutationFn: async ({ entry, sprintName, type, newVal }) => {
      const key = type === 'be' ? 'be_weeks' : 'fe_weeks';
      const totalEffortKey = type === 'be' ? 'be_effort_weeks' : 'fe_effort_weeks';

      if (manualMode) {
        // Manual mode: just set the value directly, no clamping, no redistribution
        const val = roundHalf(Math.max(0, newVal));
        const newAllocs = sprints.map(s => {
          const a = entry.sprint_allocations?.find(a => a.sprint === s) || { sprint: s, be_weeks: 0, fe_weeks: 0 };
          return s === sprintName ? { ...a, [key]: val } : { ...a };
        });
        const newBE = newAllocs.reduce((s, a) => s + (a.be_weeks || 0), 0);
        const newFE = newAllocs.reduce((s, a) => s + (a.fe_weeks || 0), 0);
        await base44.entities.TeamPlanEntry.update(entry.id, { sprint_allocations: newAllocs, be_effort_weeks: newBE, fe_effort_weeks: newFE });
        qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] });
        return;
      }

      const sprintIdx = sprints.indexOf(sprintName);
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

      const modifiedEntry = { ...entry, sprint_allocations: lockedAllocs };
      const allEntries = sortedEntries.map(e => e.id === entry.id ? modifiedEntry : e);

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

      const updatedEntry = { ...entry, sprint_allocations: finalAllocs, be_effort_weeks: newBE, fe_effort_weeks: newFE };
      const allUpdated = sortedEntries.map(e => e.id === entry.id ? updatedEntry : e);
      const allocMap = reallocateAll(allUpdated, sprints, beSprintCaps, feSprintCaps, {}, selectedTeam?.be_developers || 1, selectedTeam?.fe_developers || 1);
      const othersAllocMap = Object.fromEntries(Object.entries(allocMap).filter(([id]) => id !== entry.id));
      if (Object.keys(othersAllocMap).length > 0) await saveReallocated(othersAllocMap);
      else qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] });
    },
    onSuccess: () => { setEditCell(null); },
  });

  const reorderEntryMutation = useMutation({
    mutationFn: async (reorderedEntries) => {
      // Assign new sort_order values and save
      const updates = reorderedEntries.map((e, i) =>
        base44.entities.TeamPlanEntry.update(e.id, { sort_order: i + 1 })
      );
      await Promise.all(updates);
      if (!manualMode) {
        const withNewOrder = reorderedEntries.map((e, i) => ({ ...e, sort_order: i + 1 }));
        const allocMap = reallocateAll(withNewOrder.filter(e => !e.excluded_from_allocation), sprints, beSprintCaps, feSprintCaps, {}, selectedTeam?.be_developers || 1, selectedTeam?.fe_developers || 1);
        await saveReallocated(allocMap);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }),
  });

  const [deletePlanOpen, setDeletePlanOpen] = useState(false);

  const signPlanMutation = useMutation({
    mutationFn: async () => {
      const snapshot = JSON.stringify(entries.map(e => ({
        id: e.id,
        feature_id: e.feature_id,
        be_effort_weeks: e.be_effort_weeks,
        fe_effort_weeks: e.fe_effort_weeks,
        sprint_allocations: e.sprint_allocations
      })));
      
      if (signedPlan) {
        return base44.entities.SignedQuarterPlan.update(signedPlan.id, { allocations_snapshot: snapshot, signed_date: new Date().toISOString() });
      } else {
        return base44.entities.SignedQuarterPlan.create({
          team_id: selectedTeamId,
          quarter: selectedQuarter,
          year: selectedYear,
          allocations_snapshot: snapshot,
          signed_by: user?.email
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['signedPlan', selectedTeamId, selectedYear, selectedQuarter] });
    }
  });

  const deletePlanMutation = useMutation({
    mutationFn: async () => {
      if (signedPlan) {
        await base44.entities.SignedQuarterPlan.delete(signedPlan.id);
      }
      // Delete all actual progress records for this team and quarter
      const actualProgressRecords = await base44.entities.ActualProgress.filter({ team_id: selectedTeamId, year: selectedYear, quarter: selectedQuarter });
      if (actualProgressRecords.length > 0) {
        await Promise.all(actualProgressRecords.map(record => base44.entities.ActualProgress.delete(record.id)));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['signedPlan', selectedTeamId, selectedYear, selectedQuarter] });
      qc.invalidateQueries({ queryKey: ['actualProgress', selectedTeamId, selectedYear, selectedQuarter] });
      setDeletePlanOpen(false);
    }
  });



  // Use a ref to always have fresh state in the drag handler (avoids stale closure)
  const dndStateRef = useRef({});
  dndStateRef.current = { sortedEntries, sprints, beSprintCaps, feSprintCaps, canEdit, manualMode, selectedTeam };

  // --- Native pointer drag state for feature-row → sprint drops ---
  const [nativeDrag, setNativeDrag] = useState(null); // { entryId, x, y } while dragging
  const nativeDragRef = useRef(null);
  const ghostRef = useRef(null);

  const startNativeDrag = useCallback((e, entry, feat) => {
    if (!manualMode) return; // only in manual mode
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;

    const onMove = (ev) => {
      if (!started && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 4) {
        started = true;
        nativeDragRef.current = { entryId: entry.id, feat };
        setNativeDrag({ entryId: entry.id, feat, x: ev.clientX, y: ev.clientY });
      }
      if (started) {
        setNativeDrag(d => d ? { ...d, x: ev.clientX, y: ev.clientY } : null);
        // Highlight sprint zone under cursor
        document.querySelectorAll('[data-sprint-drop]').forEach(el => {
          const r = el.getBoundingClientRect();
          const over = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
          el.setAttribute('data-drop-active', over ? '1' : '0');
        });
      }
    };

    const onUp = (ev) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.querySelectorAll('[data-sprint-drop]').forEach(el => el.setAttribute('data-drop-active', '0'));

      if (!started || !nativeDragRef.current) { setNativeDrag(null); nativeDragRef.current = null; return; }

      // Find which sprint zone the pointer is over
      const { sortedEntries: currentEntries, sprints: sprintList } = dndStateRef.current;
      let target = null;
      document.querySelectorAll('[data-sprint-drop]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          target = el.getAttribute('data-sprint-drop'); // e.g. "S9-be"
        }
      });

      setNativeDrag(null);
      nativeDragRef.current = null;

      if (!target) return;
      const match = target.match(/^(.+)-(be|fe)$/);
      if (!match) return;
      const [, destSprint, type] = match;
      const key = type === 'be' ? 'be_weeks' : 'fe_weeks';
      const totalKey = type === 'be' ? 'be_effort_weeks' : 'fe_effort_weeks';

      const entryObj = currentEntries.find(e => e.id === entry.id);
      if (!entryObj) return;
      const effort = entryObj[totalKey] || 0;
      if (effort === 0) return;

      const newAllocs = sprintList.map(s => {
        const a = entryObj.sprint_allocations?.find(a => a.sprint === s) || { sprint: s, be_weeks: 0, fe_weeks: 0 };
        if (s === destSprint) return { ...a, [key]: (a[key] || 0) + effort };
        return { ...a };
      });
      const newBE = newAllocs.reduce((s, a) => s + (a.be_weeks || 0), 0);
      const newFE = newAllocs.reduce((s, a) => s + (a.fe_weeks || 0), 0);
      base44.entities.TeamPlanEntry.update(entry.id, { sprint_allocations: newAllocs, be_effort_weeks: newBE, fe_effort_weeks: newFE })
        .then(() => qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }));
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [manualMode, qc, selectedYear, selectedQuarter, selectedTeamId]);

  const handleDragEnd = useCallback((result) => {
    const { sortedEntries: currentEntries, sprints: sprintList, beSprintCaps: beCaps, feSprintCaps: feCaps, manualMode: isManual, selectedTeam: team } = dndStateRef.current;
    if (!result.destination) return;
    const { draggableId, source, destination } = result;

    // --- Feature reorder in Planned Features list ---
    if (source.droppableId === 'planned-features-list' && destination.droppableId === 'planned-features-list') {
      if (source.index === destination.index) return;
      const reordered = Array.from(currentEntries);
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      reorderEntryMutation.mutate(reordered);
      return;
    }

    // --- Sprint card to sprint card DnD ---
    if (source.droppableId !== destination.droppableId) {
      const dragMatch = draggableId.match(/^(.+)-drag-(be|fe)-(.+)$/);
      if (!dragMatch) return;
      const [, entryId, type] = dragMatch;
      const key = type === 'be' ? 'be_weeks' : 'fe_weeks';
      const srcSprint = source.droppableId.replace(new RegExp(`-${type}$`), '');
      const destSprint = destination.droppableId.replace(new RegExp(`-${type}$`), '');

      if (isManual) {
        const entry = currentEntries.find(e => e.id === entryId);
        if (!entry) return;
        const movedVal = entry.sprint_allocations?.find(a => a.sprint === srcSprint)?.[key] || 0;
        if (movedVal === 0) return;
        const newAllocs = sprintList.map(s => {
          const a = entry.sprint_allocations?.find(a => a.sprint === s) || { sprint: s, be_weeks: 0, fe_weeks: 0 };
          if (s === srcSprint) return { ...a, [key]: 0 };
          if (s === destSprint) return { ...a, [key]: (a[key] || 0) + movedVal };
          return { ...a };
        });
        const newBE = newAllocs.reduce((s, a) => s + (a.be_weeks || 0), 0);
        const newFE = newAllocs.reduce((s, a) => s + (a.fe_weeks || 0), 0);
        base44.entities.TeamPlanEntry.update(entryId, { sprint_allocations: newAllocs, be_effort_weeks: newBE, fe_effort_weeks: newFE })
          .then(() => qc.invalidateQueries({ queryKey: ['teamPlanEntries', selectedYear, selectedQuarter, selectedTeamId] }));
      } else {
        const destSprintIdx = sprintList.indexOf(destSprint);
        if (destSprintIdx < 0) return;
        const pinnedStarts = { [entryId]: destSprintIdx };
        const allocMap = reallocateAll(currentEntries, sprintList, beCaps, feCaps, pinnedStarts, team?.be_developers || 1, team?.fe_developers || 1);
        saveReallocated(allocMap);
      }
    }
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

  // Each card is ~52px tall (py-1.5 + title + effort row + 6px gap), use 52px per card
  const CARD_HEIGHT = 52;
  const maxBeCards = Math.max(1, ...sprints.map(s => sortedEntries.filter(e => (e.sprint_allocations?.find(a => a.sprint === s)?.be_weeks || 0) > 0).length));
  const beDropHeight = Math.max(40, maxBeCards * CARD_HEIGHT);
  // FE drop zone: just a small minimum — height is naturally pushed down by the BE zone above
  const feDropHeight = 40;

  return (
    <div className="space-y-6">
      {/* Native drag ghost */}
      {nativeDrag && (
        <div
          ref={ghostRef}
          style={{ position: 'fixed', left: nativeDrag.x + 12, top: nativeDrag.y + 12, pointerEvents: 'none', zIndex: 9999 }}
          className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-md shadow-xl max-w-[160px] truncate"
        >
          {nativeDrag.feat?.title}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Select value={selectedTeamId} onValueChange={handleTeamChange}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Select a team..." />
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
           {selectedTeamId && (
             <Button
               onClick={() => signedPlan ? setDeletePlanOpen(true) : signPlanMutation.mutate()}
               disabled={signPlanMutation.isPending || deletePlanMutation.isPending || entries.length === 0}
               variant="outline"
             >
               <CheckCircle className="w-4 h-4" />
               {signedPlan ? 'Re-sign Plan' : 'Sign Plan'}
             </Button>
           )}
           {canEdit && (
             <Button onClick={() => setAddFeatureOpen(true)} disabled={!selectedTeamId}><Plus className="w-4 h-4" />Add Feature</Button>
           )}
         </div>
      </div>



      {!selectedTeamId ? (
        <div className="text-center py-24 text-muted-foreground">
          <Info className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a team to view their quarterly plan</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="space-y-6">
          {/* Sprint Allocation Section */}
           <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <h2 className="text-base font-semibold text-foreground">Sprints Allocation — {selectedTeam?.name}</h2>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={toggleManualMode}
                      variant="outline"
                      size="sm"
                      className={`text-xs ${manualMode ? 'ring-2 ring-primary/40 ring-inset' : 'opacity-60'}`}
                    >
                      <Wrench className="w-3 h-3" />
                      {manualMode ? 'Manual' : 'Auto'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {manualMode
                      ? 'Manual mode ON — drag features into sprints. Cell edits save as-is. Capacity limits not enforced. Click to switch to Auto.'
                      : 'Auto mode — allocations are computed automatically by priority. Click to switch to Manual.'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-sm">
              <span className={totalBEUsed > totalBECap ? 'text-red-500 font-semibold' : 'text-foreground'}>
                BE: {totalBEUsed}w / {totalBECap}w
                {totalBEUsed > totalBECap && <span className="text-xs ml-1">(over capacity!)</span>}
              </span>
              <span className={totalFEUsed > totalFECap ? 'text-red-500 font-semibold' : 'text-foreground'}>
                FE: {totalFEUsed}w / {totalFECap}w
                {totalFEUsed > totalFECap && <span className="text-xs ml-1">(over capacity!)</span>}
              </span>
              {canEdit && <span className="text-xs text-muted-foreground italic">Click any effort value to edit it</span>}
            </div>

            {/* Sprint Cards */}
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
                   <div key={sprint} className={`rounded-xl min-w-0 overflow-hidden border ${darkMode ? 'bg-[#1a1530] border-slate-700' : 'bg-slate-50 border-border'}`}>
                     {/* Sprint header */}
                     <div className={`px-3 py-2.5 border-b text-center ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-muted/30 border-border'}`}>
                       <p className={`font-bold text-sm ${darkMode ? 'text-slate-100' : 'text-foreground'}`}>{sprint}</p>
                       <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-muted-foreground'}`}>2 weeks</p>
                     </div>

                     {/* BE Section */}
                     <div className={`p-2.5 border-b ${darkMode ? 'border-slate-700' : 'border-border'}`}>
                       <div className="flex items-center justify-between mb-1">
                         <span className={`text-xs font-semibold ${beOver ? 'text-red-400' : darkMode ? 'text-blue-400' : 'text-blue-500'}`}>BE</span>
                         <span className={`text-xs font-semibold ${beOver ? 'text-red-400' : darkMode ? 'text-slate-400' : 'text-muted-foreground'}`}>{beUsed}/{thisBeSprintCap}w</span>
                       </div>
                       <div className={`w-full rounded-full h-1.5 mb-2 ${darkMode ? 'bg-slate-700' : 'bg-muted'}`}>
                         <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, thisBeSprintCap > 0 ? (beUsed / thisBeSprintCap) * 100 : 0)}%`, backgroundColor: beOver ? '#ef4444' : '#0F52BA' }} />
                       </div>
                        <Droppable droppableId={`${sprint}-be`}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              data-sprint-drop={`${sprint}-be`}
                              data-drop-active="0"
                              style={{ minHeight: beDropHeight }}
                              className={`space-y-1.5 rounded-lg transition-colors duration-150 ${snapshot.isDraggingOver || nativeDrag ? '' : ''} [&[data-drop-active='1']]:bg-blue-500/20 [&[data-drop-active='1']]:ring-2 [&[data-drop-active='1']]:ring-blue-400/60 [&[data-drop-active='1']]:ring-inset ${snapshot.isDraggingOver ? 'bg-blue-500/10 ring-1 ring-blue-400/30 ring-inset' : ''}`}
                            >
                              {beFeatures.map((entry, idx) => {
                               const feat = featureMap[entry.feature_id];
                               const alloc = entry.sprint_allocations?.find(a => a.sprint === sprint);
                               const cellKey = `${entry.id}-${sprint}-be`;
                               const dragId = `${entry.id}-drag-be-${sprint}`;
                               return (
                                 <Draggable key={cellKey} draggableId={dragId} index={idx} isDragDisabled={false}>
                                   {(drag, dragSnapshot) => (
                                     <div
                                       ref={drag.innerRef}
                                       {...drag.draggableProps}
                                       {...drag.dragHandleProps}
                                       style={drag.draggableProps.style}
                                       className={`rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing ${darkMode ? 'bg-blue-900 border border-blue-700' : 'bg-blue-50 border border-blue-200'} ${dragSnapshot.isDragging ? 'shadow-lg opacity-95 z-50' : ''}`}
                                       >
                                       <p className={`text-[11px] font-semibold leading-tight truncate ${darkMode ? 'text-blue-200' : 'text-blue-600'}`}>{feat?.title}</p>
                                       {canEdit && editCell?.key === cellKey ? (
                                         <Input autoFocus type="number" min="0" step="0.5" value={editCellValue}
                                           onChange={e => setEditCellValue(e.target.value)}
                                           onBlur={() => updateCellMutation.mutate({ entry, sprintName: sprint, type: 'be', newVal: Number(editCellValue) })}
                                           onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditCell(null); }}
                                           className="h-5 w-14 text-[11px] p-0.5 mt-0.5 border-blue-400/40"
                                         />
                                       ) : (
                                         <p
                                           className={`text-xs text-muted-foreground mt-0.5 underline decoration-dotted ${canEdit ? 'cursor-pointer' : ''}`}
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
                              {beFeatures.length === 0 && <p className="text-[10px] text-muted-foreground/40 text-center py-1">—</p>}
                            </div>
                          )}
                        </Droppable>
                      </div>

                      {/* FE Section */}
                      <div className="p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-500'}`}>FE</span>
                          <span className={`text-xs font-semibold ${feOver ? 'text-red-400' : darkMode ? 'text-slate-400' : 'text-muted-foreground'}`}>{feUsed}/{thisFeSprintCap}w</span>
                        </div>
                        <div className={`w-full rounded-full h-1.5 mb-2 ${darkMode ? 'bg-slate-700' : 'bg-muted'}`}>
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, thisFeSprintCap > 0 ? (feUsed / thisFeSprintCap) * 100 : 0)}%`, backgroundColor: feOver ? '#ef4444' : '#10b981' }} />
                        </div>
                        <Droppable droppableId={`${sprint}-fe`}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              data-sprint-drop={`${sprint}-fe`}
                              data-drop-active="0"
                              style={{ minHeight: feDropHeight }}
                              className={`space-y-1.5 rounded-lg transition-colors duration-150 [&[data-drop-active='1']]:bg-emerald-500/20 [&[data-drop-active='1']]:ring-2 [&[data-drop-active='1']]:ring-emerald-400/60 [&[data-drop-active='1']]:ring-inset ${snapshot.isDraggingOver ? 'bg-emerald-500/10 ring-1 ring-emerald-400/30 ring-inset' : ''}`}
                            >
                              {feFeatures.map((entry, idx) => {
                               const feat = featureMap[entry.feature_id];
                               const alloc = entry.sprint_allocations?.find(a => a.sprint === sprint);
                               const cellKey = `${entry.id}-${sprint}-fe`;
                               const dragId = `${entry.id}-drag-fe-${sprint}`;
                               return (
                                 <Draggable key={cellKey} draggableId={dragId} index={idx} isDragDisabled={false}>
                                   {(drag, dragSnapshot) => (
                                     <div
                                       ref={drag.innerRef}
                                       {...drag.draggableProps}
                                       {...drag.dragHandleProps}
                                       style={drag.draggableProps.style}
                                       className={`rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing ${darkMode ? 'bg-emerald-900 border border-emerald-700' : 'bg-emerald-50 border border-emerald-200'} ${dragSnapshot.isDragging ? 'shadow-lg opacity-95 z-50' : ''}`}
                                       >
                                       <p className={`text-[11px] font-semibold leading-tight truncate ${darkMode ? 'text-emerald-200' : 'text-emerald-600'}`}>{feat?.title}</p>
                                       {canEdit && editCell?.key === cellKey ? (
                                         <Input autoFocus type="number" min="0" step="0.5" value={editCellValue}
                                           onChange={e => setEditCellValue(e.target.value)}
                                           onBlur={() => updateCellMutation.mutate({ entry, sprintName: sprint, type: 'fe', newVal: Number(editCellValue) })}
                                           onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditCell(null); }}
                                           className="h-5 w-14 text-[11px] p-0.5 mt-0.5 border-emerald-400/40"
                                         />
                                       ) : (
                                         <p
                                           className={`text-xs text-muted-foreground mt-0.5 underline decoration-dotted ${canEdit ? 'cursor-pointer' : ''}`}
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
                              {feFeatures.length === 0 && <p className="text-[10px] text-muted-foreground/40 text-center py-1">—</p>}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    </div>
                  );
                })}
              </div>
          </div>

          {/* Bottom: Planned Features + Pie Chart */}
          <div className="grid lg:grid-cols-[1fr_380px] gap-6">
            {/* Planned Features */}
            <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Planned Features</h3>
                {canEdit && <p className="text-xs text-muted-foreground italic">
                  {manualMode ? 'Drag a feature into a sprint to assign it · ' : (sortedEntries.length > 1 ? 'Drag rows to reorder · ' : '')}
                  Click <Pencil className="w-3 h-3 inline" /> to set effort
                </p>}
              </div>
              <Droppable droppableId="planned-features-list">
                {(listProvided) => (
                <div ref={listProvided.innerRef} {...listProvided.droppableProps} className="space-y-0">
                {sortedEntries.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No features planned yet</p>}
                {sortedEntries.map((entry, rowIdx) => {
                  const feat = featureMap[entry.feature_id];
                  if (!feat) return null;
                  const isEditing = editEntryId === entry.id;
                  return (
                    <Draggable key={entry.id} draggableId={`row-${entry.id}`} index={rowIdx} isDragDisabled={manualMode}>
                    {(rowDrag, rowSnapshot) => (
                      <div
                        ref={rowDrag.innerRef}
                        {...rowDrag.draggableProps}
                        style={rowDrag.draggableProps.style}
                        className={`py-2 border-b border-border/50 last:border-0 ${entry.excluded_from_allocation ? 'opacity-50' : ''}`}
                      >
                        {rowSnapshot.isDragging ? (
                          <div className="bg-primary text-primary-foreground text-xs font-semibold px-2 py-1 rounded-md shadow-xl truncate w-32">
                            {feat.title}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div
                              {...(!manualMode ? rowDrag.dragHandleProps : {})}
                              onPointerDown={manualMode ? (e) => startNativeDrag(e, entry, feat) : undefined}
                              className={`cursor-grab active:cursor-grabbing shrink-0 ${manualMode ? 'text-primary/50 hover:text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
                            >
                              <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg>
                            </div>
                            <div className="flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-bold text-indigo-400 shrink-0 bg-indigo-900 shadow-md">
                              {rowIdx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-foreground truncate">{feat.title}</p>
                                {feat.objective && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white shrink-0" style={{ backgroundColor: objColor(feat.objective) }}>
                                    {feat.objective}
                                  </span>
                                )}
                                {(() => { const range = getSprintRange(entry); return range ? (
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {range.start === range.end ? range.start : `${range.start} → ${range.end}`}
                                  </span>
                                ) : null; })()}
                              </div>
                            </div>
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <Server className="w-3 h-3 text-blue-500" />
                                  <Input type="number" min="0" step="0.5" value={editEffort.be} onChange={e => setEditEffort(p => ({ ...p, be: e.target.value }))} className="h-7 w-14 text-xs" placeholder="0" title="BE effort" />
                                  <span className="text-xs text-muted-foreground">/</span>
                                  <Input type="number" min="1" value={editEffort.beParallelism} onChange={e => setEditEffort(p => ({ ...p, beParallelism: e.target.value }))} className="h-7 w-14 text-xs" placeholder="1" title="BE parallelism" />
                                </div>
                                <div className="flex items-center gap-1">
                                  <Monitor className="w-3 h-3 text-emerald-500" />
                                  <Input type="number" min="0" step="0.5" value={editEffort.fe} onChange={e => setEditEffort(p => ({ ...p, fe: e.target.value }))} className="h-7 w-14 text-xs" placeholder="0" title="FE effort" />
                                  <span className="text-xs text-muted-foreground">/</span>
                                  <Input type="number" min="1" value={editEffort.feParallelism} onChange={e => setEditEffort(p => ({ ...p, feParallelism: e.target.value }))} className="h-7 w-14 text-xs" placeholder="1" title="FE parallelism" />
                                </div>
                                <Button size="sm" className="h-7 text-xs px-2" onClick={() => updateEffortMutation.mutate({ entry, beEffort: Number(editEffort.be) || 0, feEffort: Number(editEffort.fe) || 0, beParallelism: Number(editEffort.beParallelism) || 1, feParallelism: Number(editEffort.feParallelism) || 1 })}>Save</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditEntryId(null)}>Cancel</Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Server className="w-3 h-3 text-blue-500" />
                                  <span className="font-medium text-foreground">{entry.be_effort_weeks || 0}w</span>
                                  <span className="text-muted-foreground">/</span>
                                  <Users2 className="w-3 h-3 text-blue-400" />
                                  <span className="font-medium text-foreground">{entry.be_parallelism || 1}</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Monitor className="w-3 h-3 text-emerald-500" />
                                  <span className="font-medium text-foreground">{entry.fe_effort_weeks || 0}w</span>
                                  <span className="text-muted-foreground">/</span>
                                  <Users2 className="w-3 h-3 text-emerald-400" />
                                  <span className="font-medium text-foreground">{entry.fe_parallelism || 1}</span>
                                </div>
                                <Button
                                  variant="ghost" size="icon"
                                  className={`h-6 w-6 ${entry.excluded_from_allocation ? 'text-rose-400 hover:text-rose-300' : 'text-emerald-500 hover:text-emerald-400'}`}
                                  title={entry.excluded_from_allocation ? 'Excluded — click to include' : 'Included — click to exclude'}
                                  onClick={() => toggleExcludeMutation.mutate({ entry, excluded: !entry.excluded_from_allocation })}
                                >
                                  {entry.excluded_from_allocation ? <CircleMinus className="w-3.5 h-3.5" /> : <CircleCheck className="w-3.5 h-3.5" />}
                                </Button>
                                {canEdit && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => { setEditEntryId(entry.id); setEditEffort({ be: String(entry.be_effort_weeks || 0), fe: String(entry.fe_effort_weeks || 0), beParallelism: String(entry.be_parallelism || 1), feParallelism: String(entry.fe_parallelism || 1) }); }}>
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
                        )}
                      </div>
                    )}
                    </Draggable>
                  );
                })}
                {listProvided.placeholder}
                </div>
                )}
              </Droppable>
            </div>

            {/* Pie Chart */}
            <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
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
                      <RechartsTooltip formatter={(value, name) => [`${value}w`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {effortByObjective.map((entry, index) => {
                      const total = effortByObjective.reduce((s, d) => s + d.value, 0);
                      const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                      const color = colorMap[entry.name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
                      return (
                        <div key={entry.name} className="flex items-center gap-1 text-xs text-muted-foreground">
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
          </div>
        </DragDropContext>
      )}

      {/* Delete Plan Confirmation Dialog */}
      <Dialog open={deletePlanOpen} onOpenChange={setDeletePlanOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Re-sign Plan</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Re-signing this plan will delete the current signed plan for <span className="font-semibold text-foreground">{selectedQuarter} {selectedYear}</span> and <span className="font-semibold text-foreground">remove all recorded progress</span> from the Tracking page. You will then be able to create a new plan for this quarter.
            </p>
            <p className="text-xs text-muted-foreground italic">This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePlanOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletePlanMutation.mutate()}
              disabled={deletePlanMutation.isPending}
            >
              Re-sign Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <Label className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-blue-500" />BE Effort (weeks)</Label>
                <Input type="number" min="0" step="0.5" value={effortForm.be} onChange={e => setEffortForm(p => ({ ...p, be: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5 text-emerald-500" />FE Effort (weeks)</Label>
                <Input type="number" min="0" step="0.5" value={effortForm.fe} onChange={e => setEffortForm(p => ({ ...p, fe: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Users2 className="w-3.5 h-3.5 text-blue-400" />BE Parallelism</Label>
                <Input type="number" min="1" value={effortForm.beParallelism} onChange={e => setEffortForm(p => ({ ...p, beParallelism: e.target.value }))} placeholder="1" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Users2 className="w-3.5 h-3.5 text-emerald-400" />FE Parallelism</Label>
                <Input type="number" min="1" value={effortForm.feParallelism} onChange={e => setEffortForm(p => ({ ...p, feParallelism: e.target.value }))} placeholder="1" />
              </div>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddFeatureOpen(false); setAddMode('existing'); setSelectedFeatureId(''); setCustomFeatureTitle(''); setCustomFeatureObjective(''); setEffortForm({ be: '', fe: '' }); }}>Cancel</Button>
            <Button
              onClick={() => addEntryMutation.mutate({ featureId: selectedFeatureId, customTitle: customFeatureTitle, beEffort: Number(effortForm.be) || 0, feEffort: Number(effortForm.fe) || 0, beParallelism: Number(effortForm.beParallelism) || 1, feParallelism: Number(effortForm.feParallelism) || 1 })}
              disabled={addEntryMutation.isPending || (addMode === 'existing' ? !selectedFeatureId : (!customFeatureTitle.trim() || !customFeatureObjective))}
            >Add to Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}