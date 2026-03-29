import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Save, User } from 'lucide-react';

export default function ProfileDialog({ open, onOpenChange, user, darkMode, onToggleDarkMode }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ display_name: '', default_domain: '', default_crew: '' });

  const { data: domains = [] } = useQuery({
    queryKey: ['domains'],
    queryFn: () => base44.entities.Domain.list('sort_order'),
    enabled: open,
  });

  useEffect(() => {
    if (user) {
      setForm({
        display_name: user.display_name || user.full_name || '',
        default_domain: user.default_domain || '',
        default_crew: user.default_crew || '',
      });
    }
  }, [user, open]);

  const selectedDomain = domains.find(d => d.name === form.default_domain);
  const availableCrews = selectedDomain?.crews || [];

  const handleDomainChange = (val) => {
    setForm(p => ({ ...p, default_domain: val === '_none' ? '' : val, default_crew: '' }));
  };

  const saveMutation = useMutation({
    mutationFn: () => base44.auth.updateMe({ display_name: form.display_name, default_domain: form.default_domain, default_crew: form.default_crew }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['currentUser'] }); onOpenChange(false); },
  });

  const roleLabel = user?.role === 'admin' ? 'Admin' : user?.role === 'editor' ? 'Editor' : 'Viewer';
  const initials = (user?.display_name || user?.full_name || user?.email || '?')[0].toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <p className="text-sm text-muted-foreground">Manage your preferences</p>
        </DialogHeader>

        {/* User card */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/40 border border-border">
          <div className="w-14 h-14 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-base">{user?.display_name || user?.full_name || user?.email}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded bg-indigo-600/20 text-indigo-400">{roleLabel}</span>
          </div>
        </div>

        {/* Preferences */}
        <div className="space-y-4 py-2">
          <p className="text-sm font-semibold text-foreground">Preferences</p>

          <div className="space-y-1.5">
            <Label>Display Name</Label>
            <Input value={form.display_name} onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Default Domain</Label>
            <Select value={form.default_domain || '_none'} onValueChange={handleDomainChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a domain..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {domains.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Pre-fills new initiative forms and filters</p>
          </div>

          <div className="space-y-1.5">
            <Label>Default Crew</Label>
            <Select value={form.default_crew || '_none'} onValueChange={v => setForm(p => ({ ...p, default_crew: v === '_none' ? '' : v }))} disabled={availableCrews.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={availableCrews.length === 0 ? 'Select a domain first' : 'Select a crew...'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {availableCrews.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Persisted per user account</p>
            </div>
            <Switch checked={darkMode} onCheckedChange={onToggleDarkMode} />
          </div>
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full gap-2">
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}