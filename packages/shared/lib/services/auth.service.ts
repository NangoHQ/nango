import type { Request, Response, NextFunction } from 'express';
import type { Template as ProviderTemplate, Config as ProviderConfig } from '../models/Provider.js';

interface AuthConfig {
    config: ProviderConfig;
    template: ProviderTemplate;
    environmentId: number;
    activityLogId: number;
}

export default class AuthService {
    config: ProviderConfig;
    template: ProviderTemplate;
    environmentId: number;
    activityLogId: number;

    constructor(config: AuthConfig) {
        this.config = config.config;
        this.template = config.template;
        this.environmentId = config.environmentId;
        this.activityLogId = config.activityLogId;
    }

    async basicAuth(res: Response, req: Request, next: NextFunction) {
        console.log(res, req, next);
        next();
    }

    async apiKeyAuth(res: Response, req: Request, next: NextFunction) {
        console.log(res, req, next);
        next();
    }
}
