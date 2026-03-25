import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useEnvironment } from '../hooks/useEnvironment';
import { useMeta } from '../hooks/useMeta';
import { permissions, usePermissions } from '../hooks/usePermissions';
import { useUser } from '../hooks/useUser';
import PageEnvironmentUnauthorized from '../pages/PageEnvironmentUnauthorized';
import PageNotFound from '../pages/PageNotFound';
import { useStore } from '../store';
import { useAnalyticsIdentify } from '../utils/analytics';

export const PrivateRoute: React.FC = () => {
    const { user, loading: loadingUser, error: userError } = useUser();
    const { data, error: metaError, isLoading: loadingMeta } = useMeta(!!user);
    const meta = data?.data;
    const [notFoundEnv, setNotFoundEnv] = useState(false);
    const [unauthorizedEnv, setUnauthorizedEnv] = useState(false);
    const [ready, setReady] = useState(false);
    const identify = useAnalyticsIdentify();
    const { can } = usePermissions();
    const location = useLocation();

    const env = useStore((state) => state.env);
    const setStoredEnvs = useStore((state) => state.setEnvs);
    const setBaseUrl = useStore((state) => state.setBaseUrl);
    const setDebugMode = useStore((state) => state.setDebugMode);
    const setEnv = useStore((state) => state.setEnv);
    const { data: environmentData } = useEnvironment(env);
    const environmentAndAccount = environmentData?.environmentAndAccount;

    useEffect(() => {
        if (!meta || metaError) {
            return;
        }

        setStoredEnvs(meta.environments);
        setBaseUrl(meta.baseUrl);
        setDebugMode(meta.debugMode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meta, metaError]);

    useEffect(() => {
        if (!meta || metaError) {
            return;
        }

        // Skip env validation to avoid 404 for paths under /onboarding/hear-about-us
        if (location.pathname.startsWith('/onboarding/hear-about-us')) {
            setReady(true);
            return;
        }

        let currentEnv = env;

        // sync path with datastore
        const pathSplit = location.pathname.split('/');
        if (pathSplit.length > 0 && env !== pathSplit[1]) {
            currentEnv = pathSplit[1];
        }

        // The store set does not match available envs
        if (!meta.environments.find(({ name }) => name === currentEnv)) {
            if (currentEnv !== 'dev' && meta.environments.find(({ name }) => name === 'dev')) {
                // If the specified env is not dev and it's available we set the store value so the back home button works
                // because of self hosting we can't assume dev is always there
                setEnv('dev');
            } else {
                // Otherwise we pick the first one available
                setEnv(meta.environments[0].name);
            }

            setNotFoundEnv(true);
        } else {
            const matchedEnv = meta.environments.find(({ name }) => name === currentEnv);
            if (matchedEnv?.is_production && !can(permissions.canAccessProdEnvironment)) {
                // User navigated directly to a production env they don't have access to
                const fallback = meta.environments.find(({ name, is_production }) => name !== currentEnv && !is_production);
                setEnv(fallback ? fallback.name : meta.environments[0].name);
                setUnauthorizedEnv(true);
            } else {
                setEnv(currentEnv);
                setUnauthorizedEnv(false);
            }
        }

        // it's ready when datastore and path are finally reconciliated
        setReady(true);
    }, [meta, loadingMeta, env, metaError, setEnv, can, location.pathname]);

    useEffect(() => {
        if (user && environmentAndAccount && meta && !meta.debugMode) {
            identify(user);
        }
    }, [user, environmentAndAccount, meta, identify]);

    if (userError || metaError) {
        return <Navigate to="/signin" replace />;
    }
    if (loadingUser || loadingMeta || !ready) {
        return null;
    }

    if (notFoundEnv) {
        return <PageNotFound />;
    }

    if (unauthorizedEnv) {
        return <PageEnvironmentUnauthorized />;
    }

    return <Outlet />;
};
