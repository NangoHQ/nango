import { Navigate, Outlet, useSearchParams } from 'react-router-dom';

import { useUser } from '../../hooks/useUser';
import { safeNextPath } from '../../utils/routes';

export const GuestRoute: React.FC = () => {
    const { user, loading, error } = useUser();
    const [searchParams] = useSearchParams();

    // Blocking until the session is known would blank the login page for every signed-out visitor.
    // A failed refetch keeps the stale user in the cache. Redirecting on it loops: PrivateRoute sends them right back.
    if (loading || error || !user) {
        return <Outlet />;
    }

    // `next` holds the OAuth consent destination, so dropping it strands a signed-in user mid-authorization.
    return <Navigate to={safeNextPath(searchParams.get('next'))} replace />;
};
