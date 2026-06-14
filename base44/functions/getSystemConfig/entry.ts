/**
 * GET SYSTEM CONFIG
 *
 * Load system config values with defaults.
 * Used by all reminder logic to check if reminders are enabled.
 *
 * Config keys:
 * - WHATSAPP_REMINDERS_ENABLED (boolean, default: true)
 * - SMART_REMINDER_V2_ENABLED (boolean, default: true)
 * - MAX_MESSAGES_PER_DAY (number, default: 2)
 * - SILENT_MODE_DAYS (number, default: 3)
 * - WATER_THRESHOLD_OFFSET (number, default: 20)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULTS = {
  WHATSAPP_REMINDERS_ENABLED: true,
  SMART_REMINDER_V2_ENABLED: true,
  MAX_MESSAGES_PER_DAY: 2,
  SILENT_MODE_DAYS: 3,
  WATER_THRESHOLD_OFFSET: 20
};

async function getSystemConfig(base44, key = null) {
  try {
    if (key) {
      // Get single config
      const configs = await base44.asServiceRole.entities.SystemConfig.filter({
        key: key
      }).catch(() => []);

      if (configs.length > 0) {
        return {
          [key]: configs[0].value !== undefined ? configs[0].value : DEFAULTS[key]
        };
      }

      return { [key]: DEFAULTS[key] };
    }

    // Get all configs
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({})
      .catch(() => []);

    const result = { ...DEFAULTS };

    for (const cfg of configs) {
      if (cfg.value !== undefined) {
        result[cfg.key] = cfg.value;
      }
    }

    return result;
  } catch (err) {
    console.error('[getSystemConfig] Error:', err.message);
    return key ? { [key]: DEFAULTS[key] } : DEFAULTS;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { key } = await req.json().catch(() => ({}));

    const config = await getSystemConfig(base44, key);

    return Response.json({ ok: true, config });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

export { getSystemConfig };