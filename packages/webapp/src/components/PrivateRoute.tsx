import { Outlet, Navigate } from 'react-router-dom';
import { useMeta } from '../hooks/useMeta';
import { useEffect } from 'react';
import { useStore } from '../store';
import { useAnalyticsIdentify } from '../utils/analytics';
import { useUser } from '../hooks/useUser';

const PrivateRoute: React.FC = () => {
    const { meta, error, loading } = useMeta();
    const { user } = useUser();
    const identify = useAnalyticsIdentify();

    const setStoredEnvs = useStore((state) => state.setEnvs);
    const setBaseUrl = useStore((state) => state.setBaseUrl);
    const setEmail = useStore((state) => state.setEmail);
    const setDebugMode = useStore((state) => state.setDebugMode);

    useEffect(() => {
        if (!meta || error) {
            return;
        }

        setStoredEnvs(meta.environments);
        setBaseUrl(meta.baseUrl);
        setEmail(meta.email);
        setDebugMode(meta.debugMode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meta, error]);

    useEffect(() => {
        if (user) {
            identify(user);
        }
    }, [user, identify]);

    if (loading) {
        return null;
    }

    if (error) {
        return <Navigate to="/signin" replace />;
    }

    return <Outlet />;
};

export default PrivateRoute;
