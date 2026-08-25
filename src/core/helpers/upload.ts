import * as fs from 'fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type Api } from '../../api';
import type { Client } from '../network/api/client';
import { MaxError, MaxErrorKind } from '../network/api/error';
import { parseLosslessJson } from '../network/api/json';
import type { Int64 } from '../network/api/types/int64';
import type { UploadType } from '../network/api/types/uploads';
import { normalizeWireValue, type WireDescriptor } from '../network/api/wire-descriptors';

type FileSource = string | fs.ReadStream | Buffer;

type DefaultOptions = {
  /** Upload deadline in milliseconds. @default 20000 */
  timeout?: number;
};

type UploadFromSourceOptions = {
  source: FileSource
};

type UploadFromUrlOptions = {
  url: string
};

type UploadFromUrlOrSourceOptions = UploadFromSourceOptions | UploadFromUrlOptions;

type BaseFile = {
  fileName: string
};

type FileStream = BaseFile & {
  stream: fs.ReadStream;
  contentLength: number;
};

type FileBuffer = BaseFile & {
  buffer: Buffer;
};

type UploadFile = FileStream | FileBuffer;

export type UploadImageOptions = UploadFromUrlOrSourceOptions & DefaultOptions;
export type UploadVideoOptions = UploadFromSourceOptions & DefaultOptions;
export type UploadFileOptions = UploadFromSourceOptions & DefaultOptions;
export type UploadAudioOptions = UploadFromSourceOptions & DefaultOptions;

const DEFAULT_UPLOAD_TIMEOUT = 20_000;

/**
 * Параметры загрузки чатка через Content-Range
 */
type UploadRangeChunkParams = {
  /**
   * URL для загрузки файла
   */
  uploadUrl: string;
  /**
   * Чанк-данных для загрузки
   */
  chunk: Buffer | string;
  /**
   * Начальный байт в общем потоке файла
   */
  startByte: number;
  /**
   * Конечный байт в общем потоке файла
   */
  endByte: number;
  /**
   * Общий размер файла
   */
  fileSize: number;
  /**
   * Имя файла для загрузки
   */
  fileName: string;
};

/**
 * Загрузить чанк данных через Content-Range запрос
 */
async function uploadRangeChunk({
  uploadUrl, chunk, startByte, endByte, fileSize, fileName,
}: UploadRangeChunkParams, request: Client['request'], timeoutMs: number) {
  const uploadRes = await request({
    url: uploadUrl,
    init: {
      method: 'POST',
      body: chunk,
      headers: {
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Range': `bytes ${startByte}-${endByte}/${fileSize}`,
        'Content-Type': 'application/x-binary; charset=x-user-defined',
        'X-File-Name': fileName,
        'X-Uploading-Mode': 'parallel',
      },
    },
    timeoutMs,
  });

  if (uploadRes.status >= 400) {
    throw new MaxError('MAX upload request failed', {
      kind: MaxErrorKind.Http,
      status: uploadRes.status,
      method: 'POST',
      path: 'upload',
      ambiguousOutcome: uploadRes.status >= 500,
    });
  }
}

/**
 * Параметры загрузки данных через Content-Range или Multipart запрос
 */
type UploadStreamParams = {
  /**
   * Файл для загрузки
   */
  file: FileStream;
  /**
   * URL для загрузки файла
   */
  uploadUrl: string;
};

/**
 * Загрузить файл через Content-Range запрос
 */
async function uploadRange(
  { uploadUrl, file }: UploadStreamParams,
  request: Client['request'],
  timeoutMs: number,
) {
  const size = file.contentLength;
  let startByte = 0;
  let endByte = 0;

  for await (const chunk of file.stream) {
    endByte = startByte + chunk.length - 1;
    await uploadRangeChunk({
      uploadUrl,
      startByte,
      endByte,
      chunk,
      fileName: file.fileName,
      fileSize: size,
    }, request, timeoutMs);

    startByte = endByte + 1;
  }
}

/**
 * Загрузить файл через Multipart запрос
 */
async function uploadMultipart<Res>(
  { uploadUrl, file }: UploadStreamParams,
  request: Client['request'],
  timeoutMs: number,
  descriptor?: WireDescriptor,
): Promise<Res> {
  const boundary = `max-sdk-${randomUUID()}`;
  const fileName = file.fileName.replace(/["\r\n]/g, '_');
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="${fileName}"\r\n`
    + 'Content-Type: application/octet-stream\r\n\r\n',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  async function* chunks(): AsyncGenerator<Buffer> {
    yield head;
    for await (const chunk of file.stream) yield Buffer.from(chunk);
    yield tail;
  }
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    body: Readable.from(chunks()) as unknown as BodyInit,
    duplex: 'half',
    headers: {
      'content-length': String(head.length + file.contentLength + tail.length),
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  };
  const response = await request({ url: uploadUrl, init, timeoutMs });
  return parseUploadResponse<Res>(response, descriptor);
}

async function parseUploadResponse<Res>(
  response: Response,
  descriptor?: WireDescriptor,
): Promise<Res> {
  if (!response.ok) {
    throw new MaxError('MAX upload request failed', {
      kind: MaxErrorKind.Http,
      status: response.status,
      method: 'POST',
      path: 'upload',
      ambiguousOutcome: response.status >= 500,
    });
  }
  const text = await response.text();
  if (!text) {
    throw new MaxError('MAX upload returned an empty response', {
      kind: MaxErrorKind.Protocol,
      method: 'POST',
      path: 'upload',
      ambiguousOutcome: true,
    });
  }
  try {
    return normalizeWireValue(parseLosslessJson(text), descriptor) as Res;
  } catch (error) {
    if (error instanceof MaxError) throw error;
    throw new MaxError('MAX upload returned invalid JSON', {
      kind: MaxErrorKind.Protocol,
      method: 'POST',
      path: 'upload',
      ambiguousOutcome: true,
      cause: error,
    });
  }
}

export class Upload {
  constructor(private readonly api: Api) {}

  private async getStreamFromSource(source: FileSource): Promise<UploadFile> {
    if (typeof source === 'string') {
      const stat = await fs.promises.stat(source);
      const fileName = path.basename(source);

      if (!stat.isFile()) {
        throw new Error(`Failed to upload ${fileName}. Not a file`);
      }

      const stream = fs.createReadStream(source);

      return {
        stream,
        fileName,
        contentLength: stat.size,
      };
    }

    if (source instanceof Buffer) {
      return {
        buffer: source,
        fileName: randomUUID(),
      };
    }

    const stat = await fs.promises.stat(source.path);

    let fileName: undefined | string;

    if (typeof source.path === 'string') {
      fileName = path.basename(source.path);
    } else {
      fileName = randomUUID();
    }

    return {
      stream: source,
      contentLength: stat.size,
      fileName,
    };
  }

  private async upload<Res>(
    type: UploadType,
    file: UploadFile,
    options?: DefaultOptions,
    descriptor?: WireDescriptor,
  ): Promise<Res> {
    const res = await this.api.raw.uploads.getUploadUrl({ type });
    const { url: uploadUrl, token } = res;
    const timeoutMs = options?.timeout ?? DEFAULT_UPLOAD_TIMEOUT;

    if ('stream' in file) {
      return this.uploadFromStream<Res>({ file, uploadUrl, token }, timeoutMs, descriptor);
    }
    return this.uploadFromBuffer<Res>({ file, uploadUrl }, timeoutMs, descriptor);
  }

  private async uploadFromStream<Res>({
    file, uploadUrl, token,
  }: {
    file: FileStream,
    uploadUrl: string,
    token?: string
  }, timeoutMs: number, descriptor?: WireDescriptor): Promise<Res> {
    if (token) {
      await uploadRange({ file, uploadUrl }, this.api.raw.request, timeoutMs);
      return { token } as Res;
    }
    return uploadMultipart<Res>(
      { file, uploadUrl },
      this.api.raw.request,
      timeoutMs,
      descriptor,
    );
  }

  private async uploadFromBuffer<Res>({ file, uploadUrl }: {
    file: FileBuffer,
    uploadUrl: string,
  }, timeoutMs: number, descriptor?: WireDescriptor): Promise<Res> {
    const formData = new FormData();
    formData.append('data', new Blob([file.buffer]), file.fileName);

    const res = await this.api.raw.request({
      url: uploadUrl,
      init: {
        method: 'POST',
        body: formData,
      },
      timeoutMs,
    });

    return parseUploadResponse<Res>(res, descriptor);
  }

  async image({ timeout, ...source }: UploadImageOptions) {
    if ('url' in source) {
      return { url: source.url };
    }

    const fileBlob = await this.getStreamFromSource(source.source);

    return this.upload<{
      photos: { [key: string]: { token: string } }
    } | { token: string }>('image', fileBlob, { timeout });
  }

  async video({ source, ...options }: UploadVideoOptions) {
    const fileBlob = await this.getStreamFromSource(source);

    return this.upload<{
      id?: Int64,
      token: string,
    }>('video', fileBlob, options, { id: true });
  }

  async file({ source, ...options }: UploadFileOptions) {
    const fileBlob = await this.getStreamFromSource(source);

    return this.upload<{
      id?: Int64,
      token: string,
    }>('file', fileBlob, options, { id: true });
  }

  async audio({ source, ...options }: UploadAudioOptions) {
    const fileBlob = await this.getStreamFromSource(source);

    return this.upload<{
      id?: Int64,
      token: string,
    }>('audio', fileBlob, options, { id: true });
  }
}
