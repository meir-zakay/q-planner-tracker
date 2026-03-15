import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RoleGate from '@/components/RoleGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Target, Calendar } from 'lucide-react';
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const DEFAULT_SPRINTS = { Q1: ['S1','S2','S3','S4','S5','S6'], Q2: ['S7','S8','S9','S10','S11','S12'], Q3: ['S13','S14','S15','S16','S17','S18'], Q4: ['S19','S20','S21','S22','S23','S24'] };

export default function Settings() {
  const qc = useQueryClient();
  const [objForm, setObjForm] = useState(null);
  const [deleteObjConfirm, setDeleteObjConfirm] = useState(null);
  const currentYear = new Date().getFullYear();
  const [configYear, setConfigYear] = useState(currentYear);

  const { data: objectives = [] } = useQuery({ queryKey: ['objectives'], queryFn: () => base44.entities.Objective.list('sort_order') });
  const { data: quarterConfigs = [] } = useQuery({ queryKey: ['quarterConfigs'], queryFn: () => base44.entities.QuarterConfig.list() });

  const saveObjMutation = useMutation({
    mutationFn: (data) => data.id ? base44.entities.Objective.update(data.id, { name: data.name, color: data.color }) : base44.entities.Objective.create({ name: data.name, color: data.color, sort_order: objectives.length + 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['objectives'] }); setObjForm(null); },
  });

  const deleteObjMutation = useMutation({
    mutationFn: (id) => base44.entities.Objective.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['objectives'] }); setDeleteObjConfirm(null); },
  });

  const getQuarterConfig = (q) => {
    return quarterConfigs.find(c => c.year === configYear && c.quarter === q);
  };

  const getSprints = (q) => {
    const config = getQuarterConfig(q);
    return config?.sprints || DEFAULT_SPRINTS[q] || [];
  };

  const saveQuarterConfig = async (quarter, sprints) => {
    const existing = getQuarterConfig(quarter);
    if (existing) {
      await base44.entities.QuarterConfig.update(existing.id, { sprints });
    } else {
      await base44.entities.QuarterConfig.create({ year: configYear, quarter, sprints });
    }
    qc.invalidateQueries({ queryKey: ['quarterConfigs'] });
  };

  return (
    <RoleGate allowed={['admin']}>
      <>
      <div className="space-y-8">
        {/* Objectives */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <span className="text-base font-semibold text-foreground">Objectives</span>
          </div>
          <Button onClick={() => setObjForm({ name: '', color: '#6366f1' })} className="gap-2 px-5 py-2 text-sm font-semibold rounded-xl shadow-md">
            <Plus className="w-4 h-4" />Add Objective
          </Button>
        </div>
        <div className="rounded-xl overflow-hidden bg-card dark:bg-[hsl(228_30%_7%)] border border-border dark:border-[hsl(228_25%_14%)]">
          <div className="px-6 py-4 space-y-2">
            {objectives.map(obj => (
              <div key={obj.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: obj.color }} />
                  <span className="text-sm font-medium text-foreground">{obj.name}</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setObjForm({ ...obj })}><Pencil className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteObjConfirm(obj)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sprint Config */}
        <div className="rounded-xl overflow-hidden bg-card dark:bg-[hsl(228_30%_7%)] border border-border dark:border-[hsl(228_25%_14%)]">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <span className="text-base font-semibold text-foreground">Sprint Configuration</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Year:</Label>
                <Input type="number" value={configYear} onChange={e => setConfigYear(Number(e.target.value))} className="w-20 h-8 text-sm" />
              </div>
            </div>
          </div>
          <div className="px-6 pb-5">
            <div className="grid md:grid-cols-2 gap-4">
              {QUARTERS.map(q => (
                <QuarterSprintEditor
                  key={q}
                  quarter={q}
                  year={configYear}
                  sprints={getSprints(q)}
                  onSave={(sprints) => saveQuarterConfig(q, sprints)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Objective form */}
      <Dialog open={!!objForm} onOpenChange={(o) => !o && setObjForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{objForm?.id ? 'Edit Objective' : 'Add Objective'}</DialogTitle></DialogHeader>
          {objForm && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={objForm.name} onChange={e => setObjForm(p => ({ ...p, name: e.target.value }))} placeholder="Objective name" />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={objForm.color || '#6366f1'} onChange={e => setObjForm(p => ({ ...p, color: e.target.value }))} className="w-10 h-10 rounded cursor-pointer border border-border" />
                  <Input value={objForm.color || '#6366f1'} onChange={e => setObjForm(p => ({ ...p, color: e.target.value }))} className="font-mono text-sm" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setObjForm(null)}>Cancel</Button>
            <Button onClick={() => saveObjMutation.mutate(objForm)} disabled={saveObjMutation.isPending || !objForm?.name} className="bg-indigo-600 hover:bg-indigo-500 text-white border-0 font-semibold rounded-xl shadow-md">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete objective confirm */}
      <Dialog open={!!deleteObjConfirm} onOpenChange={(o) => !o && setDeleteObjConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Objective</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{deleteObjConfirm?.name}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteObjConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteObjMutation.mutate(deleteObjConfirm.id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    </RoleGate>
  );
}

function QuarterSprintEditor({ quarter, year, sprints, onSave }) {
  const [editing, setEditing] = useState(false);
  const [localSprints, setLocalSprints] = useState(sprints);

  React.useEffect(() => { setLocalSprints(sprints); }, [sprints]);

  const handleSave = () => { onSave(localSprints); setEditing(false); };

  return (
    <div className="rounded-lg p-4 space-y-3 border border-border dark:border-[hsl(228_25%_18%)]">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm text-foreground">{quarter} {year}</h4>
        {editing ? (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => { setLocalSprints(sprints); setEditing(false); }}>Cancel</Button>
            <Button size="sm" onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500 text-white border-0 font-semibold rounded-xl shadow-md">Save</Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="w-3 h-3" /></Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          {localSprints.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={s} onChange={e => { const ns = [...localSprints]; ns[i] = e.target.value; setLocalSprints(ns); }} className="h-8 text-sm" />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setLocalSprints(localSprints.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setLocalSprints([...localSprints, `S${localSprints.length + 1}`])}>
            <Plus className="w-3 h-3" />Add Sprint
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {localSprints.map((s, i) => (
            <span key={i} className="px-2 py-0.5 bg-muted rounded text-xs font-medium text-muted-foreground">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}