export const webappLocalhostUrl: string = 'http://localhost:3000';

export function getBaseUrl() {
    var url = process.env['NANGO_SERVER_URL'] || webappLocalhostUrl;

    if (url.slice(-1) === '/') {
        url = url.slice(0, -1);
    }

    return url;
}
