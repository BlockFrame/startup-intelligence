import enTranslation from '@/locales/en.json';

type TranslationValue = string | Record<string, unknown>;
type TranslationDictionary = Record<string, TranslationValue>;

const dictionary = enTranslation as TranslationDictionary;

function lookup(path: string): string | null {
  let current: unknown = dictionary;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || !(part in current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : null;
}

function interpolate(template: string, options?: Record<string, unknown>): string {
  if (!options) return template;
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, key: string) => {
    const value = options[key.trim()];
    return value == null ? '' : String(value);
  });
}

export async function initI18n(): Promise<void> {
  document.documentElement.setAttribute('lang', 'en');
  document.documentElement.removeAttribute('dir');
}

export function t(key: string, options?: Record<string, unknown>): string {
  return interpolate(lookup(key) ?? key, options);
}

export async function changeLanguage(_lng: string): Promise<void> {
  await initI18n();
}

export function getCurrentLanguage(): string {
  return 'en';
}

export function isRTL(): boolean {
  return false;
}

export function getLocale(): string {
  return 'en-US';
}

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: 'GB' },
];
