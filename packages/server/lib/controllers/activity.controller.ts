import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import fs from 'fs';

import { FILENAME, LogData } from '../utils/file-logger.js';

class ActivityController {
    /**
     * Retrieve
     * @desc read a file path and send back the contents of the file
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

    /**
     * Merge Sessions
     * @desc append any messages of oauth continuation entries that have a merge property of true
     * to an existing session id and update the end time while maintaing
     * log ordering
     */
    private mergeSessions(logs: LogData[]) {
        const updatedLogs: LogData[] = [];
        const sessions: Record<string, number> = {};

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];

            if (log?.sessionId && !log.merge) {
                sessions[log.sessionId] = i;
            }

            if (log?.merge && sessions[log.sessionId as string]) {
                const mergeIndex: number = sessions[log.sessionId as string] as number;
                updatedLogs[mergeIndex]!.messages = [...updatedLogs[mergeIndex]!.messages, ...log.messages];
                updatedLogs[mergeIndex]!.end = log.end as number;
            } else {
                updatedLogs.push(log as LogData);
            }
        }
        return updatedLogs;
    }
}

export default new ActivityController();
