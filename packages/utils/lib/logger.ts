import { format as utilFormat, inspect } from 'node:util';

import colors from '@colors/colors';
import winston from 'winston';

import { isCloud, isEnterprise, isTest } from './environment/detection.js';
import { errorToObject } from './errorSerialize.js';

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
const ERROR_KEYS = ['err', 'error', 'cause'] as const;
const FORMAT_TOKENS = /%[scdjifoO%]/g;
const ESCAPED_PERCENT = /%%/g;

const level = process.env['LOG_LEVEL'] ? process.env['LOG_LEVEL'] : isTest ? 'error' : 'info';

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Error);
}

function countExpectedFormatArgs(message: string): number {
    const tokens = message.match(FORMAT_TOKENS);
    if (!tokens) {
        return 0;
    }

    const escapes = message.match(ESCAPED_PERCENT)?.length ?? 0;
    return tokens.length - escapes;
}

function mergeSplatArgs(info: Record<string, unknown>, splat: unknown[]): void {
    if (splat.length === 0) {
        return;
    }

    if (splat.length === 1) {
        const arg = splat[0];
        if (isPlainObject(arg)) {
            Object.assign(info, arg);
        } else if (arg instanceof Error) {
            info['err'] = arg;
        } else if (arg !== undefined) {
            info['args'] = [arg];
        }
        return;
    }

    const errors = splat.filter((arg): arg is Error => arg instanceof Error);
    const objects = splat.filter(isPlainObject);
    const rest = splat.filter((arg) => arg !== undefined && !(arg instanceof Error) && !isPlainObject(arg));

    if (objects.length === 1 && errors.length <= 1 && rest.length === 0) {
        Object.assign(info, objects[0]);
        if (errors[0]) {
            info['err'] = errors[0];
        }
        return;
    }

    info['args'] = splat.map((arg) => (arg instanceof Error ? errorToObject(arg) : arg));
    if (errors.length === 1 && info['err'] == null && info['error'] == null) {
        info['err'] = errors[0];
    }
}

function promoteFormatArgErrors(info: Record<string, unknown>, formatArgs: unknown[]): void {
    if (info['err'] != null || info['error'] != null) {
        return;
    }

    const err = formatArgs.find((arg): arg is Error => arg instanceof Error);
    if (err) {
        info['err'] = err;
    }
}

function serializeErrorFields(info: Record<string, unknown>): void {
    for (const key of ERROR_KEYS) {
        if (info[key] != null) {
            info[key] = errorToObject(info[key]);
        }
    }

    if (info['stack']) {
        return;
    }

    for (const key of ERROR_KEYS) {
        const serialized = info[key];
        if (serialized && typeof serialized === 'object' && typeof (serialized as { stack?: unknown }).stack === 'string') {
            info['stack'] = (serialized as { stack: string }).stack;
            return;
        }
    }
}

/**
 * Replaces winston's splat formatter for cloud JSON output. Merges metadata objects, serializes
 * err/error/cause fields, and collects leftover positional primitives into an `args` array.
 */
function normalizeSplatAndErrors() {
    return winston.format((info) => {
        const splat = info[SPLAT] as unknown[] | undefined;

        if (splat?.length) {
            const message = typeof info.message === 'string' ? info.message : String(info.message);
            const expectedFormatArgs = countExpectedFormatArgs(message);

            if (expectedFormatArgs > 0) {
                const splatCopy = [...splat];
                const extraCount = expectedFormatArgs - splatCopy.length;
                const metas = extraCount < 0 ? splatCopy.splice(extraCount) : [];
                const formatArgs = splatCopy;

                info.message = utilFormat(message, ...formatArgs);
                mergeSplatArgs(info as Record<string, unknown>, metas);
                promoteFormatArgErrors(info as Record<string, unknown>, formatArgs);
            } else {
                mergeSplatArgs(info as Record<string, unknown>, splat);
            }
        }

        serializeErrorFields(info as Record<string, unknown>);
        return info;
    })();
}

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
    // Structured JSON for log collectors (Datadog). One NDJSON line per event so payloads
    // and stack traces don't split across multiple log entries.
    formatters = [
        winston.format.errors({ stack: true }),
        normalizeSplatAndErrors(),
        winston.format.timestamp(),
        winston.format((info) => {
            info['status'] = info.level;
            return info;
        })(),
        winston.format.json()
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
