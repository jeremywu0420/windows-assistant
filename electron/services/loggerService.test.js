import { describe, it, expect } from 'vitest';
import logger from './loggerService.js';

const { createLogger, LEVELS } = logger;

function makeLogger(overrides = {}) {
  const lines = [];
  let t = 0;
  const log = createLogger({
    writeLine: (line) => lines.push(line),
    now: () => `t${(t += 1)}`,
    capacity: 3,
    ...overrides,
  });
  return { log, lines };
}

describe('createLogger', () => {
  it('writes one JSON line per entry with ts/level/msg + meta', () => {
    const { log, lines } = makeLogger();
    log.info('hello', { user: 'alice' });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({ level: 'info', msg: 'hello', user: 'alice' });
    expect(parsed.ts).toBe('t1');
  });

  it('drops entries below the minimum level', () => {
    const { log, lines } = makeLogger({ minLevel: 'warn' });
    log.info('skip me');
    log.warn('keep me');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).msg).toBe('keep me');
  });

  it('respects the enabled() gate (opt-out)', () => {
    const { log, lines } = makeLogger({ enabled: () => false });
    log.error('should not write');
    expect(lines).toHaveLength(0);
    expect(log.recent()).toHaveLength(0);
  });

  it('keeps an in-memory ring buffer capped at capacity', () => {
    const { log } = makeLogger();
    log.info('a');
    log.info('b');
    log.info('c');
    log.info('d');
    const recent = log.recent();
    expect(recent).toHaveLength(3); // capacity 3 -> oldest dropped
    expect(recent.map((e) => e.msg)).toEqual(['b', 'c', 'd']);
  });

  it('recent() can filter by minimum level', () => {
    const { log } = makeLogger();
    log.info('i');
    log.error('e');
    expect(log.recent('error').map((x) => x.msg)).toEqual(['e']);
  });

  it('never throws if the writer fails', () => {
    const log = createLogger({
      writeLine: () => {
        throw new Error('disk full');
      },
    });
    expect(() => log.info('still fine')).not.toThrow();
    expect(log.recent()).toHaveLength(1);
  });

  it('exposes ordered level thresholds', () => {
    expect(LEVELS.debug).toBeLessThan(LEVELS.info);
    expect(LEVELS.info).toBeLessThan(LEVELS.warn);
    expect(LEVELS.warn).toBeLessThan(LEVELS.error);
  });
});
