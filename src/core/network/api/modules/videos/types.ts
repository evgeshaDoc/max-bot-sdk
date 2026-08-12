import type { Int64 } from '../../types/int64';

export type GetVideoDTO = { path: { video_token: string } };

/** Available playback URLs for a MAX video attachment. */
export interface VideoUrls {
  mp4_1080?: string | null;
  mp4_720?: string | null;
  mp4_480?: string | null;
  mp4_360?: string | null;
  mp4_240?: string | null;
  mp4_144?: string | null;
  hls?: string | null;
}

/** Metadata returned for a MAX video attachment token. */
export interface VideoDetails {
  token: string;
  urls?: VideoUrls | null;
  thumbnail?: { photo_id: Int64; token: string; url: string } | null;
  width: number;
  height: number;
  duration: number;
}

export type GetVideoResponse = VideoDetails;
