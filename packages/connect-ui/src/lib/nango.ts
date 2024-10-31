import Nango from '@nangohq/frontend';
import { useEffect } from 'react';

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
                host: apiURL
            })
        );
    }, [sessionToken]);

    return nango;
}
