import type { ConnectUIProps } from '@nangohq/frontend';

export function createConnectUIPreviewIFrame({ baseURL, apiURL, sessionToken, lang }: ConnectUIProps) {
    const url = new URL(baseURL || 'https://connect.nango.dev');
    // Connect UI's built assets use relative paths: they only resolve when the document path ends
    // with '/'. Inlined rather than shared with @nangohq/utils' connectUrlAsDocumentBase — utils is
    // not browser-safe (it reads process.env on import) and is not a webapp dependency.
    if (!url.pathname.endsWith('/')) {
        url.pathname += '/';
    }

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
