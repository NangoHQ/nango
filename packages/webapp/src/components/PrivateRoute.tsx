import { Outlet, Navigate } from 'react-router-dom';
import { useMeta } from '../hooks/useMeta';
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useAnalyticsIdentify } from '../utils/analytics';
import { useUser } from '../hooks/useUser';
import PageNotFound from '../pages/PageNotFound';

export const PrivateRoute: React.FC = () => {
    const { meta, error, loading } = useMeta();
    const [notFoundEnv, setNotFoundEnv] = useState(false);
    const [ready, setReady] = useState(false);
    const { user } = useUser(Boolean(meta && ready && !notFoundEnv));
    const identify = useAnalyticsIdentify();

    const env = useStore((state) => state.cookieValue);
    const setStoredEnvs = useStore((state) => state.setEnvs);
    const setBaseUrl = useStore((state) => state.setBaseUrl);
    const setEmail = useStore((state) => state.setEmail);
    const setDebugMode = useStore((state) => state.setDebugMode);
    const setCookieValue = useStore((state) => state.setCookieValue);

    useEffect(() => {
        // sync path with cookie
        const pathSplit = location.pathname.split('/');
        if (pathSplit.length > 0 && env !== pathSplit[1]) {
            setCookieValue(pathSplit[1]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        if (!meta || error) {
            return;
        }

        // The cookie set does not match available envs
        if (!meta.environments.find(({ name }) => name === env)) {
            if (env !== 'dev' && meta.environments.find(({ name }) => name === 'dev')) {
                // If the specified env is not dev and it's available we set the cookie so the back home button works
                // because of self hosting we can't assume dev is always there
                setCookieValue('dev');
            } else {
                // Otherwise we pick the first one available
                setCookieValue(meta.environments[0].name);
            }

            setNotFoundEnv(true);
            return;
        }

        // it's ready when cookie and path is finally reconciliated
        setReady(true);
    }, [meta, loading, env, error, setCookieValue]);

    useEffect(() => {
        if (user) {
            identify(user);
        }
    }, [user, identify]);

    if (loading || !ready) {
        return null;
    }

    if (notFoundEnv) {
        return <PageNotFound />;
    }
    if (error) {
        return <Navigate to="/signin" replace />;
    }

    return <Outlet />;
};
