import winston from 'winston';
import type { Logger } from 'winston';
import { isTest } from './environment/detection.js';

const nangoLogFormat = (service = '') => {
    return winston.format.printf((info) => {
        return `${info['timestamp']} [${info.level.toUpperCase()}]${service ? ` [${service}] ` : ''}${info.message}`;
    });
};

export function getLogger(service?: string): Logger {
    const level = process.env['LOG_LEVEL'] || isTest ? 'error' : 'info';
    return winston.createLogger({
        levels: winston.config.syslog.levels,
        format: winston.format.combine(winston.format.timestamp(), nangoLogFormat(service)),
        transports: [new winston.transports.Console({ level })]
    });
}
