import type { NextFunction } from 'express';
import { z } from 'zod';
import type { Endpoint, EndpointDefinition } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse } from './route.js';

interface RequestParser<E extends EndpointDefinition> {
    parseBody?: (data: unknown) => Endpoint<E>['Body'];
    parseQuery?: (data: unknown) => Endpoint<E>['Querystring'];
    parseParams?: (data: unknown) => Endpoint<E>['Params'];
}

export const validateRequest =
    <E extends EndpointDefinition>(parser: RequestParser<E>) =>
    (req: EndpointRequest<E>, res: EndpointResponse<E>, next: NextFunction) => {
        try {
            if (parser.parseBody) {
                parser.parseBody(req.body);
            } else {
                z.object({}).strict('Body is not allowed').parse(req.body);
            }
            if (parser.parseQuery) {
                parser.parseQuery(req.query);
            } else {
                z.object({}).strict('Query string parameters are not allowed').parse(req.query);
            }
            if (parser.parseParams) {
                parser.parseParams(req.params);
            } else {
                z.object({}).strict('Url parameters are not allowed').parse(req.params);
            }
            return next();
        } catch (error: unknown) {
            if (error instanceof z.ZodError) {
                return res.status(400).send({ error: { code: 'invalid_request', message: `${error}` } });
            }
        }
    };
