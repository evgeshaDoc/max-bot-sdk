import type { URec } from '@tsofist/stem';
import { entriesOf } from '@tsofist/stem/lib/object/entries-of';
import { isLosslessNumber, isSafeNumber } from 'lossless-json';
import { MaxError, MaxErrorKind } from './error';
import { WireInt64 } from './json';
import { assertInt64 as assertPublicInt64 } from './types/int64';

const WIRE_CONTRACT_ERROR = 'MAX response does not match its wire contract';

export type WireDescriptor = true | WireMapDescriptor | {
  readonly [field: string]: WireDescriptor;
} | readonly [WireDescriptor];

export interface WireMapDescriptor {
  readonly kind: 'map';
  readonly values: WireDescriptor;
}

/** Converts descriptor-selected wire integers to canonical decimal strings. */
export function normalizeWireValue(value: unknown, descriptor?: WireDescriptor): unknown {
  if (descriptor === true) return normalizeInt64(value);
  if (value === null || value === undefined) return value;
  if (!descriptor) return normalizeSafeValue(value);
  if (isMapDescriptor(descriptor)) {
    if (!isObject(value)) {
      throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
    }
    return Object.fromEntries(entriesOf(value).map(([key, item]) => [
      key,
      normalizeWireValue(item, descriptor.values),
    ]));
  }
  if (isArrayDescriptor(descriptor)) {
    if (!Array.isArray(value)) {
      throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
    }
    return value.map((item) => normalizeWireValue(item, descriptor[0]));
  }
  if (!isObject(value)) {
    throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
  }

  return Object.fromEntries(entriesOf(value).map(([key, item]) => [
    key,
    normalizeWireValue(item, descriptor[key]),
  ]));
}

/** Marks descriptor-selected public decimal strings for bare-number serialization. */
export function encodeWireValue(value: unknown, descriptor?: WireDescriptor): unknown {
  if (value === null || value === undefined) return value;
  if (descriptor === true) return new WireInt64(assertInt64(value));
  if (!descriptor) return value;
  if (isMapDescriptor(descriptor)) {
    if (!isObject(value)) {
      throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
    }
    return Object.fromEntries(entriesOf(value).map(([key, item]) => [
      key,
      encodeWireValue(item, descriptor.values),
    ]));
  }
  if (isArrayDescriptor(descriptor)) {
    if (!Array.isArray(value)) {
      throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
    }
    return value.map((item) => encodeWireValue(item, descriptor[0]));
  }
  if (!isObject(value)) {
    throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
  }

  return Object.fromEntries(entriesOf(value).map(([key, item]) => [
    key,
    encodeWireValue(item, descriptor[key]),
  ]));
}

/** Validates descriptor-selected public int64 values without changing their shape. */
export function validateWireValue(value: unknown, descriptor?: WireDescriptor): void {
  if (value === null || value === undefined || !descriptor) return;
  if (descriptor === true) {
    assertInt64(value);
    return;
  }
  if (isMapDescriptor(descriptor)) {
    if (!isObject(value)) {
      throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
    }
    for (const item of Object.values(value)) validateWireValue(item, descriptor.values);
    return;
  }
  if (isArrayDescriptor(descriptor)) {
    if (!Array.isArray(value)) {
      throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
    }
    for (const item of value) validateWireValue(item, descriptor[0]);
    return;
  }
  if (!isObject(value)) {
    throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
  }
  for (const [key, fieldDescriptor] of entriesOf(descriptor)) {
    validateWireValue(value[key], fieldDescriptor);
  }
}

/** Validates and returns a canonical signed MAX int64. */
export function assertInt64(value: unknown): string {
  try {
    assertPublicInt64(value);
  } catch (error) {
    throw new MaxError(WIRE_CONTRACT_ERROR, {
      kind: MaxErrorKind.Protocol,
      cause: error,
    });
  }
  return value;
}

function normalizeInt64(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (isLosslessNumber(value)) return assertInt64(value.toString());
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
    }
    return String(value);
  }
  throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
}

function normalizeSafeValue(value: unknown): unknown {
  if (isLosslessNumber(value)) {
    const source = value.toString();
    if (!isSafeNumber(source)) {
      throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
    }
    const number = Number(source);
    if (!Number.isFinite(number)) {
      throw new MaxError(WIRE_CONTRACT_ERROR, { kind: MaxErrorKind.Protocol });
    }
    return number;
  }
  if (Array.isArray(value)) return value.map(normalizeSafeValue);
  if (isObject(value)) {
    return Object.fromEntries(entriesOf(value).map(([key, item]) => [
      key,
      normalizeSafeValue(item),
    ]));
  }
  return value;
}

function isObject(value: unknown): value is URec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMapDescriptor(value: WireDescriptor): value is WireMapDescriptor {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && 'kind' in value
    && value.kind === 'map';
}

function isArrayDescriptor(value: WireDescriptor): value is readonly [WireDescriptor] {
  return Array.isArray(value);
}
