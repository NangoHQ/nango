import Transport from 'winston-transport';
import winston from 'winston';
import fs from 'fs';

import logger from './logger.js';
import type { HTTP_VERB } from '../models.js';

export type LogLevel = 'info' | 'debug' | 'error';
export type LogAction = 'oauth' | 'proxy' | 'token';
interface Message {
    [index: string]: undefined | string | number | Record<string, string | boolean>;
}

export interface LogData {
    level: LogLevel;
    action: LogAction;
    success: boolean;
    timestamp: number;
    start: number;
    end?: number;
    message: string;
    messages: Message[];
    connectionId: string;
    providerConfigKey: string;
    provider?: string;
    method?: HTTP_VERB;
    endpoint?: string;
    merge?: boolean;
    sessionId?: string;
}

class CustomTransport extends Transport {
    private filename: string;

    constructor(opts: any) {
        super(opts);
        this.filename = opts.filename;
        this.setup();
    }

    initialize() {
        try {
            fs.writeFileSync(this.filename, '', 'utf8');
        } catch (error) {
            console.log(error);
        }
    }

    setup() {
        if (fs.existsSync(this.filename)) {
            try {
                const data = fs.readFileSync(this.filename, 'utf8');
                const content = JSON.parse(data);
                if (!Array.isArray(content)) {
                    this.initialize();
                }
            } catch (error) {
                this.initialize();
                console.log(error);
            }
        } else {
            this.initialize();
        }
    }

    createIfMissing() {
        if (!fs.existsSync(this.filename)) {
            this.initialize();
        }
    }

    readLog() {
        let data = null;
        try {
            data = fs.readFileSync(this.filename, 'utf8');
        } catch (error) {
            console.log(error);
        }
        return data;
    }

    public writeLog(info: any) {
        const data = this.readLog();
        let arr = [];
        if (data) {
            arr = JSON.parse(data);
        }
        arr.push(info);
        const json = JSON.stringify(arr);
        try {
            fs.writeFileSync(this.filename, json as string, 'utf8');
        } catch (error) {
            console.log(error);
        }
    }

    override log(info: LogData, callback: () => void) {
        this.createIfMissing();
        setImmediate(() => {
            this.emit('logged', info);
        });
        if (info.messages) {
            info.message = info.messages.join(',');
        }
        this.writeLog(info);

        callback();
    }
}

export const FILENAME = 'NangoActivity.json';

export const fileLogger = winston.createLogger({
    format: winston.format.json(),
    transports: [
        new CustomTransport({
            filename: FILENAME,
            handleExceptions: true,
            maxsize: 5242880, // 5mb
            maxFiles: 3
        })
    ]
});

export const updateAppLogs = (log: LogData, level: LogLevel, message: Message) => {
    log.messages.push(message);
    logger.log(level, message['content']);
};

export const updateAppLogsAndWrite = (log: LogData, level: LogLevel, message: Message) => {
    updateAppLogs(log, level, message);
    log.end = Date.now();
    fileLogger.info('', log);
};
