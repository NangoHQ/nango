import { Navigate, Outlet, useSearchParams } from 'react-router-dom';

import { useUser } from '../../hooks/useUser';
import storage, { LocalStorageKeys } from '../../utils/local-storage';
import { safeNextPath } from '../../utils/routes';

export const SignedOutRoute: React.FC = () => {
    const { user, loading, error } = useUser();
    const [searchParams] = useSearchParams();

    if (loading) {
        // Only picks what to paint while the query is in flight. Move this into the checks below and localStorage becomes the auth decision.
        return storage.getItem(LocalStorageKeys.UserId) ? null : <Outlet />;
    }

    // A failed refetch keeps the stale user in the cache. Redirecting on it loops: PrivateRoute sends them right back.
    if (error || !user) {
        return <Outlet />;
    }

    // `next` holds the OAuth consent destination, so dropping it strands a signed-in user mid-authorization.
    return <Navigate to={safeNextPath(searchParams.get('next'))} replace />;
};
