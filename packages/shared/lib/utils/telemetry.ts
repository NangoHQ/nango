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
    ACTION_SUCCESS = 'action_success',
    ACTION_FAILURE = 'action_failure',
    SYNC_OVERLAP = 'sync_overlap',
    SYNC_FAILURE = 'sync_failure',
    SYNC_SUCCESS = 'sync_success',
    SYNC_SCRIPT_RETURN_USED = 'sync_script_return_used',
    GET_CONNECTION_FAILURE = 'get_connection_failure',
    GET_CONNECTION_SUCCESS = 'get_connection_success',
    SYNC_DEPLOY_SUCCESS = 'sync_deploy_success',
    SYNC_DEPLOY_FAILURE = 'sync_deploy_failure',
    SYNC_GET_RECORDS_OFFSET_USED = 'sync_get_records_offset_used',
    SYNC_GET_RECORDS_SORT_BY_USED = 'sync_get_records_sort_by_used',
    SYNC_GET_RECORDS_ORDER_USED = 'sync_get_records_order_used',
    SYNC_GET_RECORDS_INCLUDE_METADATA_USED = 'sync_get_records_include_metadata_used',
    SYNC_GET_RECORDS_DEPRECATED_METHOD_USED = 'sync_get_records_deprecated_method_used',
    FLOW_JOB_TIMEOUT_FAILURE = 'flow_job_failure',
    POST_CONNECTION_SUCCESS = 'post_connection_success',
    POST_CONNECTION_FAILURE = 'post_connection_failure',
    ON_EVENT_SCRIPT_SUCCESS = 'on_event_script_success',
    ON_EVENT_SCRIPT_FAILURE = 'on_event_script_failure',
    INCOMING_WEBHOOK_RECEIVED = 'incoming_webhook_received',
    INCOMING_WEBHOOK_ISSUE_WRONG_CONNECTION_IDENTIFIER = 'incoming_webhook_issue_wrong_connection_identifier',
    INCOMING_WEBHOOK_ISSUE_CONNECTION_NOT_FOUND = 'incoming_webhook_issue_connection_not_found',
    INCOMING_WEBHOOK_PROCESSED_SUCCESSFULLY = 'incoming_webhook_processed_successfully',
    INCOMING_WEBHOOK_FAILED_PROCESSING = 'incoming_webhook_failed_processing'
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
