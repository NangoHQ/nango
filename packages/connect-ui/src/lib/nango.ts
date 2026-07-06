import { useEffect } from 'react';

import Nango from '@nangohq/frontend';

import { useGlobal } from './store';

export function useNango() {
    const sessionToken = useGlobal((state) => state.sessionToken);
    const setNango = useGlobal((state) => state.setNango);
    const nango = useGlobal((state) => state.nango);
    const apiURL = useGlobal((state) => state.apiURL);

    // Create a singleton
    useEffect(() => {
        if (!sessionToken) {
            return;
        }

        setNango(
            new Nango({
                connectSessionToken: sessionToken,
                host: apiURL,
                // `Nango` resolves `websocketsPath` as an absolute path from the origin, which would
                // silently drop any base path configured in `apiURL` (e.g. a self-hosted reverse-proxy
                // prefix). Deriving it from apiURL's own path here keeps that prefix intact.
                websocketsPath: `${new URL(apiURL).pathname.replace(/\/+$/, '')}/`
            })
        );
    }, [sessionToken]);

    return nango;
}
