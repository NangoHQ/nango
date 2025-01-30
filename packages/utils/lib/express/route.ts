import tracer from 'dd-trace';
import type { Request, Response, NextFunction, Express } from 'express';
import type { Endpoint } from '@nangohq/types';
import * as metrics from '../telemetry/metrics.js';

export type EndpointRequest<E extends Endpoint<any>> = Request<E['Params'], E['Reply'], E['Body'], E['Querystring']>;
export type EndpointResponse<E extends Endpoint<any>> = Response<E['Reply']>;

export interface Route<E extends Endpoint<any>> {
    path: E['Path'];
    method: E['Method'];
}

export interface RouteHandler<E extends Endpoint<any>> extends Route<E> {
    validate: (req: EndpointRequest<E>, res: EndpointResponse<E>, next: NextFunction) => void;
    handler: (req: EndpointRequest<E>, res: EndpointResponse<E>, next: NextFunction) => void | Promise<void>;
}

export const createRoute = <E extends Endpoint<any>>(server: Express, rh: RouteHandler<E>): void => {
    const safeHandler = (req: EndpointRequest<E>, res: EndpointResponse<E>, next: NextFunction): void => {
        const active = tracer.scope().active();
        if (active) {
            active?.setTag('http.route', req.route?.path || req.originalUrl);
            const contentLength = req.header('content-length');
            if (contentLength) {
                const int = parseInt(contentLength, 10);
                active.setTag('http.request.body.size', int);
                metrics.histogram(metrics.Types.API_REQUEST_CONTENT_LENGTH, int);
            }
        }

        Promise.resolve(rh.handler(req, res, next)).catch((err: unknown) => next(err));
    };

    if (rh.method === 'GET') {
        server.get(rh.path, rh.validate, safeHandler);
    } else if (rh.method === 'POST') {
        server.post(rh.path, rh.validate, safeHandler);
    } else if (rh.method === 'PATCH') {
        server.patch(rh.path, rh.validate, safeHandler);
    } else if (rh.method === 'PUT') {
        server.put(rh.path, rh.validate, safeHandler);
    } else if (rh.method === 'DELETE') {
        server.delete(rh.path, rh.validate, safeHandler);
    }
};

export const routeFetch = <E extends Endpoint<any>>(
    baseUrl: string,
    route: Route<E>,
    config?: {
        timeoutMs?: number | undefined;
    }
) => {
    return async function _fetch({ query, body, params }: { query?: E['Querystring']; body?: E['Body']; params?: E['Params'] }): Promise<E['Reply']> {
        const search = query ? `?${new URLSearchParams(query).toString()}` : '';
        let path = route.path;
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                path = path.replace(`:${key}`, value);
            }
        }
        AbortSignal.timeout = function timeout(ms) {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), ms);
            return ctrl.signal;
        };
        const url = `${baseUrl}${path}${search.toString()}`;
        try {
            const headers = body ? { 'content-type': 'application/json' } : {};
            const res = await fetch(url, {
                method: route.method,
                headers,
                body: body ? JSON.stringify(body) : null,
                signal: AbortSignal.timeout(config?.timeoutMs || 120_000)
            });
            let json: Endpoint<E>['Reply'] = {};
            if (res.headers.get('content-type')?.includes('application/json')) {
                json = (await res.json()) as Endpoint<E>['Reply'];
            }
            if (res.status >= 400) {
                return {
                    error: {
                        code: 'fetch_failed',
                        message: `${route.method} ${url} failed with status code ${res.status}`,
                        payload: json
                    }
                };
            }
            return json;
        } catch (err) {
            return { error: { code: 'fetch_failed', message: `${route.method} ${url} failed`, payload: err } };
        }
    };
};
