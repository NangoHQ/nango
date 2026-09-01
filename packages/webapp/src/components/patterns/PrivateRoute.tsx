import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useMeta } from '../../hooks/useMeta';
import { usePermissions } from '../../hooks/usePermissions';
import { useUser } from '../../hooks/useUser';
import PageEnvironmentUnauthorized from '../../pages/PageEnvironmentUnauthorized';
import PageNotFound from '../../pages/PageNotFound';
import { useStore } from '../../store';
import { useAnalyticsIdentify } from '../../utils/analytics';
import { isNonEnvPath } from '../../utils/routes';

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
        // The env check below reads the user's grants; deciding before they land bounces the user.
        if (!meta || metaError || !user) {
            return;
        }

        const nonEnvPath = isNonEnvPath(location.pathname);

        let currentEnv = env;

        // sync path with datastore (skip for non-env-specific pages — env comes from the store, not the URL)
        if (!nonEnvPath) {
            const pathSplit = location.pathname.split('/');
            if (pathSplit.length > 0 && env !== pathSplit[1]) {
                currentEnv = pathSplit[1];
            }
        }

        const matchedEnv = meta.environments.find(({ name }) => name === currentEnv);

        // The store set does not match available envs
        if (!matchedEnv) {
            if (currentEnv !== 'dev' && meta.environments.find(({ name }) => name === 'dev')) {
                // If the specified env is not dev and it's available we set the store value so the back home button works
                // because of self hosting we can't assume dev is always there
                setEnv('dev');
            } else {
                // Otherwise we pick the first one available
                setEnv(meta.environments[0].name);
            }

            // Only show the not-found page for env-specific paths
            setNotFoundEnv(!nonEnvPath);
        } else if (matchedEnv.is_production && !can('environment:settings:read', matchedEnv)) {
            // Only production is checked: a caller with no grants at all would otherwise be locked out of
            // every environment rather than sent somewhere it can work.
            const fallback = meta.environments.find(({ name, is_production }) => name !== currentEnv && !is_production);
            setEnv(fallback ? fallback.name : meta.environments[0].name);
            // Only show the unauthorized page for env-specific paths
            setUnauthorizedEnv(!nonEnvPath);
            setNotFoundEnv(false);
        } else {
            setEnv(currentEnv);
            setUnauthorizedEnv(false);
            setNotFoundEnv(false);
        }

        // it's ready when datastore and path are finally reconciliated
        setReady(true);
    }, [meta, loadingMeta, env, metaError, setEnv, can, user, location.pathname]);

    useEffect(() => {
        if (user && meta && !meta.debugMode) {
            identify(user);
        }
    }, [user, meta, identify]);

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
