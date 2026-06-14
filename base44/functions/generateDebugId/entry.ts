// Utility function to generate unique debug IDs
export function generateDebugId(prefix = 'DW') {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${date}-${random}`;
}