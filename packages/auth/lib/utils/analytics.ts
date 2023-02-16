import { PostHog } from 'posthog-node';
import { v4 as uuidv4 } from 'uuid';
import { getBaseUrl, localhostUrl } from '../utils/utils.js';
import ip from 'ip';

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

        var userId: string;
        if (baseUrl === localhostUrl) {
            // Localhost user.
            userId = ip.address() || 'localhost';
        } else if (!accountId || accountId === 0) {
            // Self-hosted user.
            userId = baseUrl;
        } else {
            // Cloud user.
            userId = accountId.toString();
        }

        properties['account'] = userId;

        this.client.capture({
            event: name,
            distinctId: userId,
            properties: properties
        });
    }
}

export default new Analytics();
