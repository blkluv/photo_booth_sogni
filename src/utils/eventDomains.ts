// Map of alternate domains to their event themes
const EVENT_DOMAIN_MAP: Record<string, string> = {
  'mandala.sogni.ai': 'mandala',
};

export const isEventDomain = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname in EVENT_DOMAIN_MAP;
};

export const getEventThemeForDomain = (): string | null => {
  if (typeof window === 'undefined') return null;
  return EVENT_DOMAIN_MAP[window.location.hostname] || null;
};
