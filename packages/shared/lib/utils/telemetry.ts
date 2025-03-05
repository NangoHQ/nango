import { v2, client } from '@datadog/datadog-api-client';
import { isCloud, isEnterprise } from '@nangohq/utils';

export enum LogTypes {
    AUTH_TOKEN_REFRESH_START = 'auth_token_refresh_start',
    AUTH_TOKEN_REFRESH_SUCCESS = 'auth_token_refresh_success',
    AUTH_TOKEN_REFRESH_FAILURE = 'auth_token_refresh_failure',
    AUTH_TOKEN_REQUEST_START = 'auth_token_request_start',
    AUTH_TOKEN_REQUEST_CALLBACK_RECEIVED = 'auth_token_request_callback_received',
    AUTH_TOKEN_REQUEST_SUCCESS = 'auth_token_request_success',
    AUTH_TOKEN_REQUEST_FAILURE = 'auth_token_request_failure',
    SYNC_FAILURE = 'sync_failure',
    SYNC_SUCCESS = 'sync_success',
    POST_CONNECTION_FAILURE = 'post_connection_failure'
}

export enum SpanTypes {
    CONNECTION_TEST = 'nango.server.hooks.connectionTest',
    RUNNER_EXEC = 'nango.runner.exec'
}

class Telemetry {
    private logInstance: v2.LogsApi | undefined;
    constructor() {
        try {
            if ((isCloud || isEnterprise) && process.env['DD_API_KEY'] && process.env['DD_APP_KEY'] && process.env['DD_SITE']) {
                const configuration = client.createConfiguration();
                configuration.setServerVariables({
                    site: process.env['DD_SITE']
                });
                this.logInstance = new v2.LogsApi(configuration);
            }
        } catch (_) {
            return;
        }
    }

    public async log(
        eventId: LogTypes,
        message: string,
        operation: string,
        context: Record<string, string> & { level?: 'info' | 'error' | 'warn'; environmentId: string },
        additionalTags = ''
    ) {
        const additionalProperties = {
            ...context,
            level: context.level || 'info'
        };

        const params: v2.LogsApiSubmitLogRequest = {
            body: [
                {
                    ddsource: 'web',
                    ddtags: `${eventId}, environment:${process.env['NODE_ENV']}, ${additionalTags}`,
                    message,
                    service: operation,
                    additionalProperties
                }
            ]
        };

        await this.logInstance?.submitLog(params);
    }
}

export default new Telemetry();
