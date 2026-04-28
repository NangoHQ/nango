import { inspect } from 'node:util';

import colors from '@colors/colors';
import winston from 'winston';

import { isCloud, isEnterprise, isTest } from './environment/detection.js';

import type { LeveledLogMethod, Logform } from 'winston';

// Methods exposed by the logger. Restricted to the syslog levels actually used in the codebase
// so callers can only invoke level methods that exist at runtime — guards against the INC-99 class
// of bug where `logger.warn(...)` compiled (winston's Logger has a `[key: string]: any` index
// signature) but threw at runtime because the syslog level is `warning`, not `warn`. Add other
// syslog levels (`emerg`, `alert`, `crit`, `notice`) here intentionally if a real need arises.
export interface StrictLogger {
    error: LeveledLogMethod;
    warning: LeveledLogMethod;
    info: LeveledLogMethod;
    debug: LeveledLogMethod;
    close: () => void;
}

const SPLAT = Symbol.for('splat');
const level = process.env['LOG_LEVEL'] ? process.env['LOG_LEVEL'] : isTest ? 'error' : 'info';

let formatters: Logform.Format[] = [];
if (!isCloud && !isEnterprise) {
    formatters = [
        winston.format.colorize({ colors: { info: 'blue' } }),
        winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
        winston.format.printf((info) => {
            const { level, service, message } = info;

            const splat = info[SPLAT] as any[] | undefined;

            // Remove symbols
            return `${colors.magenta(info['timestamp'])} ${level} ${service ? colors.dim(`(${service}) `) : ''}${message} ${
                splat && splat.length > 0
                    ? splat
                          .map((obj) => {
                              if (typeof obj === 'undefined') {
                                  return;
                              }
                              return inspect(obj, {
                                  showHidden: false,
                                  showProxy: false,
                                  depth: 5,
                                  colors: true,
                                  compact: true,
                                  sorted: true,
                                  breakLength: Infinity
                              });
                          })
                          .join(' ')
                    : ''
            }`;
        })
    ];
} else {
    formatters = [
        winston.format.printf((info) => {
            const splat = info[SPLAT] && info[SPLAT].length > 0 ? JSON.stringify(info[SPLAT]) : '';
            return `${info['service'] ? ` [${info['service']}] ` : ''}${info.message} ${splat}`;
        })
    ];
}

const defaultLogger = winston.createLogger({
    levels: winston.config.syslog.levels,
    format: winston.format.combine(...formatters),
    transports: [new winston.transports.Console({ level })]
});

export function getLogger(service?: string): StrictLogger {
    return defaultLogger.child({ service }) as unknown as StrictLogger;
}
