import { PostHog } from 'posthog-node';
import { v4 as uuidv4 } from 'uuid';

class Analytics {
    client: PostHog | undefined;
    distinctId: string;

    constructor() {
        this.distinctId = uuidv4();

        if (process.env['TELEMETRY']?.toLowerCase() === 'true' && process.env['SERVER_RUN_MODE'] === 'DOCKERIZED') {
            this.client = new PostHog('phc_4S2pWFTyPYT1i7zwC8YYQqABvGgSAzNHubUkdEFvcTl', { host: 'https://app.posthog.com', flushAt: 1, flushInterval: 0 });
            this.client.enable();
        }
    }

    public track(name: string, properties?: Record<string | number, any>) {
        if (this.client == null) {
            return;
        }

        this.client.capture({
            event: name,
            distinctId: `${this.distinctId}`,
            properties: properties || {}
        });
    }

    public urlToRootHost(url: string | undefined): string {
        if (url == null) {
            return '';
        }

        try {
            const reg = new RegExp('[^.]+(.[^.]{2,4})?.[^.]{2,4}$');
            const matchArr = new URL(url).hostname.match(reg);
            return matchArr != null && matchArr.length > 0 && matchArr[0] != null ? matchArr[0] : '';
        } catch {
            return '';
        }
    }
}

export default new Analytics();
