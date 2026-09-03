import {
  parse,
  stringify,
  type NumberStringifier,
} from 'lossless-json';

const int64NumberStringifier: NumberStringifier = {
  test: isInt64Value,
  stringify: stringifyInt64Value,
};

/** Internal marker used only while producing a MAX JSON request body. */
export class WireInt64 {
  constructor(readonly value: string) {}
}

/** Parses MAX JSON while retaining exact numeric lexemes for descriptor normalization. */
export function parseLosslessJson(text: string): unknown {
  return parse(text);
}

/** Serializes descriptor-marked int64 strings as bare JSON integers. */
export function stringifyLosslessJson(value: unknown): string {
  const result = stringify(value, null, undefined, [int64NumberStringifier]);
  if (result === undefined) {
    throw new TypeError('MAX request body is not serializable');
  }
  return result;
}

function isInt64Value(value: unknown): value is WireInt64 {
  return value instanceof WireInt64;
}

function stringifyInt64Value(value: unknown): string {
  if (!(value instanceof WireInt64)) {
    throw new TypeError('Expected a MAX wire int64');
  }
  return value.value;
}
