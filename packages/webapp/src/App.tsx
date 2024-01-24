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
const IntegrationList = lazy(() => import('./pages/IntegrationList'));
const IntegrationCreate = lazy(() => import('./pages/IntegrationCreate'));
const ConnectionList = lazy(() => import('./pages/ConnectionList'));
const ConnectionCreate = lazy(() => import('./pages/ConnectionCreate'));
const FlowCreate = lazy(() => import('./pages/FlowCreate'));
const ConnectionDetails = lazy(() => import('./pages/ConnectionDetails'));
const ProjectSettings = lazy(() => import('./pages/ProjectSettings'));
const PrivateRoute = lazy(() => import('./components/PrivateRoute'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Activity = lazy(() => import('./pages/Activity'));
const Syncs = lazy(() => import('./pages/Syncs'));
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

const App = () => {
    const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes)
    const env = useStore(state => state.cookieValue);

    const landingPage = env === 'dev' ? '/getting-started' : '/integrations';

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
                <SentryRoutes >
                    <Route path="/" element={<Navigate to={landingPage} replace />} />
                    <Route path="/getting-started" element={<PrivateRoute />}>
                        <Route path="/getting-started" element={<GettingStarted />} />
                    </Route>
                    <Route path="/integrations" element={<PrivateRoute />}>
                        <Route path="/integrations" element={<IntegrationList />} />
                    </Route>
                    <Route path="/integration/create" element={<PrivateRoute />}>
                        <Route path="/integration/create" element={<IntegrationCreate />} />
                    </Route>
                    <Route path="/integration/:providerConfigKey" element={<PrivateRoute />}>
                        <Route path="/integration/:providerConfigKey" element={<IntegrationCreate />} />
                    </Route>
                    <Route path="/syncs" element={<PrivateRoute />}>
                        <Route path="/syncs" element={<Syncs />} />
                    </Route>
                    <Route path="/connections" element={<PrivateRoute />}>
                        <Route path="/connections" element={<ConnectionList />} />
                    </Route>
                    <Route path="/connections/create" element={<PrivateRoute />}>
                        <Route path="/connections/create" element={<ConnectionCreate />} />
                    </Route>
                    <Route path="/connections/create/:providerConfigKey" element={<PrivateRoute />}>
                        <Route path="/connections/create/:providerConfigKey" element={<ConnectionCreate />} />
                    </Route>
                    <Route path="/connections/:providerConfigKey/:connectionId" element={<PrivateRoute />}>
                        <Route path="/connections/:providerConfigKey/:connectionId" element={<ConnectionDetails />} />
                    </Route>
                    <Route path="/activity" element={<PrivateRoute />}>
                        <Route path="/activity" element={<Activity />} />
                    </Route>
                    <Route path="/project-settings" element={<PrivateRoute />}>
                        <Route path="/project-settings" element={<ProjectSettings />} />
                    </Route>
                    <Route path="/auth-link" element={<AuthLink />} />
                    <Route path="/flow/create" element={<PrivateRoute />}>
                        <Route path="/flow/create" element={<FlowCreate />} />
                    </Route>
                    {(isCloud() || isEnterprise()) && (
                        <>
                            <Route path="/account-settings" element={<AccountSettings />} />
                            <Route path="/user-settings" element={<UserSettings />} />
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
