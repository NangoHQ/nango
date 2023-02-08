import { PostHog } from 'posthog-node';
import { v4 as uuidv4 } from 'uuid';
import { getBaseUrl } from '../utils/utils.js';

class Analytics {
    client: PostHog | undefined;
    distinctId: string;

    constructor() {
        this.distinctId = uuidv4();

        // Do not log if opted out.
        if (process.env['TELEMETRY']?.toLowerCase() !== 'false') {
            this.client = new PostHog('phc_4S2pWFTyPYT1i7zwC8YYQqABvGgSAzNHubUkdEFvcTl');
            this.client.enable();
        }
    }

    public track(name: string, accountId: number | null, properties?: Record<string | number, any>) {
        if (this.client == null) {
            return;
        }

        let baseUrl = getBaseUrl();
        properties = properties || {};
        properties['host'] = baseUrl;
        properties['account'] = accountId == null ? 'self-hosted' : accountId.toString();

        this.client.capture({
            event: name,
            distinctId: accountId == null ? 'self-hosted' : accountId.toString(),
            properties: properties
        });
    }
}

export default new Analytics();
