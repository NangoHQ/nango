import Nango from '@nangohq/frontend';
import { useMemo } from 'react';

export function useNango(sessionToken: string | null) {
    const nango = useMemo(() => {
        if (!sessionToken) {
            return;
        }

        // Temp solution, ideally we can launch this without having to rebuild the whole UI
        const hostname = import.meta.env.VITE_API_HOSTNAME || 'http://localhost:3003';
        return new Nango({
            connectSessionToken: sessionToken,
            host: hostname
        });
    }, [sessionToken]);

    return nango;
}
