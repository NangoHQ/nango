import React, { useEffect } from 'react';
import { SWRConfig } from 'swr';
import { Routes, Route, useLocation, useNavigationType, createRoutesFromChildren, matchRoutes, Navigate } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import * as Sentry from '@sentry/react';
import { useSignout } from './utils/user';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AUTH_ENABLED, isCloud, isLocal } from './utils/utils';
import { fetcher } from './utils/api';
import { useStore } from './store';

import Signup from './pages/Signup';
import InviteSignup from './pages/InviteSignup';
import Signin from './pages/Signin';
import { InteractiveDemo } from './pages/InteractiveDemo';
import IntegrationList from './pages/Integration/List';
import CreateIntegration from './pages/Integration/Create';
import ShowIntegration from './pages/Integration/Show';
import ConnectionList from './pages/Connection/List';
import Connection from './pages/Connection/Show';
import ConnectionCreate from './pages/Connection/Create';
import { EnvironmentSettings } from './pages/EnvironmentSettings';
import { PrivateRoute } from './components/PrivateRoute';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Activity from './pages/Activity';
import AuthLink from './pages/AuthLink';
import AccountSettings from './pages/AccountSettings';
import UserSettings from './pages/UserSettings';
import { Homepage } from './pages/Homepage';
import { NotFound } from './pages/NotFound';
import { HNDemo } from './pages/HNDemo';

Sentry.init({
    dsn: process.env.REACT_APP_PUBLIC_SENTRY_KEY,
    integrations: [
        new Sentry.BrowserTracing({
            routingInstrumentation: Sentry.reactRouterV6Instrumentation(React.useEffect, useLocation, useNavigationType, createRoutesFromChildren, matchRoutes)
        })
    ],
    tracesSampleRate: 0.1
});

const App = () => {
    const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);
    const env = useStore((state) => state.env);
    const signout = useSignout();
    const setShowInteractiveDemo = useStore((state) => state.setShowInteractiveDemo);
    const showInteractiveDemo = useStore((state) => state.showInteractiveDemo);

    useEffect(() => {
        setShowInteractiveDemo(env === 'dev' && (isCloud() || isLocal()));
    }, [env, setShowInteractiveDemo]);

    return (
        <MantineProvider
            theme={{
                globalStyles: () => ({
                    '.transparent-code .language-json': {
                        backgroundColor: 'transparent !important'
                    },
                    '.transparent-code .language-typescript': {
                        backgroundColor: 'transparent !important'
                    },
                    '.break-all-words .token.string': {
                        wordBreak: 'break-all',
                        whiteSpace: 'normal'
                    },
                    '.mantine-Prism-code': {
                        fontFamily: 'Roboto Mono'
                    }
                })
            }}
        >
            <SWRConfig
                value={{
                    refreshInterval: 15 * 60000,
                    // Our server is not well configured if we enable that it will just fetch all the time
                    revalidateIfStale: false,
                    revalidateOnFocus: false,
                    revalidateOnReconnect: true,
                    fetcher,
                    onError: (error) => {
                        if (error.status === 401) {
                            return signout();
                        }
                    }
                }}
            >
                <SentryRoutes>
                    <Route path="/" element={<Homepage />} />
                    <Route element={<PrivateRoute />}>
                        {showInteractiveDemo && (
                            <Route path="/dev/interactive-demo" element={<PrivateRoute />}>
                                <Route path="/dev/interactive-demo" element={<InteractiveDemo />} />
                            </Route>
                        )}
                        <Route path="/:env/integrations" element={<IntegrationList />} />
                        <Route path="/:env/integration/create" element={<CreateIntegration />} />
                        <Route path="/:env/integration/:providerConfigKey" element={<ShowIntegration />} />
                        <Route path="/:env/connections" element={<ConnectionList />} />
                        <Route path="/:env/connections/create" element={<ConnectionCreate />} />
                        <Route path="/:env/connections/create/:providerConfigKey" element={<ConnectionCreate />} />
                        <Route path="/:env/connections/:providerConfigKey/:connectionId" element={<Connection />} />
                        <Route path="/:env/activity" element={<Activity />} />
                        <Route path="/:env/environment-settings" element={<EnvironmentSettings />} />
                        <Route path="/:env/project-settings" element={<Navigate to="/environment-settings" />} />
                        {AUTH_ENABLED && (
                            <>
                                <Route path="/:env/account-settings" element={<AccountSettings />} />
                                <Route path="/:env/user-settings" element={<UserSettings />} />
                            </>
                        )}
                    </Route>
                    <Route path="/auth-link" element={<AuthLink />} />
                    {true && <Route path="/hn-demo" element={<HNDemo />} />}
                    {AUTH_ENABLED && (
                        <>
                            <Route path="/signin" element={<Signin />} />
                            <Route path="/signup/:token" element={<InviteSignup />} />
                            <Route path="/forgot-password" element={<ForgotPassword />} />
                            <Route path="/reset-password/:token" element={<ResetPassword />} />
                        </>
                    )}
                    {(isCloud() || isLocal()) && <Route path="/signup" element={<Signup />} />}
                    <Route path="*" element={<NotFound />} />
                </SentryRoutes>
            </SWRConfig>
            <ToastContainer />
        </MantineProvider>
    );
};

export default App;
