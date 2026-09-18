import { Navigate, Outlet, useSearchParams } from 'react-router-dom';

import { useUser } from '../../hooks/useUser';
import { safeNextPath } from '../../utils/routes';

export const GuestRoute: React.FC = () => {
    const { user, loading } = useUser();
    const [searchParams] = useSearchParams();

    // Rendering the form while the session is still unknown; blocking on it would blank the page for every signed-out visitor.
    if (loading || !user) {
        return <Outlet />;
    }

    // `next` holds the OAuth consent destination, so dropping it strands a signed-in user mid-authorization.
    return <Navigate to={safeNextPath(searchParams.get('next'))} replace />;
};
