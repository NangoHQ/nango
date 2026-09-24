import { Navigate, Outlet, useSearchParams } from 'react-router-dom';

import { useUser } from '../../hooks/useUser';
import { safeNextPath } from '../../utils/routes';

export const SignedOutRoute: React.FC = () => {
    const { user, loading, error } = useUser();
    const [searchParams] = useSearchParams();

    // Avoid briefly rendering the signed-out only routes while the user is being fetched
    if (loading) {
        return null;
    }

    if (!user || error) {
        return <Outlet />;
    }

    // `next` holds the OAuth consent destination, so dropping it strands a signed-in user mid-authorization.
    return <Navigate to={safeNextPath(searchParams.get('next'))} replace />;
};
