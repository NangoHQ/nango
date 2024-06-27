import * as crypto from 'node:crypto';

export const SIGNATURE_METHOD = 'HMAC-SHA256';

function collectParameters(allParams: Record<string, string>): string {
    const encodedParams: [string, string][] = [];

    for (const [key, value] of Object.entries(allParams)) {
        encodedParams.push([percentEncode(key), percentEncode(value)]);
    }

    encodedParams.sort((a, b) => {
        if (a[0] === b[0]) {
            return a[1] < b[1] ? -1 : 1;
        }
        return a[0] < b[0] ? -1 : 1;
    });

    return encodedParams.map((pair) => pair.join('=')).join('&');
}

export function percentEncode(str: string) {
    return encodeURIComponent(str)
        .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
        .replace(/%20/g, '%20');
}

export function getTbaMetaParams() {
    const nonce = crypto.randomBytes(24).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);

    return {
        nonce,
        timestamp: timestamp.toString()
    };
}

export function generateSignature({ baseString, clientSecret, tokenSecret }: { baseString: string; clientSecret: string; tokenSecret: string }): string {
    return crypto
        .createHmac('sha256', `${percentEncode(clientSecret)}&${percentEncode(tokenSecret)}`)
        .update(baseString)
        .digest('base64');
}

export function generateBaseString({ method, url, params }: { method: string; url: string; params: Record<string, string> }): string {
    const concatenatedParams = collectParameters(params);

    return `${method}&${percentEncode(url)}&${percentEncode(concatenatedParams)}`;
}
