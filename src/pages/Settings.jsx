import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RoleGate from '@/components/RoleGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Target, Calendar, Globe, Network, X, ChevronDown, ChevronRight } from 'lucide-react';
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const DEFAULT_SPRINTS = { Q1: ['S1','S2','S3','S4','S5','S6'], Q2: ['S7','S8','S9','S10','S11','S12'], Q3: ['S13','S14','S15','S16','S17','S18'], Q4: ['S19','S20','S21','S22','S23','S24'] };

export default function Settings() {
  const qc = useQueryClient();
  const [objForm, setObjForm] = useState(null);
  const [deleteObjConfirm, setDeleteObjConfirm] = useState(null);
  const currentYear = new Date().getFullYear();
  const [configYear, setConfigYear] = useState(currentYear);

  // Domain state
  const [domainForm, setDomainForm] = useState(null);
  const [deleteDomainConfirm, setDeleteDomainConfirm] = useState(null);
  const [expandedDomains, setExpandedDomains] = useState({});
  const [newCrewInputs, setNewCrewInputs] = useState({});

  const { data: objectives = [] } = useQuery({ queryKey: ['objectives'], queryFn: () => base44.entities.Objective.list('sort_order') });
  const { data: quarterConfigs = [] } = useQuery({ queryKey: ['quarterConfigs'], queryFn: () => base44.entities.QuarterConfig.list() });
  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: () => base44.entities.Domain.list('sort_order') });

  const saveObjMutation = useMutation({
    mutationFn: (data) => data.id ? base44.entities.Objective.update(data.id, { name: data.name, color: data.color }) : base44.entities.Objective.create({ name: data.name, color: data.color, sort_order: objectives.length + 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['objectives'] }); setObjForm(null); },
  });

  const deleteObjMutation = useMutation({
    mutationFn: (id) => base44.entities.Objective.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['objectives'] }); setDeleteObjConfirm(null); },
  });

  const saveDomainMutation = useMutation({
    mutationFn: (data) => data.id
      ? base44.entities.Domain.update(data.id, { name: data.name })
      : base44.entities.Domain.create({ name: data.name, crews: [], sort_order: domains.length + 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); setDomainForm(null); },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: (id) => base44.entities.Domain.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); setDeleteDomainConfirm(null); },
  });

  const updateDomainCrews = async (domain, crews) => {
    await base44.entities.Domain.update(domain.id, { crews });
    qc.invalidateQueries({ queryKey: ['domains'] });
  };

  const addCrew = async (domain) => {
    const crew = (newCrewInputs[domain.id] || '').trim();
    if (!crew) return;
    const existing = domain.crews || [];
    if (existing.includes(crew)) return;
    await updateDomainCrews(domain, [...existing, crew]);
    setNewCrewInputs(p => ({ ...p, [domain.id]: '' }));
  };

  const removeCrew = async (domain, crew) => {
    await updateDomainCrews(domain, (domain.crews || []).filter(c => c !== crew));
  };

  const toggleDomainExpand = (id) => setExpandedDomains(p => ({ ...p, [id]: !p[id] }));

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
    <RoleGate allowed={['app_admin', 'admin']}>
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
        <div className="rounded-xl overflow-hidden bg-panel border border-border">
          <div className="px-6 py-4 space-y-2">
            {objectives.map(obj => (
              <div key={obj.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-panel border border-border transition-all hover:brightness-125 hover:border-indigo-500/40">
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

        {/* Domains */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <span className="text-base font-semibold text-foreground">Domains</span>
            </div>
            <Button onClick={() => setDomainForm({ name: '' })} className="gap-2 px-5 py-2 text-sm font-semibold rounded-xl shadow-md">
              <Plus className="w-4 h-4" />Add
            </Button>
          </div>
          <div className="rounded-xl overflow-hidden bg-panel border border-border">
            <div className="px-6 py-4 space-y-2">
              {domains.map(domain => (
                <div key={domain.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-panel border border-border transition-all hover:brightness-125 hover:border-indigo-500/40">
                  <span className="text-sm font-medium text-foreground">{domain.name}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDomainForm({ id: domain.id, name: domain.name })}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteDomainConfirm(domain)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))}
              {domains.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No domains yet</p>}
            </div>
          </div>
        </div>

        {/* Domain → Crew Associations */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" />
            <div>
              <span className="text-base font-semibold text-foreground">Domain → Crew Associations</span>
              <p className="text-xs text-muted-foreground">Define which crews belong to each domain</p>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden bg-panel border border-border divide-y divide-border">
            {domains.map(domain => {
              const expanded = expandedDomains[domain.id];
              const crews = domain.crews || [];
              return (
                <div key={domain.id}>
                  <button
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:brightness-125 transition-all"
                    onClick={() => toggleDomainExpand(domain.id)}
                  >
                    <div className="flex items-center gap-2">
                      {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-sm font-semibold text-foreground">{domain.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{crews.length} {crews.length === 1 ? 'crew' : 'crews'}</span>
                  </button>
                  {expanded && (
                    <div className="px-5 pb-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {crews.map(crew => (
                          <span key={crew} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600/20 text-indigo-300 text-xs font-medium border border-indigo-500/30">
                            {crew}
                            <button onClick={() => removeCrew(domain, crew)} className="hover:text-white ml-0.5"><X className="w-3 h-3" /></button>
                          </span>
                        ))}
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={newCrewInputs[domain.id] || ''}
                            onChange={e => setNewCrewInputs(p => ({ ...p, [domain.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && addCrew(domain)}
                            placeholder="+ Add crew"
                            className="h-7 text-xs w-32 border-dashed border-indigo-500/50"
                          />
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => addCrew(domain)}>Add</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {domains.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Add domains first</p>}
          </div>
        </div>

        {/* Sprint Config */}
        <div className="rounded-xl overflow-hidden bg-panel border border-border">
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
            <Button onClick={() => saveObjMutation.mutate(objForm)} disabled={saveObjMutation.isPending || !objForm?.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Domain form */}
      <Dialog open={!!domainForm} onOpenChange={(o) => !o && setDomainForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{domainForm?.id ? 'Edit Domain' : 'Add Domain'}</DialogTitle></DialogHeader>
          {domainForm && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={domainForm.name} onChange={e => setDomainForm(p => ({ ...p, name: e.target.value }))} placeholder="Domain name" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDomainForm(null)}>Cancel</Button>
            <Button onClick={() => saveDomainMutation.mutate(domainForm)} disabled={saveDomainMutation.isPending || !domainForm?.name}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete domain confirm */}
      <Dialog open={!!deleteDomainConfirm} onOpenChange={(o) => !o && setDeleteDomainConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Domain</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{deleteDomainConfirm?.name}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDomainConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteDomainMutation.mutate(deleteDomainConfirm.id)}>Delete</Button>
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
            <Button size="sm" onClick={handleSave}>Save</Button>
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