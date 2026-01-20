import { MantineProvider, createTheme } from '@mantine/core';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { useEffect, useRef } from 'react';
import { Navigate, RouterProvider, useParams } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { useLocalStorage } from 'react-use';
import { SWRConfig } from 'swr';

import { PrivateRoute } from './components/PrivateRoute';
import { Toaster } from './components/ui/toast/Toaster';
import { useMeta } from './hooks/useMeta';
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
import { CreateIntegration } from './pages/Integrations/Create';
import { IntegrationsList } from './pages/Integrations/Show';
import { FunctionsOne } from './pages/Integrations/providerConfigKey/Functions/One';
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
import { sentryCreateBrowserRouter } from './utils/sentry';
import { useSignout } from './utils/user';

import 'react-toastify/dist/ReactToastify.css';

const theme = createTheme({
    fontFamily: 'Inter'
});

const GettingStartedRoute = () => {
    const showGettingStarted = useStore((state) => state.showGettingStarted);

    if (!showGettingStarted) {
        return <Navigate to="/" replace />;
    }

    return globalEnv.isCloud ? <GettingStarted /> : <ClassicGettingStarted />;
};

// Wrapper component for activity redirect that uses route params
const ActivityRedirect = () => {
    const { env } = useParams<{ env: string }>();
    return <Navigate to={`/${env}/logs`} replace={true} />;
};

const buildRoutes = () => {
    const authRoutes = globalEnv.features.auth
        ? [
              {
                  path: '/signin',
                  element: <Signin />
              },
              {
                  path: '/signup/:token',
                  element: <InviteSignup />
              },
              {
                  path: '/forgot-password',
                  element: <ForgotPassword />
              },
              {
                  path: '/reset-password/:token',
                  element: <ResetPassword />
              },
              {
                  path: '/verify-email/:uuid',
                  element: <VerifyEmail />
              },
              {
                  path: '/verify-email/expired/:token',
                  element: <VerifyEmailByExpiredToken />
              },
              {
                  path: '/signup/verification/:token',
                  element: <EmailVerified />
              },
              {
                  path: '/signup',
                  element: <Signup />
              }
          ]
        : [];

    return [
        {
            path: '/',
            element: <Root />,
            handle: { breadcrumb: 'Home' }
        },
        {
            element: <PrivateRoute />,
            children: [
                {
                    path: '/:env',
                    element: <Homepage />,
                    handle: {
                        breadcrumb: 'Metrics'
                    }
                },
                {
                    path: '/dev/getting-started',
                    element: <GettingStartedRoute />,
                    handle: { breadcrumb: 'Getting Started' }
                },
                {
                    path: '/:env/integrations',
                    handle: { breadcrumb: 'Integrations' },
                    children: [
                        {
                            index: true,
                            element: <IntegrationsList />
                        },
                        {
                            path: 'create',
                            element: <CreateIntegration />,
                            handle: { breadcrumb: 'Create Integration' }
                        },
                        {
                            path: ':providerConfigKey',
                            handle: {
                                breadcrumb: (params: Record<string, string | undefined>) => params.providerConfigKey || 'Integration'
                            },
                            children: [
                                {
                                    index: true,
                                    element: <ShowIntegration />
                                },
                                {
                                    path: 'functions/:functionName',
                                    element: <FunctionsOne />,
                                    handle: { breadcrumb: (params: Record<string, string | undefined>) => params.functionName || 'Function' }
                                },
                                {
                                    path: '*',
                                    element: <ShowIntegration />
                                }
                            ]
                        }
                    ]
                },
                {
                    path: '/:env/connections',
                    handle: { breadcrumb: 'Connections' },
                    children: [
                        {
                            index: true,
                            element: <ConnectionList />
                        },
                        {
                            path: 'create',
                            element: <ConnectionCreate />,
                            handle: { breadcrumb: 'Create Connection' }
                        },
                        {
                            path: 'create-legacy',
                            element: <ConnectionCreateLegacy />,
                            handle: { breadcrumb: 'Create Connection (Legacy)' }
                        },
                        {
                            path: ':providerConfigKey/:connectionId',
                            element: <ConnectionShow />,
                            handle: { breadcrumb: (params: Record<string, string | undefined>) => params.connectionId || 'Connection' }
                        }
                    ]
                },
                {
                    path: '/:env/activity',
                    element: <ActivityRedirect />
                },
                {
                    path: '/:env/logs',
                    element: <LogsShow />,
                    handle: { breadcrumb: 'Logs' }
                },
                {
                    path: '/:env/environment-settings',
                    element: <EnvironmentSettings />,
                    handle: { breadcrumb: 'Environment Settings' }
                },
                {
                    path: '/:env/project-settings',
                    element: <Navigate to="/environment-settings" />
                },
                {
                    path: '/:env/account-settings',
                    element: <Navigate to="/team-settings" />
                },
                {
                    path: '/:env/team-settings',
                    element: <TeamSettings />,
                    handle: { breadcrumb: 'Team Settings' }
                },
                {
                    path: '/:env/team/billing',
                    element: <TeamBilling />,
                    handle: { breadcrumb: 'Billing' }
                },
                {
                    path: '/:env/user-settings',
                    element: <UserSettings />,
                    handle: { breadcrumb: 'User Settings' }
                }
            ]
        },
        {
            path: '/hn-demo',
            element: <Navigate to={'/signup'} />
        },
        ...authRoutes,
        {
            path: '*',
            element: <NotFound />
        }
    ];
};

const router = sentryCreateBrowserRouter(buildRoutes());

const App = () => {
    const env = useStore((state) => state.env);
    const signout = useSignout();
    const setShowGettingStarted = useStore((state) => state.setShowGettingStarted);
    const [_, setLastEnvironment] = useLocalStorage(LocalStorageKeys.LastEnvironment);
    const { meta } = useMeta();

    useEffect(() => {
        setShowGettingStarted(env === 'dev' && globalEnv.features.gettingStarted);
        if (env) {
            setLastEnvironment(env);
        }
    }, [env, setShowGettingStarted, setLastEnvironment]);

    // Print the version and git hash to the console (only once)
    const hasPrintedVersion = useRef(false);
    useEffect(() => {
        if (!meta || hasPrintedVersion.current) {
            return;
        }

        hasPrintedVersion.current = true;
        console.log(`Nango v${meta.version} ${globalEnv.gitHash ? `(${globalEnv.gitHash})` : ''}`);
    }, [meta]);

    return (
        <MantineProvider theme={theme}>
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
                    <RouterProvider router={router} />
                </SWRConfig>
                <ToastContainer />
            </TooltipProvider>
            <Toaster />
        </MantineProvider>
    );
};

export default App;
