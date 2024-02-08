import React, { lazy, Suspense } from "react";
import {
    Routes,
    Route,
    Navigate,
    useLocation,
    useNavigationType,
    createRoutesFromChildren,
    matchRoutes
} from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import * as Sentry from "@sentry/react";

import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { isCloud, isEnterprise } from './utils/utils';
import { useStore } from './store';

const Signup = lazy(() => import('./pages/Signup'));
const InviteSignup = lazy(() => import('./pages/InviteSignup'));
const Signin = lazy(() => import('./pages/Signin'));
const GettingStarted = lazy(() => import('./pages/GettingStarted'));
const IntegrationList = lazy(() => import('./pages/Integration/List'));
const CreateIntegration = lazy(() => import ('./pages/Integration/Create'));
const ShowIntegration = lazy(() => import('./pages/Integration/Show'));
const EndpointReference = lazy(() => import('./pages/Integration/EndpointReference'));
const ConnectionList = lazy(() => import('./pages/Connection/List'));
const Connection = lazy(() => import('./pages/Connection/Show'));
const ConnectionCreate = lazy(() => import('./pages/Connection/Create'));
const ProjectSettings = lazy(() => import('./pages/ProjectSettings'));
const PrivateRoute = lazy(() => import('./components/PrivateRoute'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Activity = lazy(() => import('./pages/Activity'));
const FlowPage = lazy(() => import('./pages/Integration/FlowPage'));
const AuthLink = lazy(() => import('./pages/AuthLink'));
const AccountSettings = lazy(() => import('./pages/AccountSettings'));
const UserSettings = lazy(() => import('./pages/UserSettings'));

Sentry.init({
  dsn: process.env.REACT_APP_PUBLIC_SENTRY_KEY,
  integrations: [
    new Sentry.BrowserTracing({
      routingInstrumentation: Sentry.reactRouterV6Instrumentation(
        React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes
      ),
    }),
  ],
  tracesSampleRate: 0.1,
});

const VALID_PATHS = [
    'getting-started',
    'integration',
    'integrations',
    'syncs',
    'connections',
    'activity',
    'project-settings',
    'user-settings',
    'account-settings',
];

const App = () => {
    const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes)
    const env = useStore(state => state.cookieValue);

    const correctPage = (): string => {
        const url = new URL(window.location.href);
        const pathSegments = url.pathname.split('/').filter(Boolean);

        const rawUrl = window.location.href;

        if (VALID_PATHS.some(path => rawUrl.includes(path))) {
            const newPathSegments = [env, ...pathSegments];
            url.pathname = '/' + newPathSegments.join('/');

            return url.pathname;
        }

        return env === 'dev' ? '/dev/getting-started' : '/prod/integrations';
    };

    return (
        <MantineProvider
            theme={{
                globalStyles: () => ({
                    '.transparent-code .language-json': {
                        backgroundColor: 'transparent !important',
                    },
                    '.transparent-code .language-typescript': {
                        backgroundColor: 'transparent !important',
                    },
                    '.break-all-words .token.string': {
                        wordBreak: 'break-all',
                        whiteSpace: 'normal'
                    }
                })
            }}
        >
            <Suspense>
                <SentryRoutes>
                    <Route path="/" element={<Navigate to={correctPage()} replace />} />
                    <Route path="/dev/getting-started" element={<PrivateRoute />}>
                        <Route path="/dev/getting-started" element={<GettingStarted />} />
                    </Route>
                    <Route path="/:env/integrations" element={<PrivateRoute />}>
                        <Route path="/:env/integrations" element={<IntegrationList />} />
                    </Route>
                    <Route path="/:env/integration/create" element={<PrivateRoute />}>
                        <Route path="/:env/integration/create" element={<CreateIntegration />} />
                    </Route>
                    <Route path="/:env/integration/:providerConfigKey" element={<PrivateRoute />}>
                        <Route path="/:env/integration/:providerConfigKey" element={<ShowIntegration />} />
                    </Route>
                    <Route path="/:env/integration/:providerConfigKey/reference" element={<PrivateRoute />}>
                        <Route path="/:env/integration/:providerConfigKey/reference/*" element={<EndpointReference />} />
                    </Route>
                    <Route path="/:env/connections" element={<PrivateRoute />}>
                        <Route path="/:env/connections" element={<ConnectionList />} />
                    </Route>
                    <Route path="/:env/connections/create" element={<PrivateRoute />}>
                        <Route path="/:env/connections/create" element={<ConnectionCreate />} />
                    </Route>
                    <Route path="/:env/connections/create/:providerConfigKey" element={<PrivateRoute />}>
                        <Route path="/:env/connections/create/:providerConfigKey" element={<ConnectionCreate />} />
                    </Route>
                    <Route path="/:env/connections/:providerConfigKey/:connectionId" element={<PrivateRoute />}>
                        <Route path="/:env/connections/:providerConfigKey/:connectionId" element={<Connection />} />
                    </Route>
                    <Route path="/:env/activity" element={<PrivateRoute />}>
                        <Route path="/:env/activity" element={<Activity />} />
                    </Route>
                    <Route path="/:env/project-settings" element={<PrivateRoute />}>
                        <Route path="/:env/project-settings" element={<ProjectSettings />} />
                    </Route>
                    <Route path="/auth-link" element={<AuthLink />} />
                    <Route path="/:env/integration/:providerConfigKey/:flowName" element={<PrivateRoute />}>
                        <Route path="/:env/integration/:providerConfigKey/:flowName" element={<FlowPage />} />
                    </Route>
                    {(isCloud() || isEnterprise()) && (
                        <>
                            <Route path="/:env/account-settings" element={<AccountSettings />} />
                            <Route path="/:env/user-settings" element={<UserSettings />} />
                            <Route path="/signin" element={<Signin />} />
                            <Route path="/signup" element={<Signup />} />
                            <Route path="/signup/:token" element={<InviteSignup />} />
                            <Route path="/forgot-password" element={<ForgotPassword />} />
                            <Route path="/reset-password/:token" element={<ResetPassword />} />
                        </>
                    )}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </SentryRoutes>
            </Suspense>
            <ToastContainer />
        </MantineProvider>
    );
};

export default App;
