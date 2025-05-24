import { Settings } from '../types/index';

export function getSettingFromCookie<T>(name: string, defaultValue: T): T {
  try {
    const value = localStorage.getItem(`sogni_${name}`);
    return value ? (JSON.parse(value) as T) : defaultValue;
  } catch (e) {
    console.warn(`Error reading cookie ${name}:`, e);
    return defaultValue;
  }
}

export function saveSettingsToCookies(settings: Partial<Settings>): void {
  Object.entries(settings).forEach(([key, value]) => {
    try {
      localStorage.setItem(`sogni_${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn(`Error saving setting ${key}:`, e);
    }
  });
} 