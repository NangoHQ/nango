import { inspect } from 'node:util';
import winston from 'winston';
import type { Logform, Logger } from 'winston';
import colors from '@colors/colors';
import { isCloud, isEnterprise, isTest } from './environment/detection.js';
import { nanoid } from 'nanoid';

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
    const instanceId = isCloud ? ` ${nanoid(6)}` : '';

    formatters = [
        winston.format.printf((info) => {
            const splat = info[SPLAT] && info[SPLAT].length > 0 ? JSON.stringify(info[SPLAT]) : '';
            return `[${info.level.toUpperCase()}]${instanceId}${info['service'] ? ` [${info['service']}] ` : ''}${info.message} ${splat}`;
        })
    ];
}

const defaultLogger = winston.createLogger({
    levels: winston.config.syslog.levels,
    format: winston.format.combine(...formatters),
    transports: [new winston.transports.Console({ level })]
});

export function getLogger(service?: string): Logger {
    return defaultLogger.child({ service });
}
