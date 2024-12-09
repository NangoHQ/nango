import { Outlet, Navigate } from 'react-router-dom';
import { useMeta } from '../hooks/useMeta';
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useAnalyticsIdentify } from '../utils/analytics';
import { useUser } from '../hooks/useUser';
import PageNotFound from '../pages/PageNotFound';
import { useEnvironment } from '../hooks/useEnvironment';

export const PrivateRoute: React.FC = () => {
    const { meta, error, loading: loadingMeta } = useMeta();
    const [notFoundEnv, setNotFoundEnv] = useState(false);
    const [ready, setReady] = useState(false);
    const { user, loading: loadingUser } = useUser(Boolean(meta && ready && !notFoundEnv));
    const identify = useAnalyticsIdentify();

    const env = useStore((state) => state.env);
    const setStoredEnvs = useStore((state) => state.setEnvs);
    const setBaseUrl = useStore((state) => state.setBaseUrl);
    const setDebugMode = useStore((state) => state.setDebugMode);
    const setEnv = useStore((state) => state.setEnv);
    const { environmentAndAccount } = useEnvironment(env);

    useEffect(() => {
        if (!meta || error) {
            return;
        }

        setStoredEnvs(meta.environments);
        setBaseUrl(meta.baseUrl);
        setDebugMode(meta.debugMode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meta, error]);

    useEffect(() => {
        if (!meta || error) {
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
            setEnv(currentEnv);
        }

        // it's ready when datastore and path are finally reconciliated
        setReady(true);
    }, [meta, loadingMeta, env, error, setEnv]);

    useEffect(() => {
        if (user && environmentAndAccount && meta && !meta.debugMode) {
            identify(user);
            window.ko?.identify(user.email, { name: user.name, $account: { group_id: user.accountId, name: environmentAndAccount.name } });
        }
    }, [user, environmentAndAccount, meta, identify]);

    if (loadingMeta || !ready || loadingUser) {
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
