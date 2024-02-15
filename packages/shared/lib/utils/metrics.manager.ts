import { v2, client } from '@datadog/datadog-api-client';
import { isCloud } from './utils.js';

export enum MetricTypes {
    AUTH_TOKEN_REFRESH_START = 'auth_token_refresh_start',
    AUTH_TOKEN_REFRESH_SUCCESS = 'auth_token_refresh_success',
    AUTH_TOKEN_REFRESH_FAILURE = 'auth_token_refresh_failure',
    AUTH_TOKEN_REQUEST_START = 'auth_token_request_start',
    AUTH_TOKEN_REQUEST_CALLBACK_RECEIVED = 'auth_token_request_callback_received',
    AUTH_TOKEN_REQUEST_SUCCESS = 'auth_token_request_success',
    AUTH_TOKEN_REQUEST_FAILURE = 'auth_token_request_failure',
    ACTION_SUCCESS = 'action_success',
    ACTION_FAILURE = 'action_failure',
    ACTION_TRACK_RUNTIME = 'action_track_runtime',
    SYNC_OVERLAP = 'sync_overlap',
    SYNC_FAILURE = 'sync_failure',
    SYNC_SUCCESS = 'sync_success',
    SYNC_SCRIPT_RETURN_USED = 'sync_script_return_used',
    GET_CONNECTION_FAILURE = 'get_connection_failure',
    GET_CONNECTION_SUCCESS = 'get_connection_success',
    SYNC_DEPLOY_SUCCESS = 'sync_deploy_success',
    SYNC_DEPLOY_FAILURE = 'sync_deploy_failure',
    SYNC_TRACK_RUNTIME = 'sync_script_track_runtime',
    SYNC_GET_RECORDS_OFFSET_USED = 'sync_get_records_offset_used',
    SYNC_GET_RECORDS_SORT_BY_USED = 'sync_get_records_sort_by_used',
    SYNC_GET_RECORDS_ORDER_USED = 'sync_get_records_order_used',
    SYNC_GET_RECORDS_INCLUDE_METADATA_USED = 'sync_get_records_include_metadata_used',
    SYNC_GET_RECORDS_DEPRECATED_METHOD_USED = 'sync_get_records_deprecated_method_used',
    SYNC_GET_RECORDS_QUERY_TIMEOUT = 'sync_get_records_query_timeout',
    FLOW_JOB_TIMEOUT_FAILURE = 'flow_job_failure',
    POST_CONNECTION_SCRIPT_FAILURE = 'post_connection_script_failure',
    WEBHOOK_TRACK_RUNTIME = 'webhook_track_runtime',
    INCOMING_WEBHOOK_RECEIVED = 'incoming_webhook_received',
    INCOMING_WEBHOOK_ISSUE_WRONG_CONNECTION_IDENTIFIER = 'incoming_webhook_issue_wrong_connection_identifier',
    INCOMING_WEBHOOK_ISSUE_CONNECTION_NOT_FOUND = 'incoming_webhook_issue_connection_not_found',
    INCOMING_WEBHOOK_ISSUE_WEBHOOK_SUBSCRIPTION_NOT_FOUND_REGISTERED = 'incoming_webhook_issue_webhook_subscription_not_found_registered',
    INCOMING_WEBHOOK_PROCESSED_SUCCESSFULLY = 'incoming_webhook_processed_successfully',
    INCOMING_WEBHOOK_FAILED_PROCESSING = 'incoming_webhook_failed_processing'
}

export enum SpanTypes {
    CONNECTION_TEST = 'nango.server.hooks.connectionTest',
    JOBS_CLEAN_ACTIVITY_LOGS = 'nango.jobs.cron.cleanActivityLogs',
    JOBS_IDLE_DEMO = 'nango.jobs.cron.idleDemos'
}

class MetricsManager {
    private logInstance: v2.LogsApi | undefined;
    private metricsInstance: v2.MetricsApi | undefined;
    constructor() {
        try {
            if (isCloud() && process.env['DD_API_KEY'] && process.env['DD_APP_KEY']) {
                const configuration = client.createConfiguration();
                configuration.setServerVariables({
                    site: 'us3.datadoghq.com'
                });
                this.logInstance = new v2.LogsApi(configuration);
                this.metricsInstance = new v2.MetricsApi(configuration);
            }
        } catch (_) {
            return;
        }
    }

    public async capture(eventId: string, message: string, operation: string, context: Record<string, string> = {}, additionalTags = '') {
        const params: v2.LogsApiSubmitLogRequest = {
            body: [
                {
                    ddsource: 'web',
                    ddtags: `${eventId}, environment:${process.env['NODE_ENV']}, ${additionalTags}`,
                    message,
                    service: operation,
                    additionalProperties: context
                }
            ]
        };

        await this.logInstance?.submitLog(params);
    }

    public async captureMetric(metricName: string, metricId: string, metricCategory: string, value: number) {
        const currentTime = Math.floor(Date.now() / 1000);
        const params: v2.MetricsApiSubmitMetricsRequest = {
            body: {
                series: [
                    {
                        metric: metricName,
                        points: [
                            {
                                timestamp: currentTime,
                                value
                            }
                        ],
                        unit: 'seconds',
                        resources: [
                            {
                                name: metricId,
                                type: metricCategory
                            }
                        ],
                        type: 3
                    }
                ]
            }
        };

        await this.metricsInstance?.submitMetrics(params);
    }
}

export default new MetricsManager();
