import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import axios, { AxiosError } from 'axios';
import axiosRetry from 'axios-retry';

import logger from '../utils/logger.js';
import errorManager from '../utils/error.manager.js';
import configService from '../services/config.service.js';
import { getAccount } from '../utils/utils.js';
import type { ProxyBodyConfiguration } from '../models.js';
import { NangoError } from '../utils/error.js';

const RETRIES = 10;

axiosRetry(axios, {
    retries: RETRIES,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        const status = error?.response?.status;
        logger.info(`API received a ${status} error, retrying with exponential backoffs for a total of ${RETRIES} times`);
        return error?.response?.status.toString().startsWith('5') || error?.response?.status === 429;
    }
});

class ProxyController {
    public async routeCall(req: Request, res: Response, next: NextFunction) {
        if (req.body === null) {
            errorManager.errRes(res, 'missing_body');
            return;
        }
        const { valid, error } = this.validateBody(req);
        if (!valid) {
            errorManager.errRes(res, String(error));
            return;
        }

        const configBody = { ...req.body };
        const { method } = configBody;

        // TODO store request in the db
        logger.info(`Proxy: received ${method} call with a valid body`);

        const { providerConfigKey } = configBody;
        const accountId = getAccount(res);
        const providerConfig = await configService.getProviderConfig(providerConfigKey, accountId);
        if (!providerConfig) {
            res.status(404).send();
        }
        const template = configService.getTemplate(String(providerConfig?.provider));

        if (!template.base_api_url) {
            errorManager.errRes(res, 'missing_base_api_url');
            return;
        }

        configBody.template = template;

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

    private async get(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            const url = this.constructUrl(config);
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${config.token}`
                }
            });
            res.status(200).send(response.data);
        } catch (error) {
            this.catalogAndReportError(error as Error | AxiosError, url);
            next(error);
        }
    }

    private async post(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            if (!config.data) {
                errorManager.errRes(res, 'missing_post_data');
                return;
            }

            const { data } = config;
            const response = await axios.post(url, data, {
                headers: {
                    Authorization: `Bearer ${config.token}`
                }
            });
            logger.info(`Proxy: POST request to ${url} was successful`);
            res.status(200).send(response.data);
        } catch (error) {
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url);
            next(nangoError);
        }
    }

    private async patch(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            if (!config.data) {
                errorManager.errRes(res, 'missing_post_data');
                return;
            }

            const { data } = config;
            const response = await axios.patch(url, data, {
                headers: {
                    Authorization: `Bearer ${config.token}`
                }
            });
            logger.info(`Proxy: PATCH request to ${url} was successful`);
            res.status(200).send(response.data);

            res.status(200).send();
        } catch (error) {
            next(error);
        }
    }

    private async put(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            if (!config.data) {
                errorManager.errRes(res, 'missing_post_data');
                return;
            }

            const { data } = config;
            const response = await axios.put(url, data, {
                headers: {
                    Authorization: `Bearer ${config.token}`
                }
            });
            logger.info(`Proxy: PUT request to ${url} was successful`);
            res.status(200).send(response.data);
        } catch (error) {
            this.catalogAndReportError(error as Error | AxiosError, url);
            next(error);
        }
    }

    private async delete(res: Response, next: NextFunction, url: string, config: ProxyBodyConfiguration) {
        try {
            await axios.delete(url, {
                headers: {
                    Authorization: `Bearer ${config.token}`
                }
            });
            logger.info(`Proxy: DELETE request to ${url} was successful`);
            res.status(200).send();
        } catch (error) {
            const nangoError = this.catalogAndReportError(error as Error | AxiosError, url);
            next(nangoError);
        }
    }

    private catalogAndReportError(error: Error | AxiosError, url: string) {
        if (axios.isAxiosError(error)) {
            if (error?.response?.status === 404) {
                logger.error(`Response is a 404 to ${url}, make sure you have the endpoint specified and spelled correctly`);
                return new NangoError('unknown_endpoint');
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
