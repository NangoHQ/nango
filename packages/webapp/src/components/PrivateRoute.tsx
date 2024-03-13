import { Outlet, Navigate } from 'react-router-dom';
import { isCloud, isEnterprise } from '../utils/utils';
import { useMeta } from '../hooks/useMeta';
import { useEffect } from 'react';
import { useStore } from '../store';

const PrivateRoute: React.FC = () => {
    const { meta, error, loading } = useMeta();

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

    if (loading) {
        return null;
    }

    if (error) {
        return <Navigate to="/signin" replace />;
    }

    if (!isCloud() && !isEnterprise()) {
        return <Outlet />;
    }

    return <Navigate to="/signin" replace />;
};

export default PrivateRoute;
