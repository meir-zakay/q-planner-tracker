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
import { Badge } from '@/components/ui/badge';
import { UserPlus, Pencil, Trash2, Mail, Shield, CheckCircle2 } from 'lucide-react';
const ROLES = ['admin', 'editor', 'viewer'];
const INVITE_ROLES = ['admin', 'editor', 'viewer'];

const roleBadge = { admin: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', editor: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', viewer: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };

export default function Users() {
  const { user } = useOutletContext();
  const qc = useQueryClient();
  const [editUser, setEditUser] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await base44.functions.invoke('listUsers', {});
      return res.data.users || [];
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditUser(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setDeleteConfirm(null); },
  });

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviteLoading(true);
    setInviteError('');
    try {
      await base44.functions.invoke('inviteUserWithRole', { email: inviteEmail, role: inviteRole });
      setInviteSent(true);
    } catch (err) {
      setInviteError(err?.message || 'Failed to send invitation. Please try again.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleInviteClose = () => {
    setInviteOpen(false);
    setInviteEmail('');
    setInviteRole('viewer');
    setInviteSent(false);
    setInviteError('');
  };

  return (
    <RoleGate allowed={['admin']}>
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4" /> Invite User
          </Button>
        </div>

        <div className="rounded-xl overflow-hidden border border-border bg-card">
          <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...users].sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '')).map(u => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{u.full_name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3 h-3" />
                          {u.email}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[u.role] || roleBadge.viewer}`}>
                          <Shield className="w-3 h-3" />{u.role || 'viewer'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditUser({ ...u, role: u.role === 'user' ? 'viewer' : (u.role || 'viewer') })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {u.email !== user?.email && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(u)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
            {editUser && (
              <div className="space-y-4 py-2">
                <div>
                  <p className="text-sm font-medium">{editUser.full_name}</p>
                  <p className="text-sm text-muted-foreground">{editUser.email}</p>
                </div>
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input value={editUser.display_name || ''} onChange={e => setEditUser({ ...editUser, display_name: e.target.value })} placeholder="Enter display name..." />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={editUser.role || 'viewer'} onValueChange={v => setEditUser({ ...editUser, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button onClick={() => updateMutation.mutate({ id: editUser.id, data: { role: editUser.role, display_name: editUser.display_name } })} disabled={updateMutation.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invite Dialog */}
        <Dialog open={inviteOpen} onOpenChange={(o) => !o && handleInviteClose()}>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
            {inviteSent ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <p className="font-semibold text-foreground">Invitation Sent!</p>
                <p className="text-sm text-muted-foreground">An invitation has been sent to <strong>{inviteEmail}</strong>.</p>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="user@example.com" type="email" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INVITE_ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
              </div>
            )}
            <DialogFooter>
              {inviteSent ? (
                <Button onClick={handleInviteClose}>Close</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleInviteClose}>Cancel</Button>
                  <Button onClick={handleInvite} disabled={!inviteEmail || inviteLoading}>
                    {inviteLoading ? 'Sending…' : 'Send Invitation'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete User</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{deleteConfirm?.full_name || deleteConfirm?.email}</strong>? This action cannot be undone.</p>
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