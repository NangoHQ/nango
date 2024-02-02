import React from "react";
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

import Signup from './pages/Signup';
import InviteSignup from './pages/InviteSignup';
import Signin from './pages/Signin';
import GettingStarted from './pages/GettingStarted';
import IntegrationList from './pages/Integration/List';
import CreateIntegration from './pages/Integration/Create';
import ShowIntegration from './pages/Integration/Show';
import EndpointReference from './pages/Integration/EndpointReference';
import ConnectionList from './pages/Connection/List';
import Connection from './pages/Connection/Show';
import ConnectionCreate from './pages/Connection/Create';
import FlowCreate from './pages/FlowCreate';
import ConnectionDetails from './pages/ConnectionDetails';
import ProjectSettings from './pages/ProjectSettings';
import PrivateRoute from './components/PrivateRoute';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Activity from './pages/Activity';
import Syncs from './pages/Syncs';
import FlowPage from './pages/Integration/FlowPage';
import AuthLink from './pages/AuthLink';
import AccountSettings from './pages/AccountSettings';
import UserSettings from './pages/UserSettings';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { isCloud, isEnterprise } from './utils/utils';
import { useStore } from './store';

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
        const pathSegments = url.pathname.split('/').filter(Boolean); // Remove any leading/trailing slashes and empty segments

        const rawUrl = window.location.href;

        console.log(VALID_PATHS.some(path => rawUrl.includes(path)));
        if (VALID_PATHS.some(path => rawUrl.includes(path))) {
            console.log(pathSegments);
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
                <Route path="/:env/syncs" element={<PrivateRoute />}>
                    <Route path="/:env/syncs" element={<Syncs />} />
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
                <Route path="/:env/connections-old/:providerConfigKey/:connectionId" element={<PrivateRoute />}>
                    <Route path="/:env/connections-old/:providerConfigKey/:connectionId" element={<ConnectionDetails />} />
                </Route>
                <Route path="/:env/activity" element={<PrivateRoute />}>
                    <Route path="/:env/activity" element={<Activity />} />
                </Route>
                <Route path="/:env/project-settings" element={<PrivateRoute />}>
                    <Route path="/:env/project-settings" element={<ProjectSettings />} />
                </Route>
                <Route path="/auth-link" element={<AuthLink />} />
                <Route path="/:env/flow/create" element={<PrivateRoute />}>
                    <Route path="/:env/flow/create" element={<FlowCreate />} />
                </Route>
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
            <ToastContainer />
        </MantineProvider>
    );
};

export default App;
