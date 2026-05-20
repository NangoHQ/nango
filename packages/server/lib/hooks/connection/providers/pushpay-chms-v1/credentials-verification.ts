import { XMLParser } from 'fast-xml-parser';

import type { InternalNango as Nango } from '../../credentials-verification-script.js';

const XML_ACCEPT = 'application/xml, text/xml;q=0.9, */*;q=0.8';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    let response: { data?: unknown };
    try {
        response = await nango.proxy({
            endpoint: '/api.php?srv=api_status',
            providerConfigKey: provider_config_key,
            headers: {
                Accept: XML_ACCEPT
            }
        });
    } catch {
        throw new Error('Invalid credentials');
    }

    if (!('data' in response)) {
        throw new Error('Invalid credentials');
    }

    const errorMessage = getPushpayChmsV1ApiError(response.data);
    if (errorMessage) {
        throw new Error(errorMessage);
    }
}

/**
 * Pushpay ChMS v1 returns HTTP 2xx with an XML error payload for bad credentials, e.g.:
 * <ccb_api><response><error number="002" ...>Invalid Username or Password.</error></response></ccb_api>
 */
function getPushpayChmsV1ApiError(data: unknown): string | null {
    if (typeof data !== 'string' || !data.includes('<error')) {
        return null;
    }

    try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            parseAttributeValue: true,
            trimValues: true
        });
        const parsed = parser.parse(data) as Record<string, unknown>;
        const response = getCcbResponse(parsed);
        if (!response || typeof response !== 'object') {
            return null;
        }

        const errorNode = (response as Record<string, unknown>)['error'];
        if (errorNode === undefined || errorNode === null) {
            return null;
        }

        return formatErrorNode(errorNode);
    } catch {
        const match = data.match(/<error\b[^>]*>([^<]*)<\/error>/i);
        return match?.[1]?.trim() || 'Invalid Pushpay ChMS API credentials';
    }
}

function getCcbResponse(parsed: Record<string, unknown>): unknown {
    const root = parsed['ccb_api'] ?? parsed;
    if (typeof root !== 'object' || root === null) {
        return undefined;
    }
    return (root as Record<string, unknown>)['response'];
}

function formatErrorNode(error: unknown): string {
    if (typeof error === 'string') {
        return error.trim() || 'Invalid Pushpay ChMS API credentials';
    }

    if (typeof error === 'object' && error !== null) {
        const record = error as Record<string, unknown>;
        for (const key of ['#text', '_text', 'text']) {
            if (typeof record[key] === 'string' && record[key].trim()) {
                return record[key].trim();
            }
        }
    }

    return 'Invalid Pushpay ChMS API credentials';
}
