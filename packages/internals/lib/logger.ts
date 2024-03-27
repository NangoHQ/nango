import winston from 'winston';
import type { Logger } from 'winston';

const nangoLogFormat = (service = '') => {
    return winston.format.printf((info) => {
        return `${info['timestamp']} [${info.level.toUpperCase()}]${service ? ` [${service}] ` : ''}${info.message}`;
    });
};

class NangoLogger {
    logger: Logger;

    constructor(service?: string) {
        this.logger = winston.createLogger({
            levels: winston.config.syslog.levels,
            format: winston.format.combine(winston.format.timestamp(), nangoLogFormat(service)),
            transports: [new winston.transports.Console({ level: process.env['LOG_LEVEL'] || 'info' })]
        });
    }
}

export default NangoLogger;
