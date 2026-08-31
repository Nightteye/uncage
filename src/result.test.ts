import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  tryCatch,
  tryCatchAsync,
  combine,
  type Result,
} from './result.js';

describe('Result type', () => {
  describe('constructors', () => {
    it('creates ok result', () => {
      const result = ok(42);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(42);
    });

    it('creates err result', () => {
      const result = err(new Error('fail'));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toBe('fail');
    });
  });

  describe('unwrap', () => {
    it('returns value for ok', () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it('throws for err', () => {
      expect(() => unwrap(err(new Error('fail')))).toThrow('fail');
    });
  });

  describe('unwrapOr', () => {
    it('returns value for ok', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it('returns default for err', () => {
      expect(unwrapOr(err(new Error('fail')), 0)).toBe(0);
    });
  });

  describe('map', () => {
    it('transforms ok value', () => {
      const result = map(ok(2), x => x * 3);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(6);
    });

    it('passes through err', () => {
      const result = map(err('error'), x => x * 3);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error).toBe('error');
    });
  });

  describe('mapErr', () => {
    it('transforms err value', () => {
      const result = mapErr(err('error'), e => new Error(e));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toBe('error');
    });

    it('passes through ok', () => {
      const result = mapErr(ok(42), e => new Error(e));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(42);
    });
  });

  describe('andThen', () => {
    it('chains ok results', () => {
      const result = andThen(ok(2), x => ok(x * 3));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(6);
    });

    it('short circuits on err', () => {
      const result = andThen(err('error'), x => ok(x * 3));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error).toBe('error');
    });

    it('propagates err from second function', () => {
      const result = andThen(ok(2), () => err('second error'));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error).toBe('second error');
    });
  });

  describe('tryCatch', () => {
    it('returns ok for successful sync function', () => {
      const result = tryCatch(() => JSON.parse('{"a": 1}'));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toEqual({ a: 1 });
    });

    it('returns err for throwing sync function', () => {
      const result = tryCatch(() => JSON.parse('invalid'));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error).toBeInstanceOf(Error);
    });

    it('uses custom error transformer', () => {
      const result = tryCatch(
        () => JSON.parse('invalid'),
        () => new Error('custom parse error')
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toBe('custom parse error');
    });

    it('normalizes non-Error throws to an Error with a message', () => {
      const result = tryCatch(() => {
        // eslint-disable-next-line no-throw-literal
        throw 'boom';
      });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(Error);
        expect((result.error as Error).message).toBe('boom');
      }
    });
  });

  describe('tryCatchAsync', () => {
    it('returns ok for successful async function', async () => {
      const result = await tryCatchAsync(async () => {
        await Promise.resolve();
        return 42;
      });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(42);
    });

    it('returns err for throwing async function', async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error('async fail');
      });
      expect(isErr(result)).toBe(true);
    });
  });

  describe('combine', () => {
    it('combines multiple ok results', () => {
      const result = combine([ok(1), ok('two'), ok(true)]);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toEqual([1, 'two', true]);
    });

    it('short circuits on first err', () => {
      const result = combine([ok(1), err('fail'), ok(3)]);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error).toBe('fail');
    });

    it('handles empty array', () => {
      const result = combine([]);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toEqual([]);
    });
  });
});