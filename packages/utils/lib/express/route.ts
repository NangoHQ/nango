import type { Request, Response, NextFunction, Express } from 'express';
import type { Endpoint, EndpointDefinition } from '@nangohq/types';

export type EndpointRequest<E extends EndpointDefinition> = Request<
    Endpoint<E>['Params'],
    Endpoint<E>['Reply'],
    Endpoint<E>['Body'],
    Endpoint<E>['Querystring']
>;
export type EndpointResponse<E extends EndpointDefinition> = Response<Endpoint<E>['Reply']>;

export interface Route<E extends EndpointDefinition> {
    path: E['Path'];
    method: E['Method'];
}

export interface RouteHandler<E extends EndpointDefinition> extends Route<E> {
    validate: (req: EndpointRequest<E>, res: EndpointResponse<E>, next: NextFunction) => void;
    handler: (req: EndpointRequest<E>, res: EndpointResponse<E>, next: NextFunction) => void;
}

export const createRoute = <E extends EndpointDefinition>(server: Express, rh: RouteHandler<E>): void => {
    if (rh.method === 'GET') {
        server.get(rh.path, rh.validate, rh.handler);
    } else if (rh.method === 'POST') {
        server.post(rh.path, rh.validate, rh.handler);
    } else if (rh.method === 'PATCH') {
        server.patch(rh.path, rh.validate, rh.handler);
    } else if (rh.method === 'PUT') {
        server.put(rh.path, rh.validate, rh.handler);
    } else if (rh.method === 'DELETE') {
        server.delete(rh.path, rh.validate, rh.handler);
    }
};

export const routeFetch = <E extends EndpointDefinition>(baseUrl: string, route: Route<E>) => {
    return async function f({
        query,
        body,
        params
    }: {
        query?: Endpoint<E>['Querystring'];
        body?: Endpoint<E>['Body'];
        params?: Endpoint<E>['Params'];
    }): Promise<Endpoint<E>['Reply']> {
        const search = query ? `?${new URLSearchParams(query)}` : '';
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
                signal: AbortSignal.timeout(200)
            });
            let json: Endpoint<E>['Reply'] = {};
            if (res.headers.get('content-type')?.includes('application/json')) {
                json = (await res.json()) as Endpoint<E>['Reply'];
            }
            if (res.status >= 400) {
                return { error: { code: 'fetch_failed', message: `${route.method} ${url} failed with status code ${res.status}: ${JSON.stringify(json)}` } };
            }
            return json;
        } catch (error: unknown) {
            return { error: { code: 'fetch_failed', message: `${route.method} ${url} failed: ${error}` } };
        }
    };
};
