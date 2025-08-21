import { MantineProvider, createTheme } from '@mantine/core';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Navigate, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { useLocalStorage } from 'react-use';
import { SWRConfig } from 'swr';

import { PrivateRoute } from './components/PrivateRoute';
import { Toaster } from './components/ui/toast/Toaster';
import { EmailVerified } from './pages/Account/EmailVerified';
import ForgotPassword from './pages/Account/ForgotPassword';
import { InviteSignup } from './pages/Account/InviteSignup';
import ResetPassword from './pages/Account/ResetPassword';
import Signin from './pages/Account/Signin';
import { Signup } from './pages/Account/Signup';
import { VerifyEmail } from './pages/Account/VerifyEmail';
import { VerifyEmailByExpiredToken } from './pages/Account/VerifyEmailByExpiredToken';
import { ConnectionCreate } from './pages/Connection/Create';
import { ConnectionCreateLegacy } from './pages/Connection/CreateLegacy';
import { ConnectionList } from './pages/Connection/List';
import { ConnectionShow } from './pages/Connection/Show';
import { EnvironmentSettings } from './pages/Environment/Settings/Show';
import { ClassicGettingStarted } from './pages/GettingStarted/ClassicGettingStarted';
import { GettingStarted } from './pages/GettingStarted/Show';
import { Homepage } from './pages/Homepage/Show';
import CreateIntegration from './pages/Integrations/Create';
import IntegrationList from './pages/Integrations/List';
import { ShowIntegration } from './pages/Integrations/providerConfigKey/Show';
import { LogsShow } from './pages/Logs/Show';
import { NotFound } from './pages/NotFound';
import { Root } from './pages/Root';
import { TeamBilling } from './pages/Team/Billing/Show';
import { TeamSettings } from './pages/Team/Settings';
import { UserSettings } from './pages/User/Settings';
import { useStore } from './store';
import { fetcher } from './utils/api';
import { globalEnv } from './utils/env';
import { LocalStorageKeys } from './utils/local-storage';
import { SentryRoutes } from './utils/sentry';
import { useSignout } from './utils/user';

import 'react-toastify/dist/ReactToastify.css';

const theme = createTheme({
    fontFamily: 'Inter'
});

const App = () => {
    const env = useStore((state) => state.env);
    const signout = useSignout();
    const setShowGettingStarted = useStore((state) => state.setShowGettingStarted);
    const showGettingStarted = useStore((state) => state.showGettingStarted);
    const [_, setLastEnvironment] = useLocalStorage(LocalStorageKeys.LastEnvironment);

    useEffect(() => {
        setShowGettingStarted(env === 'dev' && globalEnv.features.gettingStarted);
        if (env) {
            setLastEnvironment(env);
        }
    }, [env, setShowGettingStarted, setLastEnvironment]);

    return (
        <MantineProvider theme={theme}>
            {globalEnv.publicKoalaApiUrl && globalEnv.publicKoalaCdnUrl && (
                <Helmet
                    script={[
                        {
                            type: 'text/javascript',
                            innerHTML: `
                                window.koalaSettings = { host: "${globalEnv.publicKoalaApiUrl}" };
                                !function(t){var k="ko",i=(window.globalKoalaKey=window.globalKoalaKey||k);if(window[i])return;var ko=(window[i]=[]);["identify","track","removeListeners","on","off","qualify","ready"].forEach(function(t){ko[t]=function(){var n=[].slice.call(arguments);return n.unshift(t),ko.push(n),ko}});var n=document.createElement("script");n.async=!0,n.setAttribute("src","${globalEnv.publicKoalaCdnUrl}"),(document.body || document.head).appendChild(n)}();
                            `
                        }
                    ]}
                />
            )}

            <TooltipProvider>
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
                        <Route path="/" element={<Root />} />
                        <Route element={<PrivateRoute />} key={env}>
                            <Route path="/:env" element={<Homepage />} />
                            {showGettingStarted &&
                                (globalEnv.isCloud ? (
                                    <Route path="/dev/getting-started" element={<GettingStarted />} />
                                ) : (
                                    <Route path="/dev/getting-started" element={<ClassicGettingStarted />} />
                                ))}
                            <Route path="/:env/integrations" element={<IntegrationList />} />
                            <Route path="/:env/integrations/create" element={<CreateIntegration />} />
                            <Route path="/:env/integration/:providerConfigKey" element={<Navigate to={'/integrations'} />} />
                            <Route path="/:env/integrations/:providerConfigKey/*" element={<ShowIntegration />} />
                            <Route path="/:env/connections" element={<ConnectionList />} />
                            <Route path="/:env/connections/create" element={<ConnectionCreate />} />
                            <Route path="/:env/connections/create-legacy" element={<ConnectionCreateLegacy />} />
                            <Route path="/:env/connections/:providerConfigKey/:connectionId" element={<ConnectionShow />} />
                            <Route path="/:env/activity" element={<Navigate to={`/${env}/logs`} replace={true} />} />
                            <Route path="/:env/logs" element={<LogsShow />} />
                            <Route path="/:env/environment-settings" element={<EnvironmentSettings />} />
                            <Route path="/:env/project-settings" element={<Navigate to="/environment-settings" />} />
                            <Route path="/:env/account-settings" element={<Navigate to="/team-settings" />} />
                            <Route path="/:env/team-settings" element={<TeamSettings />} />
                            <Route path="/:env/team/billing" element={<TeamBilling />} />
                            <Route path="/:env/user-settings" element={<UserSettings />} />
                        </Route>
                        {<Route path="/hn-demo" element={<Navigate to={'/signup'} />} />}
                        {globalEnv.features.auth && (
                            <>
                                <Route path="/signin" element={<Signin />} />
                                <Route path="/signup/:token" element={<InviteSignup />} />
                                <Route path="/forgot-password" element={<ForgotPassword />} />
                                <Route path="/reset-password/:token" element={<ResetPassword />} />
                                <Route path="/verify-email/:uuid" element={<VerifyEmail />} />
                                <Route path="/verify-email/expired/:token" element={<VerifyEmailByExpiredToken />} />
                                <Route path="/signup/verification/:token" element={<EmailVerified />} />
                            </>
                        )}
                        {globalEnv.features.auth && <Route path="/signup" element={<Signup />} />}
                        <Route path="*" element={<NotFound />} />
                    </SentryRoutes>
                </SWRConfig>
                <ToastContainer />
            </TooltipProvider>
            <Toaster />
        </MantineProvider>
    );
};

export default App;
