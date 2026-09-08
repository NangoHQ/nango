const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function assertSafeClickhouseUrl(url: string, allowRemote: boolean): void {
    let hostname: string;
    try {
        hostname = new URL(url).hostname;
    } catch {
        throw new Error('CLICKHOUSE_URL must be a valid URL');
    }

    if (!LOCAL_HOSTS.has(hostname) && !allowRemote) {
        throw new Error(
            `Refusing to run against non-local ClickHouse host "${hostname}". Pass --allow-remote after confirming the target database and date range.`
        );
    }
}
