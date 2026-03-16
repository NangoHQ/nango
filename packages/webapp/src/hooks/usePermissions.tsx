import { useUser } from './useUser';

export function usePermissions() {
    const { user } = useUser();
    return user?.permissions ?? {};
}
