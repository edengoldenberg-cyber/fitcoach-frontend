// Feature flags — controlled via Vite environment variables.
// All flags default to false in production.

export const CALORIE_TARGET_CHOICE_UI =
  import.meta.env.VITE_CALORIE_TARGET_CHOICE_UI === 'true';
