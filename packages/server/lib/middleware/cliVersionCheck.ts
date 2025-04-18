import semver from 'semver';

import { NANGO_VERSION, getLogger } from '@nangohq/utils';

import type { ApiError } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const logger = getLogger('CliVersionCheck');

const VERSION_REGEX = /nango-cli\/([0-9.]+)/;
export function cliMinVersion(minVersion: string) {
    return (req: Request, res: Response, next: NextFunction) => {
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
            res.status(400).send({
                error: { code: 'invalid_cli_version', message: `This endpoint requires a CLI version >= ${minVersion} (current: ${match[0]})` }
            });
            return;
        }

        next();
    };
}

/**
 * Enforce maximum CLI version.
 * It's only there to prevent accidental upgrade on enterprise, it's otherwise a bit unpractical in case of rollback
 */
export function cliMaxVersion() {
    return (req: Request, res: Response<ApiError<'invalid_cli_version'>>, next: NextFunction) => {
        const userAgent = req.headers['user-agent'];
        if (!userAgent) {
            next();
            return;
        }

        const match = userAgent.match(VERSION_REGEX);
        if (!match || match.length <= 1 || !match[1]) {
            next();
            return;
        }

        if (semver.gt(match[1], NANGO_VERSION)) {
            res.status(400).send({
                error: {
                    code: 'invalid_cli_version',
                    message: `You are using a SDK version greater than the API version (SDK: ${match[1]}, API: ${NANGO_VERSION})`
                }
            });
            return;
        }

        next();
    };
}
