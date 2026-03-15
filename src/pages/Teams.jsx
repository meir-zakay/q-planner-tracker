import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RoleGate from '@/components/RoleGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Server, Monitor, X, Users, Copy } from 'lucide-react';
import { useQuarterSelection } from '@/components/QuarterContext';

const emptyTeam = { name: '', be_developers: 0, be_capacity_weeks: 0, fe_developers: 0, fe_capacity_weeks: 0, team_lead_email: '', team_lead_name: '' };

export default function Teams() {
  const qc = useQueryClient();
  const { selectedYear, selectedQuarter } = useQuarterSelection();
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState(emptyTeam);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySource, setCopySource] = useState('');

  const { data: allTeamsRaw = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => base44.entities.User.list() });

  // Teams for the current quarter/year
  const teams = useMemo(() =>
    [...allTeamsRaw]
      .filter(t => t.quarter === selectedQuarter && t.year === selectedYear)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [allTeamsRaw, selectedQuarter, selectedYear]
  );

  // Available source quarters to copy from (distinct quarter+year combos that have teams, excluding current)
  const sourceQuarters = useMemo(() => {
    const seen = new Set();
    const result = [];
    allTeamsRaw.forEach(t => {
      if (!t.quarter || !t.year) return;
      const key = `${t.quarter}-${t.year}`;
      if (key === `${selectedQuarter}-${selectedYear}`) return;
      if (!seen.has(key)) { seen.add(key); result.push({ label: `${t.quarter} ${t.year}`, key }); }
    });
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }, [allTeamsRaw, selectedQuarter, selectedYear]);

  const saveMutation = useMutation({
    mutationFn: (data) => editId
      ? base44.entities.Team.update(editId, data)
      : base44.entities.Team.create({ ...data, quarter: selectedQuarter, year: selectedYear }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); setFormOpen(false); setEditId(null); setFormData(emptyTeam); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Team.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); setDeleteConfirm(null); },
  });

  const removeLeadMutation = useMutation({
    mutationFn: (id) => base44.entities.Team.update(id, { team_lead_email: '', team_lead_name: '' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });

  const copyMutation = useMutation({
    mutationFn: async (sourceKey) => {
      const [srcQ, srcY] = sourceKey.split('-');
      const sourceTeams = allTeamsRaw.filter(t => t.quarter === srcQ && t.year === Number(srcY));
      await Promise.all(sourceTeams.map(t =>
        base44.entities.Team.create({
          name: t.name,
          quarter: selectedQuarter,
          year: selectedYear,
          be_developers: t.be_developers,
          be_capacity_weeks: t.be_capacity_weeks,
          fe_developers: t.fe_developers,
          fe_capacity_weeks: t.fe_capacity_weeks,
          team_lead_email: t.team_lead_email,
          team_lead_name: t.team_lead_name,
        })
      ));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); setCopyOpen(false); setCopySource(''); },
  });

  const openEdit = (team) => { setFormData({ ...emptyTeam, ...team }); setEditId(team.id); setFormOpen(true); };
  const openNew = () => { setFormData(emptyTeam); setEditId(null); setFormOpen(true); };
  const handleLeadChange = (email) => {
    const u = users.find(u => u.email === email);
    setFormData(prev => ({ ...prev, team_lead_email: email, team_lead_name: u?.full_name || '' }));
  };
  const n = (key) => (e) => setFormData(prev => ({ ...prev, [key]: Number(e.target.value) }));

  return (
    <RoleGate allowed={['admin']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{teams.length} teams in {selectedQuarter} {selectedYear}</p>
          <div className="flex gap-2">
            {sourceQuarters.length > 0 && (
              <Button variant="outline" onClick={() => setCopyOpen(true)} className="gap-2 border-0 px-5 py-2 text-sm font-semibold rounded-xl shadow-md bg-secondary hover:bg-secondary/80">
                <Copy className="w-4 h-4" />Copy from quarter
              </Button>
            )}
            <Button onClick={openNew} className="gap-2 px-5 py-2 text-sm font-semibold rounded-xl shadow-md"><Plus className="w-4 h-4" />Add Team</Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map(team => (
            <div key={team.id} className="rounded-xl p-5 bg-card dark:bg-[hsl(228_30%_7%)] border border-border dark:border-[hsl(228_25%_14%)]">
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-semibold text-foreground text-base">{team.name}</h3>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(team)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteConfirm(team)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Server className="w-3.5 h-3.5 text-blue-500" />
                    <span>{team.be_developers || 0} BE devs</span>
                  </div>
                  <span className="text-muted-foreground">{team.be_capacity_weeks || 0}w capacity</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Monitor className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{team.fe_developers || 0} FE devs</span>
                  </div>
                  <span className="text-muted-foreground">{team.fe_capacity_weeks || 0}w capacity</span>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                {team.team_lead_name ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-primary">{team.team_lead_name[0].toUpperCase()}</span>
                      </div>
                      <span className="text-sm text-foreground">{team.team_lead_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Team Lead</span>
                      <button onClick={() => removeLeadMutation.mutate(team.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No team lead assigned</p>
                )}
              </div>
            </div>
          ))}
          {teams.length === 0 && (
            <div className="col-span-3 text-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No teams for {selectedQuarter} {selectedYear}.</p>
              <p className="text-xs mt-1 opacity-70">Add a team or copy from another quarter.</p>
            </div>
          )}
        </div>

        {/* Add / Edit Dialog */}
        <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditId(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editId ? 'Edit Team' : `New Team — ${selectedQuarter} ${selectedYear}`}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Team Name</Label>
                <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>BE Developers</Label><Input type="number" min="0" value={formData.be_developers} onChange={n('be_developers')} /></div>
                <div className="space-y-1.5"><Label>BE Capacity (w)</Label><Input type="number" min="0" value={formData.be_capacity_weeks} onChange={n('be_capacity_weeks')} /></div>
                <div className="space-y-1.5"><Label>FE Developers</Label><Input type="number" min="0" value={formData.fe_developers} onChange={n('fe_developers')} /></div>
                <div className="space-y-1.5"><Label>FE Capacity (w)</Label><Input type="number" min="0" value={formData.fe_capacity_weeks} onChange={n('fe_capacity_weeks')} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Team Lead</Label>
                <Select value={formData.team_lead_email || '_none'} onValueChange={(v) => handleLeadChange(v === '_none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select team lead" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No team lead</SelectItem>
                    {users.map(u => <SelectItem key={u.id} value={u.email}>{u.full_name || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setFormOpen(false); setEditId(null); }}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending || !formData.name} className="bg-indigo-600 hover:bg-indigo-500 text-white border-0 font-semibold rounded-xl shadow-md">{editId ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Copy from quarter dialog */}
        <Dialog open={copyOpen} onOpenChange={(o) => { if (!o) { setCopyOpen(false); setCopySource(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Copy Teams from Quarter</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Duplicate all teams from another quarter into <strong>{selectedQuarter} {selectedYear}</strong>.</p>
              <div className="space-y-1.5">
                <Label>Source Quarter</Label>
                <Select value={copySource} onValueChange={setCopySource}>
                  <SelectTrigger><SelectValue placeholder="Select quarter" /></SelectTrigger>
                  <SelectContent>
                    {sourceQuarters.map(q => <SelectItem key={q.key} value={q.key}>{q.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCopyOpen(false); setCopySource(''); }}>Cancel</Button>
              <Button onClick={() => copyMutation.mutate(copySource)} disabled={!copySource || copyMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-white border-0 font-semibold rounded-xl shadow-md">
                {copyMutation.isPending ? 'Copying…' : 'Copy Teams'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Team</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Delete <strong>{deleteConfirm?.name}</strong> from {selectedQuarter} {selectedYear}?</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteConfirm.id)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGate>
  );
}