import { v2, client } from '@datadog/datadog-api-client';
import { isCloud } from './utils.js';

class MetricsManager {
    private logInstance: v2.LogsApi | undefined;
    constructor() {
        try {
            if (isCloud() && process.env['DD_API_KEY'] && process.env['DD_APP_KEY']) {
                const configuration = client.createConfiguration();
                configuration.setServerVariables({
                    site: 'us3.datadoghq.com'
                });
                this.logInstance = new v2.LogsApi(configuration);
            }
        } catch (_) {
            return;
        }
    }

    public async capture(eventId: string, message: string, operation: string, context: Record<string, string> = {}) {
        const params: v2.LogsApiSubmitLogRequest = {
            body: [
                {
                    ddsource: 'web',
                    ddtags: `${eventId}, environment:${process.env['NODE_ENV']}`,
                    message,
                    service: operation,
                    additionalProperties: context
                }
            ]
        };

        await this.logInstance?.submitLog(params);
    }
}

export default new MetricsManager();
