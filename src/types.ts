export const OWNER_EMAIL = 'joandelvallearg@gmail.com';
export const OWNER_SPANISH_NAME = 'Joan Manuel Sebastian Del Valle';

export type PlaylistMode = 'country' | 'language' | 'all';

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
  curatorNote: string;
  thumbnailUrl: string;
  aiQuotaExceeded?: boolean;
}
