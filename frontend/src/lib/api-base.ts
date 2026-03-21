export function getAgiApiBase(): string {
  return (process.env.AGI1_API_BASE || process.env.NEXT_PUBLIC_API_URL || 'https://api.agi1.org')
    .replace(/\/$/, '');
}
