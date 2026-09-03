/** Canonical signed decimal representation of a MAX int64. */
export type Int64 = `${bigint}`;

const INT64_MIN = -9223372036854775808n;
const INT64_MAX = 9223372036854775807n;
const INT64_PATTERN = /^(?:0|-[1-9]\d*|[1-9]\d*)$/;

/** Returns whether a value is a canonical signed decimal int64. */
export function isInt64(value: unknown): value is Int64 {
  if (typeof value !== 'string' || value.length > 20 || !INT64_PATTERN.test(value)) return false;

  const integer = BigInt(value);
  return integer >= INT64_MIN && integer <= INT64_MAX;
}

/** Asserts that a value is a canonical signed decimal int64. */
export function assertInt64(value: unknown): asserts value is Int64 {
  if (!isInt64(value)) throw new TypeError('Expected a canonical signed decimal int64');
}
