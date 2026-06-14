import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const csvContent = body.csv;

    if (!csvContent) {
      return Response.json({ error: 'No CSV content' }, { status: 400 });
    }

    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return Response.json({
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        message: 'No data rows found'
      });
    }

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.indexOf('name');
    const phoneIdx = headers.indexOf('phone');
    const emailIdx = headers.indexOf('email');
    const birthdayIdx = headers.indexOf('birthday');
    const lastVisitIdx = headers.indexOf('lastvisitdate');

    if (nameIdx === -1 || phoneIdx === -1) {
      return Response.json({
        error: 'CSV must have "name" and "phone" columns'
      }, { status: 400 });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process each row
    for (let i = 1; i < lines.length; i++) {
      try {
        const cells = lines[i].split(',').map(c => c.trim());

        const name = cells[nameIdx]?.trim();
        const phone = cells[phoneIdx]?.trim();
        const email = cells[emailIdx]?.trim();
        const birthday = cells[birthdayIdx]?.trim();
        const lastVisitDate = cells[lastVisitIdx]?.trim();

        // Validate required fields
        if (!name || !phone) {
          skipped++;
          continue;
        }

        // Check if member exists
        const existing = await base44.entities.ExternalMember.filter({
          coach_email: user.email,
          phone: phone
        });

        if (existing && existing.length > 0) {
          // Update
          await base44.entities.ExternalMember.update(existing[0].id, {
            name,
            email: email || existing[0].email,
            birthday: birthday || existing[0].birthday,
            lastVisitDate: lastVisitDate || existing[0].lastVisitDate,
            source: 'Arbox'
          });
          updated++;
        } else {
          // Create
          await base44.entities.ExternalMember.create({
            coach_email: user.email,
            name,
            phone,
            email: email || '',
            birthday: birthday || '',
            lastVisitDate: lastVisitDate || '',
            membershipType: 'personal',
            membershipStatus: 'active',
            source: 'Arbox'
          });
          imported++;
        }
      } catch (rowErr) {
        errors++;
        await base44.asServiceRole.entities.SystemDiagnostics.create({
          coach_email: user.email,
          module: 'CSVImport',
          errorType: 'RowProcessingError',
          message: `Row ${i + 1}: ${rowErr.message}`,
          severity: 'warning'
        }).catch(() => {});
      }
    }

    return Response.json({
      success: true,
      imported,
      updated,
      skipped,
      errors,
      message: `Imported: ${imported}, Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`
    });
  } catch (error) {
    // Log error
    await base44.asServiceRole.entities.SystemDiagnostics.create({
      coach_email: user?.email || 'unknown',
      module: 'CSVImport',
      errorType: 'CriticalError',
      message: error.message,
      stack: error.stack,
      severity: 'critical'
    }).catch(() => {});

    return Response.json({
      error: error.message,
      success: false
    }, { status: 500 });
  }
});