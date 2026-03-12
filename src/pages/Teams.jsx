import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RoleGate from '@/components/RoleGate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, User, Users } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const emptyTeam = { name: '', be_developers: 0, be_capacity_weeks: 0, fe_developers: 0, fe_capacity_weeks: 0, team_lead_email: '', team_lead_name: '' };

export default function Teams() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState(emptyTeam);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: () => base44.entities.Team.list() });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => base44.entities.User.list() });

  const saveMutation = useMutation({
    mutationFn: (data) => editId ? base44.entities.Team.update(editId, data) : base44.entities.Team.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      setFormOpen(false);
      setEditId(null);
      setFormData(emptyTeam);
      toast({ title: editId ? 'Team updated' : 'Team created' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Team.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); setDeleteConfirm(null); },
  });

  const openEdit = (team) => {
    setFormData({ ...emptyTeam, ...team });
    setEditId(team.id);
    setFormOpen(true);
  };

  const openNew = () => { setFormData(emptyTeam); setEditId(null); setFormOpen(true); };

  const handleLeadChange = (email) => {
    const u = users.find(u => u.email === email);
    setFormData(prev => ({ ...prev, team_lead_email: email, team_lead_name: u?.full_name || '' }));
  };

  const numField = (key) => (e) => setFormData(prev => ({ ...prev, [key]: Number(e.target.value) }));

  return (
    <RoleGate allowed={['admin']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Teams</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage development teams and capacity</p>
          </div>
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />New Team</Button>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map(team => (
            <Card key={team.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{team.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(team)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(team)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
                {team.team_lead_name && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <User className="w-3 h-3" />
                    <span>{team.team_lead_name} (Lead)</span>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Backend</p>
                    <p className="text-lg font-bold text-foreground">{team.be_developers}</p>
                    <p className="text-xs text-muted-foreground">devs</p>
                    <p className="text-sm font-semibold text-indigo-500 mt-1">{team.be_capacity_weeks}w</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Frontend</p>
                    <p className="text-lg font-bold text-foreground">{team.fe_developers}</p>
                    <p className="text-xs text-muted-foreground">devs</p>
                    <p className="text-sm font-semibold text-emerald-500 mt-1">{team.fe_capacity_weeks}w</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {teams.length === 0 && (
            <div className="col-span-3 text-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No teams yet. Create your first team.</p>
            </div>
          )}
        </div>

        {/* Form Dialog */}
        <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditId(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editId ? 'Edit Team' : 'New Team'}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Team Name</Label>
                <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Payments Team" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>BE Developers</Label>
                  <Input type="number" min="0" value={formData.be_developers} onChange={numField('be_developers')} />
                </div>
                <div className="space-y-2">
                  <Label>BE Capacity (weeks)</Label>
                  <Input type="number" min="0" value={formData.be_capacity_weeks} onChange={numField('be_capacity_weeks')} />
                </div>
                <div className="space-y-2">
                  <Label>FE Developers</Label>
                  <Input type="number" min="0" value={formData.fe_developers} onChange={numField('fe_developers')} />
                </div>
                <div className="space-y-2">
                  <Label>FE Capacity (weeks)</Label>
                  <Input type="number" min="0" value={formData.fe_capacity_weeks} onChange={numField('fe_capacity_weeks')} />
                </div>
              </div>
              <div className="space-y-2">
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

        {/* Delete confirm */}
        <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Team</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?</p>
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