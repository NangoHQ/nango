import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import fs from 'fs';

import { FILENAME } from '../utils/file-logger.js';

//import type { ProxyBodyConfiguration, Connection, HTTP_VERB } from '../models.js';
//import { NangoError } from '../utils/error.js';

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
                    res.send(fileContents);
                }
            }
        } catch (error) {
            next(error);
        }
    }
}

export default new ActivityController();
