import { useEffect } from 'react';

import Nango from '@nangohq/frontend';

import { useGlobal } from './store';

/**
 * `Nango` resolves `websocketsPath` as an absolute path from the origin, which would silently
 * drop any base path configured in `apiURL` (e.g. a self-hosted reverse-proxy prefix). Compose
 * apiURL's own path with the server's websockets path (NANGO_SERVER_WEBSOCKETS_PATH, `/` when
 * unset) so both the proxy prefix and a custom server path are honored.
 */
export function buildWebsocketsPath(apiURL: string, serverWebsocketsPath?: string): string {
    const basePath = new URL(apiURL).pathname.replace(/\/+$/, '');
    const wsPath = serverWebsocketsPath || '/';
    return `${basePath}${wsPath.startsWith('/') ? wsPath : `/${wsPath}`}`;
}

export function useNango() {
    const sessionToken = useGlobal((state) => state.sessionToken);
    const setNango = useGlobal((state) => state.setNango);
    const nango = useGlobal((state) => state.nango);
    const apiURL = useGlobal((state) => state.apiURL);
    const serverWebsocketsPath = useGlobal((state) => state.session?.websocketsPath);

    // Create a singleton
    useEffect(() => {
        if (!sessionToken) {
            return;
        }

        setNango(
            new Nango({
                connectSessionToken: sessionToken,
                host: apiURL,
                websocketsPath: buildWebsocketsPath(apiURL, serverWebsocketsPath)
            })
        );
    }, [sessionToken, apiURL, serverWebsocketsPath, setNango]);

    return nango;
}
