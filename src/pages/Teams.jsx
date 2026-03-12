import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RoleGate from '@/components/RoleGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Server, Monitor, X, Users } from 'lucide-react';
import { useQuarterSelection } from '@/components/QuarterContext';

const emptyTeam = { name: '', be_developers: 0, be_capacity_weeks: 0, fe_developers: 0, fe_capacity_weeks: 0, team_lead_email: '', team_lead_name: '' };

export default function Teams() {
  const qc = useQueryClient();
  const { selectedYear, selectedQuarter } = useQuarterSelection();
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState(emptyTeam);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => base44.entities.User.list() });

  const saveMutation = useMutation({
    mutationFn: (data) => editId ? base44.entities.Team.update(editId, data) : base44.entities.Team.create(data),
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
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Teams</h1>
              <span className="text-sm font-medium text-primary">{selectedQuarter}-{selectedYear}</span>
            </div>
            <p className="text-sm text-muted-foreground">{teams.length} teams</p>
          </div>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add Team</Button>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map(team => (
            <div key={team.id} className="bg-card border border-border rounded-xl p-5">
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
                    <Server className="w-3.5 h-3.5" />
                    <span>{team.be_developers || 0} BE devs</span>
                  </div>
                  <span className="text-muted-foreground">{team.be_capacity_weeks || 0}w capacity</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Monitor className="w-3.5 h-3.5" />
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
              <p>No teams yet.</p>
            </div>
          )}
        </div>

        <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditId(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editId ? 'Edit Team' : 'New Team'}</DialogTitle></DialogHeader>
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
              <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending || !formData.name}>{editId ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Team</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Delete <strong>{deleteConfirm?.name}</strong>?</p>
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