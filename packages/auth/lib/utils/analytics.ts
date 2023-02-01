import { PostHog } from 'posthog-node';
import { v4 as uuidv4 } from 'uuid';
import { getBaseUrl } from '../utils/utils.js';
import crypto from 'crypto';

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

    public track(name: string, properties?: Record<string | number, any>) {
        if (this.client == null) {
            return;
        }

        let baseUrl = getBaseUrl();
        properties = properties || {};
        properties['host'] = baseUrl;

        this.client.capture({
            event: name,
            distinctId: baseUrl,
            properties: properties
        });
    }

    public hash(str: string) {
        return crypto.createHash('md5').update(str).digest('hex');
    }
}

export default new Analytics();
