import { BaseApi } from '../../base-api';
import type { FlattenReq } from '../types';

import type { GetUploadUrlDTO, GetUploadUrlResponse } from './types';

export class UploadsApi extends BaseApi {
  async getUploadUrl(query: FlattenReq<GetUploadUrlDTO>): Promise<GetUploadUrlResponse> {
    return this._post('uploads', { query });
  }
}
