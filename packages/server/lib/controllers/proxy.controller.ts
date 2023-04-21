import type { Request, Response } from 'express';
import type { OutgoingHttpHeaders } from 'http';
import type { NextFunction } from 'express';
import axios, { AxiosError, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';

import logger from '../utils/logger.js';
import errorManager from '../utils/error.manager.js';
import configService from '../services/config.service.js';
import { getAccount } from '../utils/utils.js';
import type { ProxyBodyConfiguration, Connection, HTTP_VERB } from '../models.js';
import { NangoError } from '../utils/error.js';
import { getConnectionCredentials } from '../utils/connection.js';

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
    public async routeSDKCall(req: Request, res: Response, next: NextFunction) {
        if (req.body === null) {
            errorManager.errRes(res, 'missing_body');
            logger.error(`Proxy: a POST body with the needed configuration is missing.`);
            return;
        }
        const { valid, error } = this.validateBody(req);
        if (!valid) {
            errorManager.errRes(res, String(error));
            return;
        }

        const configBody = { ...req.body };
        const { method } = configBody;

        logger.info(`Proxy: received ${method} call with a valid body`);

        const { providerConfigKey } = configBody;
        const accountId = getAccount(res);
        const providerConfig = await configService.getProviderConfig(providerConfigKey, accountId);
        if (!providerConfig) {
            logger.error(`Proxy: provider configuration not found`);
            res.status(404).send();
        }
        const template = configService.getTemplate(String(providerConfig?.provider));

        if (!template.base_api_url) {
            logger.error(`Proxy: base api url configuration is missing. The providers.yaml might be missing a value`);
            errorManager.errRes(res, 'missing_base_api_url');
            return;
        }

        configBody.template = template;

        return this.sendToHttpMethod(res, next, method, configBody);
    }

    public async routeHTTPCall(req: Request, res: Response, next: NextFunction) {
        // TODO add support for custom headers
        try {
            const connection = await getConnectionCredentials(req, res);

            const { method } = req;

            const endpoint = req.query['endpoint'] as string;

            if (endpoint === null) {
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

            logger.info(`Proxy: token retrieved successfully`);

            const { account_id: accountId, provider_config_key: providerConfigKey, connection_id: connectionId } = connection as Connection;
            const providerConfig = await configService.getProviderConfig(providerConfigKey, accountId);

            if (!providerConfig) {
                logger.error(`Proxy: provider configuration not found`);
                res.status(404).send();
            }
            const template = configService.getTemplate(String(providerConfig?.provider));

            if (!template.base_api_url) {
                logger.error(`Proxy: base api url configuration is missing. The providers.yaml might be missing a value`);
                errorManager.errRes(res, 'missing_base_api_url');
                return;
            }

            logger.info(`Proxy: API call configuration constructed successfully`);

            const configBody: ProxyBodyConfiguration = {
                endpoint,
                method: method as HTTP_VERB,
                template,
                // handle oauth1
                token: String(token),
                providerConfigKey,
                connectionId,
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
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url);
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
            if (!config.data) {
                errorManager.errRes(res, 'missing_post_data');
                return;
            }

            const { data } = config;
            const headers = this.constructHeaders(config);
            const responseStream = await axios({
                method: 'post',
                url,
                data,
                responseType: 'stream',
                headers
            });
            logger.info(`Proxy: POST request to ${url} was successful`);
            res.writeHead(responseStream?.status, responseStream.headers as OutgoingHttpHeaders);
            responseStream.data.pipe(res);
        } catch (error) {
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url);
            next(nangoError);
        }
    }

    private async patch(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            if (!config.data) {
                errorManager.errRes(res, 'missing_patch_data');
                return;
            }

            const { data } = config;
            const headers = this.constructHeaders(config);
            const responseStream = await axios({
                method: 'patch',
                url,
                data,
                responseType: 'stream',
                headers
            });
            logger.info(`Proxy: PATCH request to ${url} was successful`);
            res.writeHead(responseStream?.status, responseStream.headers as OutgoingHttpHeaders);
            responseStream.data.pipe(res);
        } catch (error) {
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url);
            next(nangoError);
        }
    }

    private async put(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            if (!config.data) {
                errorManager.errRes(res, 'missing_put_data');
                return;
            }

            const { data } = config;
            const headers = this.constructHeaders(config);
            const responseStream = await axios({
                method: 'put',
                url,
                data,
                responseType: 'stream',
                headers
            });
            logger.info(`Proxy: PUT request to ${url} was successful`);
            res.writeHead(responseStream?.status, responseStream.headers as OutgoingHttpHeaders);
            responseStream.data.pipe(res);
        } catch (error) {
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url);
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
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url);
            next(nangoError);
        }
    }

    private catalogAndReportError(error: Error | AxiosError, url: string) {
        if (axios.isAxiosError(error)) {
            if (error?.response?.status === 404) {
                logger.error(`Response is a 404 to ${url}, make sure you have the endpoint specified and spelled correctly.`);
                return new NangoError('unknown_endpoint');
            }
            if (error?.response?.status === 403) {
                logger.error(`Response is a 403 to ${url}, make sure you have the proper scopes configured.`);
                return new NangoError('fobidden');
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

    private validateBody(req: Request): { valid: boolean; error?: string } {
        const { body } = req;

        if (!body.token) {
            return { valid: false, error: 'missing_token' };
        }

        if (!body.endpoint) {
            return { valid: false, error: 'missing_endpoint' };
        }

        if (!body.method) {
            return { valid: false, error: 'missing_method' };
        }

        return { valid: true };
    }
}

export default new ProxyController();
