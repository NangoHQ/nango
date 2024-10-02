import Nango from '@nangohq/frontend';
import { useEffect, useRef } from 'react';

export function useNango(sessionToken: string | null) {
    const ref = useRef<Nango>();
    useEffect(() => {
        if (!sessionToken) {
            return;
        }

        ref.current = new Nango({
            publicKey: sessionToken,
            host: import.meta.env.VITE_LOCAL_HOSTNAME
        });
    }, [sessionToken]);

    return ref.current;
}
