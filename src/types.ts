export const OWNER_EMAIL = 'joandelvallearg@gmail.com';
export const OWNER_SPANISH_NAME = 'Joan Manuel Sebastian Del Valle';
export const PUBLIC_SHARE_URL = 'https://joan-manuels-playlists.vercel.app/';

export type PlaylistMode = 'country' | 'language' | 'my-playlists' | 'all';

export type AudioPlayMode = 'ordered' | 'radio' | 'similar-genre' | 'same-language' | 'same-genre';

export interface VisitorPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  createdAtMs: number;
  updatedAtMs: number;
}

export interface VisitorLibraryState {
  likedTrackIds: string[];
  playlists: VisitorPlaylist[];
  historyTrackIds: string[];
}

export interface Track {
  id: string;
  ownerId: string;
  youtubeId: string;
  youtubeUrl: string;
  title: string;
  artist: string;
  country: string;
  countryCode: string;
  language: string;
  languageCode: string;
  genre: string;
  isRemix?: boolean;
  curatorNote?: string;
  thumbnailUrl: string;
  isSeed?: boolean;
  createdAtMs?: number;
}

export interface Photo {
  id: string;
  ownerId: string;
  imageData: string;
  caption: string;
  order: number;
  isSeed?: boolean;
  createdAtMs?: number;
}

export interface PlaylistGroup {
  key: string;
  label: string;
  code: string;
  tracks: Track[];
  genres: string[];
}

export interface LanguageOption {
  code: string;
  nativeName: string;
  englishName: string;
  dir?: 'ltr' | 'rtl';
}

export interface TransliterationInfo {
  transliteratedName: string;
  scriptLabel: string;
}

export interface AnalyzedVideoResult {
  youtubeId: string;
  youtubeUrl: string;
  title: string;
  artist: string;
  country: string;
  countryCode: string;
  language: string;
  languageCode: string;
  genre: string;
  isRemix?: boolean;
  curatorNote: string;
  thumbnailUrl: string;
  aiQuotaExceeded?: boolean;
}

export interface ProfileTranslation {
  personalitySummary: string;
  musicalTasteSummary: string;
  keyTraits: string[];
}

export interface PsychologicalProfile {
  ownerId: string;
  personalitySummary: string;
  musicalTasteSummary: string;
  keyTraits: string[];
  trackCount: number;
  translations?: Record<string, ProfileTranslation>;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export interface GeneratedProfileDraft {
  personalitySummary: string;
  musicalTasteSummary: string;
  keyTraits: string[];
  trackCount: number;
  translations?: Record<string, ProfileTranslation>;
  aiQuotaExceeded?: boolean;
}

export type VisitorDeviceType = 'mobile' | 'tablet' | 'desktop';
export type VisitGeoSource = 'server-header' | 'ip-geo' | 'timezone';

export interface PageVisit {
  id: string;
  countryCode: string;
  countryName: string;
  region: string;
  city: string;
  continent: string;
  timezone: string;
  visitorLang: string;
  deviceType: VisitorDeviceType;
  referrerHost: string;
  geoSource: VisitGeoSource;
  dayKey: string;
  createdAtMs: number;
}
