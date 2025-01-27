export function redactHeaders({
    headers,
    headersToFilter = [],
    valuesToFilter = []
}: { headers?: Record<string, any> | undefined; headersToFilter?: string[]; valuesToFilter?: string[] } = {}) {
    if (headers === undefined) {
        return {};
    }

    const safeHeaders: Record<string, string> = {};
    for (const key of Object.keys(headers)) {
        safeHeaders[key.toLocaleLowerCase()] = String(headers[key]);
    }

    if (safeHeaders['authorization']) {
        safeHeaders['authorization'] = 'REDACTED';
    }

    for (const key of headersToFilter) {
        if (safeHeaders[key.toLocaleLowerCase()]) {
            safeHeaders[key.toLocaleLowerCase()] = 'REDACTED';
        }
    }

    for (const key of Object.keys(safeHeaders)) {
        for (const value of valuesToFilter) {
            if (safeHeaders[key]?.includes(value)) {
                safeHeaders[key] = 'REDACTED';
            }
        }
    }

    return safeHeaders;
}

export function redactURL({ url, valuesToFilter }: { url: string; valuesToFilter: string[] }) {
    return valuesToFilter.reduce((curr, value) => {
        return curr.replace(value, 'REDACTED');
    }, url);
}
