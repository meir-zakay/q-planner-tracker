import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { userId, role, is_app_admin } = await req.json();

    const users = await base44.asServiceRole.entities.User.list('-created_date', 500);
    const target = users.find(u => u.id === userId || u.email === userId);

    if (!target) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (is_app_admin !== undefined) updateData.is_app_admin = is_app_admin;

    const updated = await base44.asServiceRole.entities.User.update(target.id, updateData);
    return Response.json({ success: true, user: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});