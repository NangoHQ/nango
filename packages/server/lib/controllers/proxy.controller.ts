import type { Request, Response } from 'express';
import type { OutgoingHttpHeaders } from 'http';
import type { NextFunction } from 'express';
import axios, { AxiosError, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';

import logger from '../utils/logger.js';
import errorManager from '../utils/error.manager.js';
import configService from '../services/config.service.js';
import type { ProxyBodyConfiguration, Connection, HTTP_VERB } from '../models.js';
import { NangoError } from '../utils/error.js';
import { getConnectionCredentials } from '../utils/connection.js';

interface ForwardedHeaders {
    [key: string]: string;
}

const RETRIES = 2;

axiosRetry(axios, {
    retries: RETRIES,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        const status = error?.response?.status;
        if (error?.response?.status.toString().startsWith('5') || error?.response?.status === 429) {
            logger.info(`API received a ${status} error, retrying with exponential backoffs for a total of ${RETRIES} times`);
            return true;
        }
        return false;
    }
});

class ProxyController {
    public async routeCall(req: Request, res: Response, next: NextFunction) {
        try {
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
                logger.error(
                    `Proxy: the connection id value is missing. If you're making a HTTP request then it should be included in the header 'Connection-Id'. If you're using the SDK the connectionId property should be specified.`
                );
                return;
            }

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_provider_config_key');
                logger.error(
                    `Proxy: the provider config key value is missing. If you're making a HTTP request then it should be included in the header 'Provider-Config-Key'. If you're using the SDK the providerConfigKey property should be specified.`
                );
                return;
            }

            logger.debug('Connection id and provider config key parsed and received successfully');

            const connection = await getConnectionCredentials(res, connectionId, providerConfigKey);

            logger.debug('Connection credentials found successfully');

            const { method } = req;

            const endpoint = req.params[0] as string;

            if (!endpoint) {
                errorManager.errRes(res, 'missing_endpoint');
                logger.error(`Proxy: a API URL endpoint is missing.`);
                return;
            }

            let token;

            switch (connection?.credentials?.type) {
                case 'OAUTH2':
                    token = connection?.credentials?.access_token;
                    break;
                // TODO
                case 'OAUTH1':
                    token = { oAuthToken: connection?.credentials?.oauth_token, oAuthTokenSecret: connection?.credentials?.oauth_token_secret };
                    break;
                default:
                    throw new Error(`Unrecognized OAuth type '${connection?.credentials?.type}' in stored credentials.`);
            }

            logger.debug(`Proxy: token retrieved successfully`);

            const { account_id: accountId } = connection as Connection;
            const providerConfig = await configService.getProviderConfig(providerConfigKey, accountId);
            const headers = this.parseHeaders(req);

            if (!providerConfig) {
                logger.error(`Proxy: provider configuration not found`);
                res.status(404).send();
            }
            const template = configService.getTemplate(String(providerConfig?.provider));

            if (!template.base_api_url) {
                logger.error(
                    `The proxy is not supported for this provider. You can easily add support by following the instructions at https://docs.nango.dev/contribute-api`
                );
                errorManager.errRes(res, 'missing_base_api_url');
                return;
            }

            logger.debug(`Proxy: API call configuration constructed successfully`);

            const configBody: ProxyBodyConfiguration = {
                endpoint,
                method: method as HTTP_VERB,
                template,
                // handle oauth1
                token: String(token),
                providerConfigKey,
                connectionId,
                headers,
                data: req.body
            };

            return this.sendToHttpMethod(res, next, method as HTTP_VERB, configBody);
        } catch (error) {
            next(error);
        }
    }

    private async get(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            const headers = this.constructHeaders(config);
            const responseStream: AxiosResponse = await axios({
                method: 'get',
                url,
                responseType: 'stream',
                headers
            });
            logger.info(`Proxy: GET request to ${url} was successful`);
            res.writeHead(responseStream?.status, responseStream.headers as OutgoingHttpHeaders);
            responseStream.data.pipe(res);
        } catch (error) {
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url, config);
            next(nangoError);
        }
    }

    private sendToHttpMethod(res: Response, next: NextFunction, method: HTTP_VERB, configBody: ProxyBodyConfiguration) {
        const url = this.constructUrl(configBody);

        if (method === 'POST') {
            return this.post(res, next, url, configBody);
        } else if (method === 'PATCH') {
            return this.patch(res, next, url, configBody);
        } else if (method === 'PUT') {
            return this.put(res, next, url, configBody);
        } else if (method === 'DELETE') {
            return this.delete(res, next, url, configBody);
        } else {
            return this.get(res, next, url, configBody);
        }
    }

    private async post(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            const headers = this.constructHeaders(config);
            const responseStream = await axios({
                method: 'post',
                url,
                data: config.data ?? {},
                responseType: 'stream',
                headers
            });
            logger.info(`Proxy: POST request to ${url} was successful`);
            res.writeHead(responseStream?.status, responseStream.headers as OutgoingHttpHeaders);
            responseStream.data.pipe(res);
        } catch (error) {
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url, config);
            next(nangoError);
        }
    }

    private async patch(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            const headers = this.constructHeaders(config);
            const responseStream = await axios({
                method: 'patch',
                url,
                data: config.data ?? {},
                responseType: 'stream',
                headers
            });
            logger.info(`Proxy: PATCH request to ${url} was successful`);
            res.writeHead(responseStream?.status, responseStream.headers as OutgoingHttpHeaders);
            responseStream.data.pipe(res);
        } catch (error) {
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url, config);
            next(nangoError);
        }
    }

    private async put(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            const headers = this.constructHeaders(config);
            const responseStream = await axios({
                method: 'put',
                url,
                data: config.data ?? {},
                responseType: 'stream',
                headers
            });
            logger.info(`Proxy: PUT request to ${url} was successful`);
            res.writeHead(responseStream?.status, responseStream.headers as OutgoingHttpHeaders);
            responseStream.data.pipe(res);
        } catch (error) {
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url, config);
            next(nangoError);
        }
    }

    private async delete(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            const headers = this.constructHeaders(config);
            const responseStream = await axios({
                method: 'delete',
                url,
                responseType: 'stream',
                headers
            });
            logger.info(`Proxy: DELETE request to ${url} was successful`);
            res.writeHead(responseStream?.status, responseStream.headers as OutgoingHttpHeaders);
            responseStream.data.pipe(res);
        } catch (error) {
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url, config);
            next(nangoError);
        }
    }

    private catalogAndReportError(error: Error | AxiosError, url: string, config: ProxyBodyConfiguration) {
        if (axios.isAxiosError(error)) {
            if (error?.response?.status === 404) {
                logger.error(
                    `Response is a 404 to ${url}, make sure you have the endpoint specified and spelled correctly.${
                        config.template.docs ? ` Refer to the documentation at ${config.template.docs} for help` : ''
                    }`
                );
                return new NangoError('unknown_endpoint');
            }
            if (error?.response?.status === 403) {
                logger.error(
                    `Response is a 403 to ${url}, make sure you have the proper scopes configured.${
                        config.template.docs ? ` Refer to the documentation at ${config.template.docs} for help` : ''
                    }`
                );
                return new NangoError('fobidden');
            }
            if (error?.response?.status === 400) {
                logger.error(
                    `Response is a 400 to ${url}, make sure you have the proper headers to go to the API set.${
                        config.template.docs ? ` Refer to the documentation at ${config.template.docs} for help` : ''
                    }`
                );
                return new NangoError('bad_request');
            }
        } else {
            return error;
        }

        return error;
    }

    private constructUrl(config: ProxyBodyConfiguration) {
        const {
            template: { base_api_url: apiBase },
            endpoint: apiEndpoint
        } = config;

        const base = apiBase?.substr(-1) === '/' ? apiBase.slice(0, -1) : apiBase;
        const endpoint = apiEndpoint?.charAt(0) === '/' ? apiEndpoint.slice(1) : apiEndpoint;

        return `${base}/${endpoint}`;
    }

    private constructHeaders(config: ProxyBodyConfiguration) {
        let headers = {
            Authorization: `Bearer ${config.token}`
        };
        if (config.headers) {
            const { headers: configHeaders } = config;
            headers = { ...headers, ...configHeaders };
        }

        return headers;
    }

    private parseHeaders(req: Request) {
        const headers = req.rawHeaders;
        const HEADER_PROXY = 'nango-proxy-';
        const forwardedHeaders: ForwardedHeaders = {};

        for (let i = 0, n = headers.length; i < n; i += 2) {
            const headerKey = headers[i]?.toLowerCase();

            if (headerKey?.startsWith(HEADER_PROXY)) {
                forwardedHeaders[headerKey.slice(HEADER_PROXY.length)] = headers[i + 1] || '';
            }
        }

        return forwardedHeaders;
    }
}

export default new ProxyController();
