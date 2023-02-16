import { PostHog } from 'posthog-node';
import { v4 as uuidv4 } from 'uuid';
import { getBaseUrl, getNangoVersion, localhostUrl } from '../utils/utils.js';
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
        var userType: string;

        if (baseUrl === localhostUrl) {
            userType = 'localhost';
            userId = `${userType}-${ip.address()}`;
        } else if (!accountId || accountId === 0) {
            userType = 'self-hosted';
            userId = `${userType}-${baseUrl}`;
        } else {
            userType = 'cloud';
            userId = `${userType}-${accountId.toString()}`;
        }

        let userProperties = {} as Record<string | number, any>;
        userProperties['user-type'] = userType;
        userProperties['account'] = userType;
        properties['user-type'] = userType;
        properties['user-account'] = userId;

        properties['nango-version'] = getNangoVersion();

        // Add the user properties
        properties['$set'] = userProperties;

        this.client.capture({
            event: name,
            distinctId: userId,
            properties: properties
        });
    }
}

export default new Analytics();
