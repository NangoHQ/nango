import { getLogger } from '@nangohq/utils';
import type { Request, Response, NextFunction } from 'express';

import semver from 'semver';

const logger = getLogger('CliVersionCheck');

const VERSION_REGEX = /nango-cli\/([0-9.]+)/;
export function cliMinVersion(minVersion: string) {
    return (req: Request, _: Response, next: NextFunction) => {
        const userAgent = req.headers['user-agent'];
        if (!userAgent) {
            // Could be strictly enforced
            next();
            return;
        }

        const match = userAgent.match(VERSION_REGEX);
        if (!match || match.length <= 1 || !match[1]) {
            // Could be strictly enforced
            next();
            return;
        }

        if (semver.gt(minVersion, match[1])) {
            logger.info(`This endpoint requires a CLI version >= ${minVersion} (current: ${match[0]})`);
            // res.status(400).send({
            //     error: { code: 'invalid_cli_version', message: `This endpoint requires a CLI version >= ${minVersion} (current: ${match[0]})` }
            // });
            // return;
        }

        next();
    };
}
