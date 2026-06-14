import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    // Create chest exercises with angle support
    const exercises = [
      {
        name: 'לחיצת חזה',
        category: 'חזה',
        description: 'לחיצת חזה עם משקולות או במכונה',
        muscle_groups: ['חזה', 'טריצפס', 'כתפיים'],
        equipment: 'משקולות חופשיות',
        supports_angle: true,
        is_active: true,
      },
      {
        name: 'פרפר',
        category: 'חזה',
        description: 'תרגיל בידוד לחזה',
        muscle_groups: ['חזה'],
        equipment: 'כבל קרוס',
        supports_angle: true,
        is_active: true,
      },
    ];

    const createdExercises = [];
    for (const exercise of exercises) {
      const created = await base44.asServiceRole.entities.ExerciseLibrary.create(exercise);
      createdExercises.push(created);
    }

    // Create angle options
    const angleOptions = [];

    // לחיצת חזה - ניטרלי, חיובי, שלילי
    const benchPress = createdExercises.find(e => e.name === 'לחיצת חזה');
    if (benchPress) {
      angleOptions.push(
        { exercise_id: benchPress.id, angle_type: 'ניטרלי', is_default: true },
        { exercise_id: benchPress.id, angle_type: 'חיובי', is_default: false },
        { exercise_id: benchPress.id, angle_type: 'שלילי', is_default: false }
      );
    }

    // פרפר - עליון, ניטרלי, תחתון
    const fly = createdExercises.find(e => e.name === 'פרפר');
    if (fly) {
      angleOptions.push(
        { exercise_id: fly.id, angle_type: 'עליון', is_default: false },
        { exercise_id: fly.id, angle_type: 'ניטרלי', is_default: true },
        { exercise_id: fly.id, angle_type: 'תחתון', is_default: false }
      );
    }

    await base44.asServiceRole.entities.ExerciseAngleOption.bulkCreate(angleOptions);

    return Response.json({
      success: true,
      message: 'תרגילי חזה עם שיפועים נוצרו בהצלחה',
      exercises: createdExercises.length,
      angleOptions: angleOptions.length
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});