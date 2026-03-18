import { Navigate, Outlet } from 'react-router-dom';

import { usePermissions } from '../hooks/usePermissions';
import { useUser } from '../hooks/useUser';
import { useStore } from '../store';

export const PermissionRoute: React.FC<{ action: string; scope: string; resource: string }> = ({ action, scope, resource }) => {
    const { can } = usePermissions();
    const { loading } = useUser();
    const env = useStore((state) => state.env);

    if (loading) return null;
    if (!can(action as any, scope as any, resource)) return <Navigate to={`/${env}`} replace />;
    return <Outlet />;
};
