import { BaseApi } from '../../base-api';
import type { FlattenReq } from '../types';
import type { GetVideoDTO, GetVideoResponse } from './types';

export class VideosApi extends BaseApi {
  async get({ video_token }: FlattenReq<GetVideoDTO>): Promise<GetVideoResponse> {
    return this._get('videos/{video_token}', { path: { video_token } });
  }
}
