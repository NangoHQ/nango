import type { ConnectUIProps } from '@nangohq/frontend';

export function createConnectUIPreviewIFrame({ baseURL, apiURL, sessionToken, lang }: ConnectUIProps) {
    if (!sessionToken) {
        throw new Error('sessionToken is required to create a preview iframe');
    }

    const url = new URL(baseURL || 'https://connect.nango.dev');

    url.searchParams.set('preview', 'true');
    url.searchParams.set('embedded', 'true');

    if (apiURL) {
        url.searchParams.set('apiURL', apiURL);
    }

    if (lang) {
        url.searchParams.set('lang', lang);
    }

    if (sessionToken) {
        url.searchParams.set('session_token', sessionToken);
    }

    const iframe = document.createElement('iframe');
    iframe.src = url.href;
    iframe.style.width = '100%';
    iframe.style.height = '100%';

    return iframe;
}
