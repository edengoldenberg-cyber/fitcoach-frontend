export const REWARD_TYPES = [
  { value: 'individual', label: 'אישי' },
  { value: 'group', label: 'קבוצתי' },
  { value: 'streak', label: 'סטריק' },
  { value: 'mission', label: 'משימה' },
  { value: 'participation', label: 'השתתפות' },
];

export const PLACEMENTS = [
  { value: '1st', label: 'מקום 1' },
  { value: '2nd', label: 'מקום 2' },
  { value: '3rd', label: 'מקום 3' },
  { value: 'winning_group', label: 'קבוצה מנצחת' },
  { value: 'custom', label: 'מותאם אישית' },
];

export const REWARD_STATUSES = [
  { value: 'draft', label: 'טיוטה' },
  { value: 'active', label: 'פעיל' },
  { value: 'expired', label: 'פג תוקף' },
];

export const CLAIM_STATUSES = [
  { value: 'unlocked', label: 'נפתח' },
  { value: 'claimed', label: 'נדרש' },
  { value: 'redeemed', label: 'מומש' },
  { value: 'cancelled', label: 'בוטל' },
];

export const REWARD_CATEGORIES = [
  { key: 'individual', title: '🏅 פרסים אישיים', types: ['individual', 'participation'] },
  { key: 'group', title: '👥 פרס קבוצתי', types: ['group'] },
  { key: 'streak', title: '🔥 פרסי סטריק', types: ['streak'] },
  { key: 'mission', title: '🎯 פרסי משימות', types: ['mission'] },
];

export const labelFor = (items, value) => items.find((item) => item.value === value)?.label || value;