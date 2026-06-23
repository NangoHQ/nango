export type OutboundUrlErrorCode =
    | 'invalid_url'
    | 'invalid_scheme'
    | 'denied_hostname'
    | 'denied_ip'
    | 'denied_dns'
    | 'allowlist_miss'
    | 'dns_resolution_failed'
    | 'redirect_denied';

export class OutboundUrlError extends Error {
    code: OutboundUrlErrorCode;
    url: string;
    hostname?: string;

    constructor(code: OutboundUrlErrorCode, message: string, options?: { url?: string; hostname?: string; cause?: unknown }) {
        super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = 'OutboundUrlError';
        this.code = code;
        this.url = options?.url ?? '';
        if (options?.hostname !== undefined) {
            this.hostname = options.hostname;
        }
    }
}
