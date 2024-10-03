import Nango from '@nangohq/frontend';
import { useEffect } from 'react';

import { API_HOSTNAME } from './api';
import { useGlobal } from './store';

export function useNango() {
    const sessionToken = useGlobal((state) => state.sessionToken);
    const setNango = useGlobal((state) => state.setNango);
    const nango = useGlobal((state) => state.nango);

    // Create a singleton
    useEffect(() => {
        if (!sessionToken) {
            return;
        }

        setNango(
            new Nango({
                connectSessionToken: sessionToken,
                host: API_HOSTNAME
            })
        );
    }, [sessionToken]);

    return nango;
}
