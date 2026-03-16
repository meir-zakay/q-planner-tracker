import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email, role } = await req.json();
    if (!email || !role) {
      return Response.json({ error: 'Email and role are required' }, { status: 400 });
    }

    // inviteUser only accepts "user" or "admin"; map accordingly
    const baseRole = role === 'admin' ? 'admin' : 'user';
    await base44.users.inviteUser(email, baseRole);

    // If a custom role (editor/viewer) is needed, find the newly created user and update
    if (role !== 'user' && role !== 'admin') {
      // Give it a moment for the user record to be created
      await new Promise(r => setTimeout(r, 500));
      const users = await base44.asServiceRole.entities.User.list('-created_date', 5);
      const newUser = users.find(u => u.email === email);
      if (newUser) {
        await base44.asServiceRole.entities.User.update(newUser.id, { role });
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});