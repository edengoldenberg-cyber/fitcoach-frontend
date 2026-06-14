import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BADGE_ICONS = ['🐺', '🔥', '⚡', '👑', '🐉', '💀', '🛡️', '💪', '⭐', '🐯'];

function randomBadge() {
  return BADGE_ICONS[Math.floor(Math.random() * BADGE_ICONS.length)];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { trainee_id } = await req.json();

    if (!trainee_id) {
      return Response.json({ error: 'trainee_id required' }, { status: 400 });
    }

    // Verify caller owns the trainee or is admin
    const trainees = await base44.asServiceRole.entities.Trainee.filter({ id: trainee_id }).catch(() => []);
    const trainee = trainees && trainees[0];
    if (!trainee) {
      return Response.json({ error: 'Trainee not found' }, { status: 404 });
    }
    const isAdmin = user.role === 'admin';
    const isCoach = user.email === trainee.coach_email;
    const isSelf  = user.id   === trainee.user_id;
    if (!isAdmin && !isCoach && !isSelf) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if trainee already has a group
    const allGroups = await base44.asServiceRole.entities.ShapeLeagueGroup.list();
    const existingGroup = allGroups.find(g => Array.isArray(g.members) && g.members.includes(trainee_id));

    if (existingGroup) {
      return Response.json({ success: true, group: existingGroup, action: 'already_assigned' });
    }

    // Find a group with room (< 5 members) that is an auto group
    const openGroup = allGroups.find(g =>
      Array.isArray(g.members) &&
      g.members.length < (g.max_members || 5) &&
      g.is_auto_group !== false
    );

    if (openGroup) {
      const updatedMembers = [...openGroup.members, trainee_id];
      const updated = await base44.asServiceRole.entities.ShapeLeagueGroup.update(openGroup.id, {
        members: updatedMembers
      });
      return Response.json({ success: true, group: updated, action: 'added_to_existing' });
    }

    // Create new auto group with identity
    const groupNumber = allGroups.length + 1;
    const newGroup = await base44.asServiceRole.entities.ShapeLeagueGroup.create({
      name: `Shape Squad ${groupNumber}`,
      display_name: `Shape Squad ${groupNumber}`,
      badge_icon: randomBadge(),
      members: [trainee_id],
      max_members: 5,
      is_auto_group: true,
      captain_trainee_id: trainee_id,
      created_by_trainee_id: trainee_id,
    });

    return Response.json({ success: true, group: newGroup, action: 'created_new_group' });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});