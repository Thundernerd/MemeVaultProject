const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof LEVELS;

const envLevel = (process.env.MEMEVAULTPROJECT_LOG_LEVEL ?? 'info').toLowerCase() as Level;
const threshold: number = LEVELS[envLevel] ?? LEVELS.info;

const PREFIX = '[memevaultproject]';

export const logger = {
  error: (...args: unknown[]) => { if (threshold >= 0) console.error(PREFIX, ...args); },
  warn:  (...args: unknown[]) => { if (threshold >= 1) console.warn(PREFIX,  ...args); },
  info:  (...args: unknown[]) => { if (threshold >= 2) console.log(PREFIX,   ...args); },
  debug: (...args: unknown[]) => { if (threshold >= 3) console.log(PREFIX,   ...args); },
};
