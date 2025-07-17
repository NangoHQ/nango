import tracer from 'dd-trace';
import * as uuid from 'uuid';

import { errorToObject, getLogger } from '@nangohq/utils';

import { NangoError } from './error.js';

import type { Request, Response } from 'express';

const logger = getLogger('ErrorManager');

export enum ErrorSourceEnum {
    PLATFORM = 'platform',
    CUSTOMER = 'customer'
}

export type ErrorSource = ErrorSourceEnum;

interface ErrorOptionalConfig {
    source: ErrorSource;
    accountId?: number;
    userId?: number;
    environmentId?: number | undefined;
    metadata?: Record<string, unknown>;
    operation?: string;
}

class ErrorManager {
    /**
     * TODO: reuse information in res.locals when possible
     */
    public report(err: unknown, config: ErrorOptionalConfig = { source: ErrorSourceEnum.PLATFORM }): void {
        logger.error('Exception caught', errorToObject(err));

        if (err instanceof Error) {
            // Log to datadog manually
            // https://github.com/DataDog/dd-trace-js/issues/1944
            const span = tracer.scope().active();
            if (span) {
                span.addTags(config);
                span.setTag('error', err);
            }
        }
    }

    public errResFromNangoErr(res: Response, err: NangoError | null) {
        if (err) {
            logger.error(`Response error`, errorToObject(err));
            if (err.type === 'script_http_error') {
                res.status(424).json({
                    error: {
                        payload: err.payload,
                        code: err.type,
                        ...(err.additional_properties && 'upstream_response' in err.additional_properties
                            ? { upstream: err.additional_properties['upstream_response'] }
                            : {})
                    }
                });
            } else if (!err.message) {
                res.status(err.status || 500).send({
                    error: { code: err.type || 'unknown_error', payload: err.payload, additional_properties: err.additional_properties }
                });
            } else {
                res.status(err.status || 500).send({
                    error: { message: err.message, code: err.type, payload: err.payload, additional_properties: err.additional_properties }
                });
            }
        } else {
            res.status(500).json({ error: { code: 'unknown_empty_error' } });
        }
    }

    public errRes(res: Response, type: string) {
        const err = new NangoError(type);
        this.errResFromNangoErr(res, err);
    }

    public handleGenericError(err: any, _: Request, res: Response): void {
        const errorId = uuid.v4();

        this.report(err);

        const supportError = new NangoError('generic_error_support', errorId);
        this.errResFromNangoErr(res, supportError);
    }
}

export default new ErrorManager();
