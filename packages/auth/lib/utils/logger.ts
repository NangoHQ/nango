import winston from 'winston';
import type { Logger } from 'winston';

const nangoLogFormat = winston.format.printf((info) => {
    return `${info['timestamp']} [${info['level'].toUpperCase()}] ${info['message']}`;
});

class NangoLogger {
    logger: Logger;

    constructor() {
        this.logger = winston.createLogger({
            levels: winston.config.syslog.levels,
            format: winston.format.combine(winston.format.timestamp(), nangoLogFormat),
            transports: [new winston.transports.Console({ level: process.env['LOG_LEVEL'] || 'info' })]
        });
    }
}

export default new NangoLogger().logger;
