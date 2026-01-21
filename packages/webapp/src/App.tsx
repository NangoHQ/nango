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

import type { BreadcrumbHandle } from './hooks/useBreadcrumbs';

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

const RedirectWithEnv = ({ path }: { path: string }) => {
    const env = useStore((state) => state.env);
    const params = useParams<Record<string, string>>();

    const pathWithParams = Object.entries(params)
        .filter(([_, value]) => value !== undefined)
        .reduce((acc, [key, value]) => acc.replace(`:${key}`, value!), path);

    return <Navigate to={`/${env}/${pathWithParams}`} replace />;
};

const router = sentryCreateBrowserRouter([
    {
        path: '/',
        element: <Root />
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
                handle: { breadcrumb: 'Getting started' } as BreadcrumbHandle
            },
            {
                path: '/:env/integrations',
                handle: { breadcrumb: 'Integrations' } as BreadcrumbHandle,
                children: [
                    {
                        index: true,
                        element: <IntegrationsList />
                    },
                    {
                        path: 'create',
                        element: <CreateIntegration />,
                        handle: { breadcrumb: 'Create Integration' } as BreadcrumbHandle
                    },
                    {
                        path: ':providerConfigKey',
                        handle: {
                            breadcrumb: (params) => params.providerConfigKey || 'Integration'
                        } as BreadcrumbHandle,
                        children: [
                            {
                                index: true,
                                element: <ShowIntegration />
                            },
                            {
                                path: 'functions/:functionName',
                                element: <FunctionsOne />,
                                handle: {
                                    breadcrumb: (params) => params.functionName || 'Function'
                                } as BreadcrumbHandle
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
                path: '/:env/integration/:providerConfigKey',
                element: <RedirectWithEnv path="integrations/:providerConfigKey" />
            },
            {
                path: '/:env/connections',
                handle: { breadcrumb: 'Connections' } as BreadcrumbHandle,
                children: [
                    {
                        index: true,
                        element: <ConnectionList />
                    },
                    {
                        path: 'create',
                        element: <ConnectionCreate />,
                        handle: { breadcrumb: 'Create Connection' } as BreadcrumbHandle
                    },
                    {
                        path: 'create-legacy',
                        element: <ConnectionCreateLegacy />,
                        handle: { breadcrumb: 'Create Connection (Legacy)' } as BreadcrumbHandle
                    },
                    {
                        path: ':providerConfigKey/:connectionId',
                        element: <ConnectionShow />,
                        handle: { breadcrumb: (params) => params.connectionId || 'Connection' } as BreadcrumbHandle
                    }
                ]
            },
            {
                path: '/:env/logs',
                element: <LogsShow />,
                handle: { breadcrumb: 'Logs' } as BreadcrumbHandle
            },
            {
                path: '/:env/activity',
                element: <RedirectWithEnv path="logs" />
            },
            {
                path: '/:env/environment-settings',
                element: <EnvironmentSettings />,
                handle: { breadcrumb: 'Environment settings' } as BreadcrumbHandle
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
                handle: { breadcrumb: 'Team settings' } as BreadcrumbHandle
            },
            {
                path: '/:env/team/billing',
                element: <TeamBilling />,
                handle: { breadcrumb: 'Billing' } as BreadcrumbHandle
            },
            {
                path: '/:env/user-settings',
                element: <UserSettings />,
                handle: { breadcrumb: 'User settings' } as BreadcrumbHandle
            }
        ]
    },
    {
        path: '/hn-demo',
        element: <Navigate to={'/signup'} />
    },
    ...(globalEnv.features.auth
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
        : []),
    {
        path: '*',
        element: <NotFound />
    }
]);

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
