// Accounts hosts cannot be derived from API suffixes: Canada uses zohocloud.ca.
// https://www.zoho.com/developer/oauth/multi-dc-support.html
const accountsServers: Record<string, string> = {
    com: 'https://accounts.zoho.com',
    eu: 'https://accounts.zoho.eu',
    in: 'https://accounts.zoho.in',
    'com.au': 'https://accounts.zoho.com.au',
    'com.cn': 'https://accounts.zoho.com.cn',
    jp: 'https://accounts.zoho.jp',
    ca: 'https://accounts.zohocloud.ca',
    sa: 'https://accounts.zoho.sa',
    uk: 'https://accounts.zoho.uk'
};

function origin(value: string): string {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('Invalid Zoho datacenter URL');
    }
    return url.origin;
}

/** Resolve existing connections and new callbacks without changing credentials or API routing. */
export function zohoOAuthConfig(config: Record<string, string>): Record<string, string> {
    const callbackServer = config['accounts-server'];
    if (callbackServer) {
        const server = origin(callbackServer);
        if (!Object.values(accountsServers).includes(server)) {
            throw new Error('Invalid Zoho accounts server');
        }
        return { ...config, 'accounts-server': server };
    }

    let extension: string | undefined = config['extension'];
    if (config['api_domain']) {
        const apiOrigin = origin(config['api_domain']);
        extension = Object.keys(accountsServers).find((suffix) => apiOrigin === `https://www.zohoapis.${suffix}` || apiOrigin === `https://api.zoho.${suffix}`);
        if (!extension) {
            throw new Error('Invalid Zoho API datacenter');
        }
    }
    // New connections use Zoho's global authorization entry point; the callback
    // supplies accounts-server before exchanging the authorization code.
    if (!extension) {
        return config;
    }
    const server = Object.hasOwn(accountsServers, extension) ? accountsServers[extension] : undefined;
    if (!server) {
        throw new Error('Invalid Zoho datacenter extension');
    }
    return { ...config, 'accounts-server': server };
}
