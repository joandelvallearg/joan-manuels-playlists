import type { PageVisit, VisitGeoSource, VisitorDeviceType } from '../types';
import { translateCountryByCode } from './musicLogic';

export const VISIT_SESSION_KEY = 'jm_visit_recorded_v1';

interface TimezoneGeoEntry {
  countryCode: string;
  countryName: string;
  city: string;
  region: string;
  continent: string;
}

const TIMEZONE_GEO_MAP: Record<string, TimezoneGeoEntry> = {
  'America/Argentina/Buenos_Aires': {
    countryCode: 'AR',
    countryName: 'Argentina',
    city: 'Buenos Aires',
    region: 'Buenos Aires',
    continent: 'Sudamérica',
  },
  'America/Buenos_Aires': {
    countryCode: 'AR',
    countryName: 'Argentina',
    city: 'Buenos Aires',
    region: 'Buenos Aires',
    continent: 'Sudamérica',
  },
  'America/Argentina/Cordoba': {
    countryCode: 'AR',
    countryName: 'Argentina',
    city: 'Córdoba',
    region: 'Córdoba',
    continent: 'Sudamérica',
  },
  'America/Argentina/Mendoza': {
    countryCode: 'AR',
    countryName: 'Argentina',
    city: 'Mendoza',
    region: 'Mendoza',
    continent: 'Sudamérica',
  },
  'America/Argentina/Rosario': {
    countryCode: 'AR',
    countryName: 'Argentina',
    city: 'Rosario',
    region: 'Santa Fe',
    continent: 'Sudamérica',
  },
  'America/Montevideo': {
    countryCode: 'UY',
    countryName: 'Uruguay',
    city: 'Montevideo',
    region: 'Montevideo',
    continent: 'Sudamérica',
  },
  'America/Santiago': {
    countryCode: 'CL',
    countryName: 'Chile',
    city: 'Santiago',
    region: 'Metropolitana',
    continent: 'Sudamérica',
  },
  'America/Bogota': {
    countryCode: 'CO',
    countryName: 'Colombia',
    city: 'Bogotá',
    region: 'Cundinamarca',
    continent: 'Sudamérica',
  },
  'America/Lima': {
    countryCode: 'PE',
    countryName: 'Perú',
    city: 'Lima',
    region: 'Lima',
    continent: 'Sudamérica',
  },
  'America/Guayaquil': {
    countryCode: 'EC',
    countryName: 'Ecuador',
    city: 'Guayaquil',
    region: 'Guayas',
    continent: 'Sudamérica',
  },
  'America/Caracas': {
    countryCode: 'VE',
    countryName: 'Venezuela',
    city: 'Caracas',
    region: 'Distrito Capital',
    continent: 'Sudamérica',
  },
  'America/Asuncion': {
    countryCode: 'PY',
    countryName: 'Paraguay',
    city: 'Asunción',
    region: 'Central',
    continent: 'Sudamérica',
  },
  'America/La_Paz': {
    countryCode: 'BO',
    countryName: 'Bolivia',
    city: 'La Paz',
    region: 'La Paz',
    continent: 'Sudamérica',
  },
  'America/Sao_Paulo': {
    countryCode: 'BR',
    countryName: 'Brasil',
    city: 'São Paulo',
    region: 'São Paulo',
    continent: 'Sudamérica',
  },
  'America/Mexico_City': {
    countryCode: 'MX',
    countryName: 'México',
    city: 'Ciudad de México',
    region: 'CDMX',
    continent: 'Norteamérica',
  },
  'America/Monterrey': {
    countryCode: 'MX',
    countryName: 'México',
    city: 'Monterrey',
    region: 'Nuevo León',
    continent: 'Norteamérica',
  },
  'America/New_York': {
    countryCode: 'US',
    countryName: 'Estados Unidos',
    city: 'Nueva York',
    region: 'New York',
    continent: 'Norteamérica',
  },
  'America/Chicago': {
    countryCode: 'US',
    countryName: 'Estados Unidos',
    city: 'Chicago',
    region: 'Illinois',
    continent: 'Norteamérica',
  },
  'America/Denver': {
    countryCode: 'US',
    countryName: 'Estados Unidos',
    city: 'Denver',
    region: 'Colorado',
    continent: 'Norteamérica',
  },
  'America/Los_Angeles': {
    countryCode: 'US',
    countryName: 'Estados Unidos',
    city: 'Los Ángeles',
    region: 'California',
    continent: 'Norteamérica',
  },
  'America/Toronto': {
    countryCode: 'CA',
    countryName: 'Canadá',
    city: 'Toronto',
    region: 'Ontario',
    continent: 'Norteamérica',
  },
  'Europe/Madrid': {
    countryCode: 'ES',
    countryName: 'España',
    city: 'Madrid',
    region: 'Comunidad de Madrid',
    continent: 'Europa',
  },
  'Europe/London': {
    countryCode: 'GB',
    countryName: 'Reino Unido',
    city: 'Londres',
    region: 'Inglaterra',
    continent: 'Europa',
  },
  'Europe/Paris': {
    countryCode: 'FR',
    countryName: 'Francia',
    city: 'París',
    region: 'Île-de-France',
    continent: 'Europa',
  },
  'Europe/Berlin': {
    countryCode: 'DE',
    countryName: 'Alemania',
    city: 'Berlín',
    region: 'Berlín',
    continent: 'Europa',
  },
  'Europe/Rome': {
    countryCode: 'IT',
    countryName: 'Italia',
    city: 'Roma',
    region: 'Lacio',
    continent: 'Europa',
  },
  'Europe/Lisbon': {
    countryCode: 'PT',
    countryName: 'Portugal',
    city: 'Lisboa',
    region: 'Lisboa',
    continent: 'Europa',
  },
  'Europe/Moscow': {
    countryCode: 'RU',
    countryName: 'Rusia',
    city: 'Moscú',
    region: 'Moscú',
    continent: 'Europa',
  },
  'Asia/Tokyo': {
    countryCode: 'JP',
    countryName: 'Japón',
    city: 'Tokio',
    region: 'Tokio',
    continent: 'Asia',
  },
  'Asia/Seoul': {
    countryCode: 'KR',
    countryName: 'Corea del Sur',
    city: 'Seúl',
    region: 'Seúl',
    continent: 'Asia',
  },
  'Asia/Shanghai': {
    countryCode: 'CN',
    countryName: 'China',
    city: 'Shanghái',
    region: 'Shanghái',
    continent: 'Asia',
  },
  'Asia/Dubai': {
    countryCode: 'AE',
    countryName: 'Emiratos Árabes Unidos',
    city: 'Dubái',
    region: 'Dubái',
    continent: 'Asia',
  },
  'Asia/Kolkata': {
    countryCode: 'IN',
    countryName: 'India',
    city: 'Bombay',
    region: 'Maharashtra',
    continent: 'Asia',
  },
  'Australia/Sydney': {
    countryCode: 'AU',
    countryName: 'Australia',
    city: 'Sídney',
    region: 'Nueva Gales del Sur',
    continent: 'Oceanía',
  },
};

export function formatDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function detectVisitorDeviceType(
  userAgent: string,
  viewportWidth?: number
): VisitorDeviceType {
  const ua = (userAgent || '').toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) {
    return 'tablet';
  }
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/.test(ua)) {
    return 'mobile';
  }
  if (typeof viewportWidth === 'number' && viewportWidth > 0) {
    if (viewportWidth < 640) return 'mobile';
    if (viewportWidth < 1024) return 'tablet';
  }
  return 'desktop';
}

export function sanitizeReferrerHost(referrer: string, currentHost?: string): string {
  const trimmed = (referrer || '').trim();
  if (!trimmed) return 'direct';
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase().slice(0, 100);
    if (!host) return 'direct';
    const currentNormalized = (currentHost || '').replace(/^www\./i, '').toLowerCase();
    if (currentNormalized && host === currentNormalized) {
      return 'direct';
    }
    return host;
  } catch {
    return 'direct';
  }
}

function inferContinentFromTimezone(timezone: string): string {
  const prefix = timezone.split('/')[0] ?? '';
  if (prefix === 'Europe') return 'Europa';
  if (prefix === 'Asia') return 'Asia';
  if (prefix === 'Africa') return 'África';
  if (prefix === 'Australia' || prefix === 'Pacific') return 'Oceanía';
  if (prefix === 'America') {
    if (/Argentina|Brazil|Sao_Paulo|Buenos_Aires|Santiago|Bogota|Lima|Montevideo|Asuncion|La_Paz|Caracas|Guayaquil/i.test(timezone)) {
      return 'Sudamérica';
    }
    return 'América';
  }
  return '';
}

export function inferGeoFromTimezoneAndLocale(
  timezone: string,
  browserLang: string
): {
  countryCode: string;
  countryName: string;
  region: string;
  city: string;
  continent: string;
  geoSource: 'timezone';
} {
  const cleanTz = (timezone || '').trim();
  if (cleanTz && TIMEZONE_GEO_MAP[cleanTz]) {
    return {
      ...TIMEZONE_GEO_MAP[cleanTz],
      geoSource: 'timezone',
    };
  }

  // Try matching any Argentina subzone
  if (cleanTz.startsWith('America/Argentina/')) {
    const cityPart = cleanTz.split('/')[2]?.replace(/_/g, ' ') || 'Argentina';
    return {
      countryCode: 'AR',
      countryName: 'Argentina',
      city: cityPart,
      region: cityPart,
      continent: 'Sudamérica',
      geoSource: 'timezone',
    };
  }

  // Try extracting region subtag from browser locale (e.g., es-AR, en-US, pt-BR)
  let regionCode = '';
  const cleanLang = (browserLang || '').trim();
  if (cleanLang) {
    try {
      const locale = new Intl.Locale(cleanLang);
      if (locale.region && /^[A-Z]{2}$/.test(locale.region.toUpperCase())) {
        regionCode = locale.region.toUpperCase();
      }
    } catch {
      const match = cleanLang.match(/[-_]([a-zA-Z]{2})(?:$|[-_])/);
      if (match) regionCode = match[1].toUpperCase();
    }
  }

  const cityGuess = cleanTz.includes('/')
    ? cleanTz.split('/').slice(-1)[0]?.replace(/_/g, ' ') ?? ''
    : '';
  const continentGuess = inferContinentFromTimezone(cleanTz);

  if (regionCode) {
    const localizedCountry = translateCountryByCode(regionCode, 'es') || regionCode;
    return {
      countryCode: regionCode,
      countryName: localizedCountry,
      region: '',
      city: cityGuess,
      continent: continentGuess,
      geoSource: 'timezone',
    };
  }

  return {
    countryCode: 'ZZ',
    countryName: 'Ubicación no especificada',
    region: '',
    city: cityGuess,
    continent: continentGuess,
    geoSource: 'timezone',
  };
}

export function generateSafeVisitId(): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 12);
  return `v_${Date.now().toString(36)}_${randomPart}`;
}

export function buildSanitizedVisitPayload(
  input: Partial<Omit<PageVisit, 'id' | 'createdAtMs'>>,
  now: Date = new Date()
): Omit<PageVisit, 'id' | 'createdAtMs'> {
  const rawCode = (input.countryCode || 'ZZ').toUpperCase().replace(/[^A-Z]/g, '');
  const countryCode = rawCode.length >= 2 && rawCode.length <= 3 ? rawCode : 'ZZ';

  const fallbackCountryName =
    countryCode === 'ZZ'
      ? 'Ubicación no especificada'
      : translateCountryByCode(countryCode, 'es') || countryCode;
  const countryName = (input.countryName || '').trim().slice(0, 80) || fallbackCountryName;

  const rawLang = (input.visitorLang || 'es').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
  const visitorLang = rawLang || 'es';

  const deviceType: VisitorDeviceType =
    input.deviceType === 'mobile' || input.deviceType === 'tablet' || input.deviceType === 'desktop'
      ? input.deviceType
      : 'desktop';

  const geoSource: VisitGeoSource =
    input.geoSource === 'server-header' ||
    input.geoSource === 'ip-geo' ||
    input.geoSource === 'timezone'
      ? input.geoSource
      : 'timezone';

  const dayKey =
    input.dayKey && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.dayKey)
      ? input.dayKey
      : formatDayKey(now);

  return {
    countryCode,
    countryName,
    region: (input.region || '').trim().slice(0, 80),
    city: (input.city || '').trim().slice(0, 80),
    continent: (input.continent || '').trim().slice(0, 40),
    timezone: (input.timezone || '').trim().slice(0, 80),
    visitorLang,
    deviceType,
    referrerHost: (input.referrerHost || 'direct').trim().slice(0, 100) || 'direct',
    geoSource,
    dayKey,
  };
}

export interface CountryVisitStat {
  countryCode: string;
  countryName: string;
  count: number;
  percent: number;
}

export interface CityVisitStat {
  label: string;
  countryCode: string;
  count: number;
  percent: number;
}

export interface KeyCountStat {
  key: string;
  count: number;
  percent: number;
}

export interface DailyVisitPoint {
  dayKey: string;
  shortLabel: string;
  count: number;
}

export interface VisitAnalyticsSummary {
  totalVisits: number;
  loadedVisits: number;
  uniqueCountriesCount: number;
  uniqueCitiesCount: number;
  todayCount: number;
  last7DaysCount: number;
  topCountries: CountryVisitStat[];
  topCities: CityVisitStat[];
  topLanguages: KeyCountStat[];
  deviceBreakdown: Array<{ deviceType: VisitorDeviceType; count: number; percent: number }>;
  topSources: KeyCountStat[];
  dailySeries: DailyVisitPoint[];
  recentVisits: PageVisit[];
}

export function summarizeVisitAnalytics(
  visits: PageVisit[],
  totalCountOverride?: number,
  now: Date = new Date()
): VisitAnalyticsSummary {
  const totalVisits = Math.max(totalCountOverride ?? 0, visits.length);
  const denominator = Math.max(1, visits.length);

  const todayKey = formatDayKey(now);
  const sevenDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
  const sevenDaysAgoKey = formatDayKey(sevenDaysAgo);

  const countryMap = new Map<string, { countryCode: string; countryName: string; count: number }>();
  const cityMap = new Map<string, { label: string; countryCode: string; count: number }>();
  const langMap = new Map<string, number>();
  const deviceMap = new Map<VisitorDeviceType, number>([
    ['mobile', 0],
    ['desktop', 0],
    ['tablet', 0],
  ]);
  const sourceMap = new Map<string, number>();
  const dayMap = new Map<string, number>();

  let todayCount = 0;
  let last7DaysCount = 0;

  for (const visit of visits) {
    const cCode = visit.countryCode || 'ZZ';
    const cName = visit.countryName || (cCode === 'ZZ' ? 'Ubicación no especificada' : cCode);
    const existingCountry = countryMap.get(cCode);
    if (existingCountry) {
      existingCountry.count += 1;
    } else {
      countryMap.set(cCode, { countryCode: cCode, countryName: cName, count: 1 });
    }

    const cleanCity = visit.city.trim();
    const cleanRegion = visit.region.trim();
    const cityDisplay = cleanCity || cleanRegion;
    if (cityDisplay) {
      const cityKey = `${cCode}::${cityDisplay.toLowerCase()}`;
      const existingCity = cityMap.get(cityKey);
      if (existingCity) {
        existingCity.count += 1;
      } else {
        cityMap.set(cityKey, {
          label: cleanCity && cleanRegion && cleanCity !== cleanRegion
            ? `${cleanCity}, ${cleanRegion}`
            : cityDisplay,
          countryCode: cCode,
          count: 1,
        });
      }
    }

    const baseLang = (visit.visitorLang || 'es').split(/[-_]/)[0]?.toLowerCase() || 'es';
    langMap.set(baseLang, (langMap.get(baseLang) ?? 0) + 1);

    const dev: VisitorDeviceType =
      visit.deviceType === 'mobile' || visit.deviceType === 'tablet' ? visit.deviceType : 'desktop';
    deviceMap.set(dev, (deviceMap.get(dev) ?? 0) + 1);

    const host = visit.referrerHost || 'direct';
    sourceMap.set(host, (sourceMap.get(host) ?? 0) + 1);

    if (visit.dayKey) {
      dayMap.set(visit.dayKey, (dayMap.get(visit.dayKey) ?? 0) + 1);
      if (visit.dayKey === todayKey) todayCount += 1;
      if (visit.dayKey >= sevenDaysAgoKey) last7DaysCount += 1;
    }
  }

  const topCountries: CountryVisitStat[] = Array.from(countryMap.values())
    .sort((a, b) => b.count - a.count || a.countryName.localeCompare(b.countryName))
    .map((entry) => ({
      ...entry,
      percent: Math.round((entry.count / denominator) * 100),
    }));

  const uniqueCountriesCount = Array.from(countryMap.keys()).filter((c) => c !== 'ZZ').length;

  const topCities: CityVisitStat[] = Array.from(cityMap.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 12)
    .map((entry) => ({
      ...entry,
      percent: Math.round((entry.count / denominator) * 100),
    }));

  const topLanguages: KeyCountStat[] = Array.from(langMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([key, count]) => ({
      key,
      count,
      percent: Math.round((count / denominator) * 100),
    }));

  const deviceBreakdown = (['mobile', 'desktop', 'tablet'] as VisitorDeviceType[])
    .map((deviceType) => {
      const count = deviceMap.get(deviceType) ?? 0;
      return {
        deviceType,
        count,
        percent: visits.length > 0 ? Math.round((count / denominator) * 100) : 0,
      };
    })
    .filter((entry) => entry.count > 0 || visits.length === 0);

  const topSources: KeyCountStat[] = Array.from(sourceMap.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([key, count]) => ({
      key,
      count,
      percent: Math.round((count / denominator) * 100),
    }));

  const dailySeries: DailyVisitPoint[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    const dayKey = formatDayKey(d);
    const shortLabel = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    dailySeries.push({
      dayKey,
      shortLabel,
      count: dayMap.get(dayKey) ?? 0,
    });
  }

  const recentVisits = [...visits]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 15);

  return {
    totalVisits,
    loadedVisits: visits.length,
    uniqueCountriesCount,
    uniqueCitiesCount: cityMap.size,
    todayCount,
    last7DaysCount,
    topCountries,
    topCities,
    topLanguages,
    deviceBreakdown,
    topSources,
    dailySeries,
    recentVisits,
  };
}
