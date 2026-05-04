import { Navigate, Outlet } from 'react-router-dom';

import { usePermissions } from '../hooks/usePermissions';
import { useUser } from '../hooks/useUser';
import { useStore } from '../store';

import type { Permission } from '@nangohq/types';

export const PermissionRoute: React.FC<Permission> = (permission) => {
    const { can } = usePermissions();
    const { loading } = useUser();
    const env = useStore((state) => state.env);

    if (loading) return null;
    if (!can(permission)) return <Navigate to={`/${env}`} replace />;
    return <Outlet />;
};
