import { Navigate, Outlet } from 'react-router-dom';

import { usePermissions } from '../hooks/usePermissions';
import { useUser } from '../hooks/useUser';
import { useStore } from '../store';

export const PermissionRoute: React.FC<{ can: string }> = ({ can }) => {
    const permissions = usePermissions();
    const { loading } = useUser();
    const env = useStore((state) => state.env);

    if (loading) return null;
    if (!permissions[can]) return <Navigate to={`/${env}`} replace />;
    return <Outlet />;
};
