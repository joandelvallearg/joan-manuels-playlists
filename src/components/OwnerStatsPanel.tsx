import { useMemo } from 'react';
import { Globe2, Laptop, MapPin, RefreshCw, ShieldCheck, Smartphone, Tablet } from 'lucide-react';
import type { UiStringKey } from '../data/translations';
import type { PageVisit, VisitorDeviceType } from '../types';
import { getCountryFlagEmoji, translateCountryByCode, translateLanguageByCode } from '../utils/musicLogic';
import { summarizeVisitAnalytics } from '../utils/visitAnalytics';

interface OwnerStatsPanelProps {
  t: (key: UiStringKey) => string;
  currentLang: string;
  visits: PageVisit[];
  totalVisitsCount: number;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function getDeviceLabel(deviceType: VisitorDeviceType, t: (key: UiStringKey) => string): string {
  if (deviceType === 'mobile') return t('deviceMobile');
  if (deviceType === 'tablet') return t('deviceTablet');
  return t('deviceDesktop');
}

function renderDeviceIcon(deviceType: VisitorDeviceType) {
  if (deviceType === 'mobile') return <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  if (deviceType === 'tablet') return <Tablet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  return <Laptop className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

export function OwnerStatsPanel({
  t,
  currentLang,
  visits,
  totalVisitsCount,
  loading,
  error,
  onRefresh,
}: OwnerStatsPanelProps) {
  const summary = useMemo(
    () => summarizeVisitAnalytics(visits, totalVisitsCount),
    [visits, totalVisitsCount]
  );

  const maxCountryCount = Math.max(1, summary.topCountries[0]?.count ?? 1);
  const maxDailyCount = Math.max(1, ...summary.dailySeries.map((d) => d.count));

  const formatVisitTimestamp = (ms: number): string => {
    if (!ms) return '—';
    try {
      return new Intl.DateTimeFormat(currentLang || 'es', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ms));
    } catch {
      return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    }
  };

  return (
    <div data-testid="owner-stats-panel" className="space-y-5">
      {/* Privacy & Refresh Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start gap-2 text-zinc-600 dark:text-zinc-400">
          <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 mt-0.5 dark:text-blue-400" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="font-medium text-zinc-800 dark:text-zinc-200">{t('statsOwnerOnlyPrivacy')}</p>
            <p className="text-[11px]">{t('statsSelfExcludedNote')}</p>
          </div>
        </div>
        <button
          type="button"
          data-testid="owner-stats-refresh-btn"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 cursor-pointer shrink-0 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{loading ? t('statsRefreshing') : t('statsRefresh')}</span>
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t('statsTotalVisits')}</p>
          <p
            data-testid="owner-stats-total"
            className="mt-1 font-mono text-2xl font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
          >
            {summary.totalVisits}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t('statsUniqueCountries')}</p>
          <p
            data-testid="owner-stats-countries-count"
            className="mt-1 font-mono text-2xl font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
          >
            {summary.uniqueCountriesCount}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t('statsUniqueCities')}</p>
          <p
            data-testid="owner-stats-cities-count"
            className="mt-1 font-mono text-2xl font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
          >
            {summary.uniqueCitiesCount}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t('statsLast7Days')}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="font-mono text-2xl font-bold text-zinc-950 tabular-nums dark:text-zinc-50">
              {summary.last7DaysCount}
            </p>
            <span className="font-mono text-[11px] text-blue-700 tabular-nums dark:text-blue-400">
              +{summary.todayCount} {t('statsTodayLabel')}
            </span>
          </div>
        </div>
      </div>

      {summary.loadedVisits === 0 && !loading ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-8 text-center text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
          {t('statsEmpty')}
        </div>
      ) : (
        <>
          {/* Countries + Cities Breakdown */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                <Globe2 className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <h3>{t('statsByCountry')}</h3>
              </div>
              <div className="space-y-2.5">
                {summary.topCountries.slice(0, 10).map((country) => {
                  const flag = country.countryCode !== 'ZZ' ? getCountryFlagEmoji(country.countryCode) : '🌐';
                  const displayName =
                    country.countryCode !== 'ZZ'
                      ? translateCountryByCode(country.countryCode, currentLang) || country.countryName
                      : country.countryName;
                  const barWidth = Math.max(6, Math.round((country.count / maxCountryCount) * 100));
                  return (
                    <div key={country.countryCode} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                          <span aria-hidden="true" className="mr-1.5">{flag}</span>
                          {displayName}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-600 tabular-nums shrink-0 dark:text-zinc-400">
                          {country.count} ({country.percent}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="h-full rounded bg-blue-600 dark:bg-blue-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <h3>{t('statsByCity')}</h3>
              </div>
              {summary.topCities.length === 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">—</p>
              ) : (
                <ul className="space-y-2">
                  {summary.topCities.slice(0, 10).map((city) => {
                    const flag = city.countryCode !== 'ZZ' ? getCountryFlagEmoji(city.countryCode) : '🌐';
                    return (
                      <li
                        key={`${city.countryCode}-${city.label}`}
                        className="flex items-center justify-between gap-2 text-xs border-b border-zinc-100 pb-1.5 last:border-b-0 last:pb-0 dark:border-zinc-800/70"
                      >
                        <span className="truncate text-zinc-800 dark:text-zinc-200">
                          <span aria-hidden="true" className="mr-1.5">{flag}</span>
                          {city.label}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-600 tabular-nums shrink-0 dark:text-zinc-400">
                          {city.count} ({city.percent}%)
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* 14-Day Activity Chart */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{t('statsDailyTrend')}</h3>
            <div className="grid grid-cols-14 items-end gap-1.5 h-24 pt-2">
              {summary.dailySeries.map((day) => {
                const heightPct = day.count === 0 ? 4 : Math.max(12, Math.round((day.count / maxDailyCount) * 100));
                return (
                  <div
                    key={day.dayKey}
                    title={`${day.dayKey}: ${day.count}`}
                    className="flex flex-col items-center justify-end h-full gap-1"
                  >
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={`w-full rounded-t transition-all ${
                          day.count > 0
                            ? 'bg-blue-600 dark:bg-blue-500'
                            : 'bg-zinc-200 dark:bg-zinc-800'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 tabular-nums dark:text-zinc-400">
              <span>{summary.dailySeries[0]?.shortLabel}</span>
              <span>{summary.dailySeries[Math.floor(summary.dailySeries.length / 2)]?.shortLabel}</span>
              <span>{summary.dailySeries[summary.dailySeries.length - 1]?.shortLabel}</span>
            </div>
          </div>

          {/* Languages / Devices / Sources */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{t('statsLanguages')}</h3>
              <ul className="space-y-1 text-xs">
                {summary.topLanguages.slice(0, 5).map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-2">
                    <span className="truncate text-zinc-700 dark:text-zinc-300">
                      {translateLanguageByCode(item.key, currentLang) || item.key.toUpperCase()}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                      {item.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{t('statsDevices')}</h3>
              <ul className="space-y-1 text-xs">
                {summary.deviceBreakdown.map((item) => (
                  <li key={item.deviceType} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                      {renderDeviceIcon(item.deviceType)}
                      <span>{getDeviceLabel(item.deviceType, t)}</span>
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                      {item.count} ({item.percent}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{t('statsSources')}</h3>
              <ul className="space-y-1 text-xs">
                {summary.topSources.slice(0, 5).map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                      {item.key}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                      {item.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recent Visits Log */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2.5 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{t('statsRecentVisits')}</h3>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {summary.recentVisits.slice(0, 10).map((visit) => {
                const flag = visit.countryCode !== 'ZZ' ? getCountryFlagEmoji(visit.countryCode) : '🌐';
                const localizedCountry =
                  visit.countryCode !== 'ZZ'
                    ? translateCountryByCode(visit.countryCode, currentLang) || visit.countryName
                    : visit.countryName;
                const place = [visit.city, localizedCountry].filter(Boolean).join(', ');
                return (
                  <li key={visit.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span aria-hidden="true">{flag}</span>
                      <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">{place}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                      <span>{getDeviceLabel(visit.deviceType, t)}</span>
                      <span>{visit.visitorLang}</span>
                      <span>{formatVisitTimestamp(visit.createdAtMs)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
