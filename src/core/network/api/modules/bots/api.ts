import { BaseApi } from '../../base-api';
import type { FlattenReq } from '../types';
import type { EditMyCommandsDTO, EditMyCommandsResponse, GetMyInfoResponse } from './types';

export class BotsApi extends BaseApi {
  async getMyInfo(): Promise<GetMyInfoResponse> {
    return this._get('me', {});
  }

  async editMyCommands(
    body: FlattenReq<EditMyCommandsDTO>,
  ): Promise<EditMyCommandsResponse> {
    return this._patch('me/commands', { body });
  }
}
