import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useQuarterSelection } from '@/components/QuarterContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, GripVertical, Pencil, Trash2, ListChecks } from 'lucide-react';
const emptyFeature = { priority: 1, title: '', objective: '', description: '', comments: '' };

export default function Features() {
  const { userRole } = useOutletContext();
  const { selectedYear, selectedQuarter } = useQuarterSelection();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState(emptyFeature);
  const [editId, setEditId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const canEdit = ['admin', 'editor'].includes(userRole);

  const { data: features = [], isLoading } = useQuery({
    queryKey: ['features', selectedYear, selectedQuarter],
    queryFn: () => base44.entities.Feature.filter({ year: selectedYear, quarter: selectedQuarter }),
  });

  const { data: objectives = [] } = useQuery({
    queryKey: ['objectives'],
    queryFn: () => base44.entities.Objective.list('sort_order'),
  });

  const sortedFeatures = useMemo(() => [...features].filter(f => !f.team_plan_only).sort((a, b) => (a.priority || 0) - (b.priority || 0)), [features]);

  const colorMap = useMemo(() => { const m = {}; objectives.forEach(o => { m[o.name] = o.color; }); return m; }, [objectives]);

  const saveMutation = useMutation({
    mutationFn: (data) => editId
      ? base44.entities.Feature.update(editId, data)
      : base44.entities.Feature.create({ ...data, year: selectedYear, quarter: selectedQuarter }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['features', selectedYear, selectedQuarter] });
      setFormOpen(false); setEditId(null); setFormData(emptyFeature);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Feature.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['features', selectedYear, selectedQuarter] }); setDeleteConfirm(null); },
  });

  const updatePrioritiesMutation = useMutation({
    mutationFn: async (reorderedFeatures) => {
      await Promise.all(reorderedFeatures.map((f, i) => base44.entities.Feature.update(f.id, { priority: i + 1 })));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['features', selectedYear, selectedQuarter] }),
  });

  const handleDragEnd = (result) => {
    if (!result.destination || !canEdit) return;
    const reordered = Array.from(sortedFeatures);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    updatePrioritiesMutation.mutate(reordered);
  };

  const openNew = () => {
    const nextPriority = sortedFeatures.length > 0 ? Math.max(...sortedFeatures.map(f => f.priority || 0)) + 1 : 1;
    setFormData({ ...emptyFeature, priority: nextPriority });
    setEditId(null); setFormOpen(true);
  };

  const openEdit = (feature) => { setFormData({ ...emptyFeature, ...feature }); setEditId(feature.id); setFormOpen(true); };

  const objColor = (name) => colorMap[name] || '#94a3b8';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sortedFeatures.length} features for{' '}
          <span className="text-primary font-medium">{selectedQuarter} {selectedYear}</span>
        </p>
        {canEdit && (
          <Button onClick={openNew} className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white border-0 px-5 py-2 text-sm font-semibold rounded-xl shadow-md"><Plus className="w-4 h-4" />Add Feature</Button>
        )}
      </div>

      {/* Feature List */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : sortedFeatures.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
          <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No features yet</p>
          <p className="text-sm mt-1">Add features for {selectedQuarter} {selectedYear}</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="features">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-1.5">
                {sortedFeatures.map((feature, index) => (
                  <Draggable key={feature.id} draggableId={feature.id} index={index} isDragDisabled={!canEdit}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`rounded-xl px-4 py-3.5 flex items-center gap-3 group transition-shadow ${snapshot.isDragging ? 'shadow-xl ring-2 ring-primary/20' : 'hover:shadow-sm'}`}
                        style={{ background: 'hsl(228 30% 7%)', border: '1px solid hsl(228 25% 14%)' }}
                      >
                        {canEdit && (
                          <div {...provided.dragHandleProps} className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                            <GripVertical className="w-4 h-4" />
                          </div>
                        )}
                        <div className="flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-bold text-primary shrink-0" style={{ background: 'hsl(239 84% 67% / 0.18)' }}>
                          {feature.priority}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground text-sm">{feature.title}</span>
                            {feature.objective && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold text-white" style={{ backgroundColor: objColor(feature.objective) }}>
                                {feature.objective}
                              </span>
                            )}
                          </div>
                          {feature.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{feature.description}</p>}
                          {feature.comments && <p className="text-xs text-muted-foreground/70 mt-0.5 truncate italic">✓ {feature.comments}</p>}
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(feature)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteConfirm(feature)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'Edit Feature' : 'Add Feature'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Input type="number" min="1" value={formData.priority} onChange={e => setFormData(p => ({ ...p, priority: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Objective</Label>
                <Select value={formData.objective} onValueChange={v => setFormData(p => ({ ...p, objective: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select objective" /></SelectTrigger>
                  <SelectContent>{objectives.map(o => <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} placeholder="Feature title" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Comments</Label>
              <Textarea value={formData.comments} onChange={e => setFormData(p => ({ ...p, comments: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFormOpen(false); setEditId(null); }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending || !formData.title} className="bg-indigo-600 hover:bg-indigo-500 text-white border-0 font-semibold rounded-xl shadow-md">{editId ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Feature</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{deleteConfirm?.title}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteConfirm.id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}