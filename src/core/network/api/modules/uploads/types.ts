import type { UploadType } from '../../types/uploads';

export type GetUploadUrlDTO = {
  query: {
    type: UploadType
  }
};

export type GetUploadUrlResponse = {
  url: string,
  token?: string,
};
