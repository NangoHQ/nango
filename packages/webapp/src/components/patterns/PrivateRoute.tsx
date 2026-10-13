import { CircleX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Alert, AlertActions, AlertButton, AlertDescription } from '@nangohq/design-system';

import { useMeta } from '../../hooks/useMeta';
import { usePermissions } from '../../hooks/usePermissions';
import { useUser } from '../../hooks/useUser';
import DefaultLayout from '../../layout/DefaultLayout';
import PageEnvironmentUnauthorized from '../../pages/PageEnvironmentUnauthorized';
import PageNotFound from '../../pages/PageNotFound';
import { useStore } from '../../store';
import { resumeAnalytics, stopAnalytics, useAnalyticsIdentify } from '../../utils/analytics';
import { APIError, isNoSessionError } from '../../utils/api';
import { isNonEnvPath, signinPathWithNext } from '../../utils/routes';
import { useSignout } from '../../utils/user';
import { Spinner } from '../ui/Spinner';

export const PrivateRoute: React.FC = () => {
    const { user, loading: loadingUser, error: userError } = useUser();
    const { data, error: metaError, isFetching: fetchingMeta, refetch: refetchMeta } = useMeta(!!user);
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
        if (!meta) {
            return;
        }

        setStoredEnvs(meta.environments);
        setBaseUrl(meta.baseUrl);
        setDebugMode(meta.debugMode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meta]);

    useEffect(() => {
        // The env check below reads the user's grants; deciding before they land bounces the user.
        if (!meta || !user) {
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
        } else if (!can('environment:settings:read', matchedEnv)) {
            const fallback = meta.environments.find((environment) => environment.name !== currentEnv && can('environment:settings:read', environment));
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
    }, [meta, env, setEnv, can, user, location.pathname]);

    useEffect(() => {
        if (!user || !meta) {
            return;
        }
        if (meta.debugMode) {
            stopAnalytics();
            return;
        }
        resumeAnalytics();
        identify(user, meta.accountGroup);
    }, [user, meta, identify]);

    if (loadingUser) {
        return null;
    }
    // SignedOutRoute sends a loaded user straight back here, so redirecting one to /signin loops forever.
    if (!user) {
        return userError ? <Navigate to={signinPathWithNext(location)} replace /> : null;
    }
    if (!meta) {
        // The query cache's error handler is already signing a no-session user out.
        if (!metaError || (metaError instanceof APIError && isNoSessionError(metaError.res.status, metaError.json))) {
            return null;
        }
        return <MetaLoadError retrying={fetchingMeta} onRetry={() => void refetchMeta()} />;
    }
    if (!ready) {
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

const MetaLoadError: React.FC<{ retrying: boolean; onRetry: () => void }> = ({ retrying, onRetry }) => {
    const signout = useSignout();

    return (
        <DefaultLayout>
            <Alert variant="danger">
                <CircleX />
                <AlertDescription>We couldn&apos;t load your account. Check your connection and try again.</AlertDescription>
                <AlertActions>
                    <AlertButton onClick={onRetry} disabled={retrying}>
                        Retry
                        {retrying && <Spinner />}
                    </AlertButton>
                    <AlertButton onClick={() => void signout()}>Sign out</AlertButton>
                </AlertActions>
            </Alert>
        </DefaultLayout>
    );
};
