import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useQuarterSelection } from '@/components/QuarterContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, GripVertical, Pencil, Trash2, Hash, ListChecks } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const OBJECTIVE_COLORS = { KTLO: '#f59e0b', RRC: '#10b981', BAU: '#6366f1', VSR: '#f43f5e', 'Growth Enablement': '#06b6d4', 'Core Optimization': '#8b5cf6', 'New Value Prop': '#f97316' };

const emptyFeature = { priority: 1, title: '', objective: '', description: '', comments: '' };

export default function Features() {
  const { userRole } = useOutletContext();
  const { selectedYear, selectedQuarter } = useQuarterSelection();
  const qc = useQueryClient();
  const { toast } = useToast();
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

  const sortedFeatures = useMemo(() => [...features].sort((a, b) => (a.priority || 0) - (b.priority || 0)), [features]);

  const saveMutation = useMutation({
    mutationFn: (data) => editId
      ? base44.entities.Feature.update(editId, data)
      : base44.entities.Feature.create({ ...data, year: selectedYear, quarter: selectedQuarter }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['features', selectedYear, selectedQuarter] });
      setFormOpen(false);
      setEditId(null);
      setFormData(emptyFeature);
      toast({ title: editId ? 'Feature updated' : 'Feature created' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Feature.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['features', selectedYear, selectedQuarter] });
      setDeleteConfirm(null);
    },
  });

  const updatePrioritiesMutation = useMutation({
    mutationFn: async (reorderedFeatures) => {
      const updates = reorderedFeatures.map((f, i) =>
        base44.entities.Feature.update(f.id, { priority: i + 1 })
      );
      await Promise.all(updates);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['features', selectedYear, selectedQuarter] }),
  });

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(sortedFeatures);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    updatePrioritiesMutation.mutate(reordered);
  };

  const openNew = () => {
    const nextPriority = sortedFeatures.length > 0 ? Math.max(...sortedFeatures.map(f => f.priority || 0)) + 1 : 1;
    setFormData({ ...emptyFeature, priority: nextPriority });
    setEditId(null);
    setFormOpen(true);
  };

  const openEdit = (feature) => {
    setFormData({ ...emptyFeature, ...feature });
    setEditId(feature.id);
    setFormOpen(true);
  };

  const objectiveColor = (name) => {
    const obj = objectives.find(o => o.name === name);
    return obj?.color || OBJECTIVE_COLORS[name] || '#94a3b8';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Features</h1>
          <p className="text-sm text-muted-foreground mt-1">{selectedQuarter} {selectedYear} — Priority ordered, drag to reorder</p>
        </div>
        {canEdit && (
          <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />Add Feature</Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : sortedFeatures.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <ListChecks className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No features yet</p>
          <p className="text-sm mt-1">Add features for {selectedQuarter} {selectedYear}</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={canEdit ? handleDragEnd : () => {}}>
          <Droppable droppableId="features">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                {sortedFeatures.map((feature, index) => (
                  <Draggable key={feature.id} draggableId={feature.id} index={index} isDragDisabled={!canEdit}>
                    {(provided, snapshot) => (
                      <Card
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`transition-shadow ${snapshot.isDragging ? 'shadow-xl ring-2 ring-primary/30' : ''}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {canEdit && (
                              <div {...provided.dragHandleProps} className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground">
                                <GripVertical className="w-4 h-4" />
                              </div>
                            )}
                            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                              {feature.priority}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h3 className="font-semibold text-foreground text-sm">{feature.title}</h3>
                                  {feature.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{feature.description}</p>}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {feature.objective && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white" style={{ backgroundColor: objectiveColor(feature.objective) }}>
                                      {feature.objective}
                                    </span>
                                  )}
                                  {canEdit && <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(feature)}><Pencil className="w-3 h-3" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(feature)}><Trash2 className="w-3 h-3" /></Button>
                                  </>}
                                </div>
                              </div>
                              {feature.comments && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 italic">💬 {feature.comments}</p>}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
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
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input type="number" min="1" value={formData.priority} onChange={e => setFormData(p => ({ ...p, priority: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Objective</Label>
                <Select value={formData.objective} onValueChange={v => setFormData(p => ({ ...p, objective: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select objective" /></SelectTrigger>
                  <SelectContent>
                    {objectives.map(o => <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} placeholder="Feature title" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="What does this feature do?" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Comments</Label>
              <Textarea value={formData.comments} onChange={e => setFormData(p => ({ ...p, comments: e.target.value }))} placeholder="Any comments or notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFormOpen(false); setEditId(null); }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending || !formData.title}>{editId ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Feature</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{deleteConfirm?.title}</strong>? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteConfirm.id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}