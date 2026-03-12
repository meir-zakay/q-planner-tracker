import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useQuarterSelection } from '@/components/QuarterContext';
import RoleGate from '@/components/RoleGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Server, Monitor, Users, CheckSquare, Square } from 'lucide-react';

export default function Capacity() {
  const { userRole } = useOutletContext();
  const { selectedYear, selectedQuarter } = useQuarterSelection();
  const qc = useQueryClient();

  const { data: teamsRaw = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const teams = useMemo(() => [...teamsRaw].sort((a, b) => a.name.localeCompare(b.name)), [teamsRaw]);

  // Local edits state: { [teamId]: { be_capacity_weeks, fe_capacity_weeks, included } }
  const [edits, setEdits] = useState({});
  const [saved, setSaved] = useState({});

  // Initialize edits when teams load
  React.useEffect(() => {
    if (teams.length === 0) return;
    setEdits(prev => {
      const next = { ...prev };
      teams.forEach(t => {
        if (!next[t.id]) {
          next[t.id] = {
            be_capacity_weeks: t.be_capacity_weeks ?? '',
            fe_capacity_weeks: t.fe_capacity_weeks ?? '',
            included: true,
          };
        }
      });
      return next;
    });
  }, [teams]);

  const updateTeamMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Team.update(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      setSaved(p => ({ ...p, [vars.id]: true }));
      setTimeout(() => setSaved(p => { const n = { ...p }; delete n[vars.id]; return n; }), 2000);
    },
  });

  const setField = (teamId, field, value) => {
    setEdits(p => ({ ...p, [teamId]: { ...p[teamId], [field]: value } }));
  };

  const toggleIncluded = (teamId) => {
    setEdits(p => ({ ...p, [teamId]: { ...p[teamId], included: !p[teamId]?.included } }));
  };

  const handleSave = (team) => {
    const e = edits[team.id] || {};
    updateTeamMutation.mutate({
      id: team.id,
      data: {
        be_capacity_weeks: Number(e.be_capacity_weeks) || 0,
        fe_capacity_weeks: Number(e.fe_capacity_weeks) || 0,
      },
    });
  };

  const includedTeams = teams.filter(t => edits[t.id]?.included !== false);
  const totalBE = includedTeams.reduce((s, t) => s + (Number(edits[t.id]?.be_capacity_weeks) || 0), 0);
  const totalFE = includedTeams.reduce((s, t) => s + (Number(edits[t.id]?.fe_capacity_weeks) || 0), 0);

  return (
    <RoleGate allowed={['admin']}>
      <div className="space-y-6">
        {/* Summary bar */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Teams in quarter:</span>
            <span className="text-sm font-semibold text-foreground">{includedTeams.length}</span>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3">
            <Server className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">Total BE Capacity:</span>
            <span className="text-sm font-semibold text-foreground">{totalBE}w</span>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3">
            <Monitor className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-muted-foreground">Total FE Capacity:</span>
            <span className="text-sm font-semibold text-foreground">{totalFE}w</span>
          </div>
        </div>

        {/* Teams table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Team Capacity — {selectedQuarter} {selectedYear}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Check teams participating in this quarter and set their BE/FE capacity in weeks.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Header row */}
              <div className="grid grid-cols-[2rem_1fr_10rem_10rem_6rem] gap-3 items-center px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-2">
                <span></span>
                <span>Team</span>
                <span className="flex items-center gap-1"><Server className="w-3 h-3 text-primary" />BE Capacity (w)</span>
                <span className="flex items-center gap-1"><Monitor className="w-3 h-3 text-emerald-500" />FE Capacity (w)</span>
                <span></span>
              </div>

              {teams.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No teams found. Create teams first.</p>
              )}

              {teams.map(team => {
                const e = edits[team.id] || {};
                const included = e.included !== false;
                const isSaving = updateTeamMutation.isPending && updateTeamMutation.variables?.id === team.id;
                const wasSaved = saved[team.id];

                return (
                  <div
                    key={team.id}
                    className={`grid grid-cols-[2rem_1fr_10rem_10rem_6rem] gap-3 items-center px-3 py-2.5 rounded-lg transition-colors ${included ? 'bg-muted/30' : 'opacity-50 bg-transparent'}`}
                  >
                    {/* Checkbox */}
                    <Checkbox
                      checked={included}
                      onCheckedChange={() => toggleIncluded(team.id)}
                    />

                    {/* Team name */}
                    <div>
                      <p className="text-sm font-medium text-foreground">{team.name}</p>
                      {team.team_lead_name && (
                        <p className="text-xs text-muted-foreground">{team.team_lead_name}</p>
                      )}
                    </div>

                    {/* BE capacity */}
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      disabled={!included}
                      value={e.be_capacity_weeks ?? ''}
                      onChange={ev => setField(team.id, 'be_capacity_weeks', ev.target.value)}
                      className="h-8 text-sm"
                      placeholder="0"
                    />

                    {/* FE capacity */}
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      disabled={!included}
                      value={e.fe_capacity_weeks ?? ''}
                      onChange={ev => setField(team.id, 'fe_capacity_weeks', ev.target.value)}
                      className="h-8 text-sm"
                      placeholder="0"
                    />

                    {/* Save button */}
                    <Button
                      size="sm"
                      variant={wasSaved ? 'secondary' : 'default'}
                      className="h-8 text-xs"
                      disabled={!included || isSaving}
                      onClick={() => handleSave(team)}
                    >
                      {isSaving ? 'Saving…' : wasSaved ? 'Saved ✓' : 'Save'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGate>
  );
}