import Nango from '@nangohq/frontend';

export const nango = new Nango({
    publicKey: import.meta.env.VITE_LOCAL_PUBLIC_KEY,
    host: import.meta.env.VITE_LOCAL_HOSTNAME
});
