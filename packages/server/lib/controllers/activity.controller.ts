import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import fs from 'fs';

import { FILENAME, LogData } from '../utils/file-logger.js';

class ActivityController {
    /**
     * Retrieve
     * @desc
     * @param {Request} req Express request object
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     */
    public async retrieve(_req: Request, res: Response, next: NextFunction) {
        try {
            const filePath = `./${FILENAME}`;
            if (fs.existsSync(filePath)) {
                const fileContents = fs.readFileSync(filePath, 'utf8');

                if (fileContents.length === 0) {
                    res.send([]);
                } else {
                    const mergedLogs = this.mergeSessions(JSON.parse(fileContents) as unknown as LogData[]);
                    res.send(mergedLogs);
                }
            }
        } catch (error) {
            next(error);
        }
    }

    private mergeSessions(logs: LogData[]) {
        const sessions: Record<string, LogData> = {};
        const updatedLogs: LogData[] = [];

        logs.forEach((item) => {
            if (item.sessionId) {
                if (!sessions[item.sessionId]) {
                    sessions[item.sessionId] = item;
                    updatedLogs.push(item);
                } else {
                    sessions[item?.sessionId]!.messages = [...sessions[item?.sessionId]!.messages, ...item.messages];
                    sessions[item?.sessionId]!.merge = true;
                }
            } else {
                updatedLogs.push(item);
            }
        });

        Object.values(sessions).forEach((item) => {
            if (!item.merge) {
                updatedLogs.push(item);
            }
            delete item.merge;
        });

        return updatedLogs;
    }
}

export default new ActivityController();
