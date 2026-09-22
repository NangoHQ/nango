import { Navigate, Outlet, useSearchParams } from 'react-router-dom';

import { useUser } from '../../hooks/useUser';
import { safeNextPath } from '../../utils/routes';

export const SignedOutRoute: React.FC = () => {
    const { user, loading, error } = useUser();
    const [searchParams] = useSearchParams();

    // Rendering the form here would flash it at a visitor who is about to be redirected.
    if (loading) {
        return null;
    }

    // A failed refetch keeps the stale user in the cache. Redirecting on it loops: PrivateRoute sends them right back.
    if (error || !user) {
        return <Outlet />;
    }

    // `next` holds the OAuth consent destination, so dropping it strands a signed-in user mid-authorization.
    return <Navigate to={safeNextPath(searchParams.get('next'))} replace />;
};
