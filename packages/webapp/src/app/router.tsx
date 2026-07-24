import { Navigate, useLocation, useParams } from 'react-router-dom';

import { PrivateRoute } from '@/components/patterns/PrivateRoute';
import { EmailVerified } from '@/pages/Account/EmailVerified';
import ForgotPassword from '@/pages/Account/ForgotPassword';
import { InviteSignup } from '@/pages/Account/InviteSignup';
import { ManagedEmailVerification } from '@/pages/Account/ManagedEmailVerification';
import { MFALogin } from '@/pages/Account/MFALogin';
import ResetPassword from '@/pages/Account/ResetPassword';
import { Signin } from '@/pages/Account/Signin';
import { Signup } from '@/pages/Account/Signup';
import { VerifyEmail } from '@/pages/Account/VerifyEmail';
import { VerifyEmailByExpiredToken } from '@/pages/Account/VerifyEmailByExpiredToken';
import { AuditShow } from '@/pages/Audit/Show';
import { AuthTab as ConnectionAuthTab } from '@/pages/Connection/components/AuthTab';
import { RecordsTab as ConnectionRecordsTab } from '@/pages/Connection/components/RecordsTab';
import { SettingsTab as ConnectionSettingsTab } from '@/pages/Connection/components/SettingsTab';
import { SyncsTab as ConnectionSyncsTab } from '@/pages/Connection/components/SyncsTab';
import { ConnectionCreate } from '@/pages/Connection/Create';
import { ConnectionCreateLegacy } from '@/pages/Connection/CreateLegacy';
import { ConnectionList } from '@/pages/Connection/List';
import { ConnectionShow } from '@/pages/Connection/Show';
import { ShowRecordModel as ConnectionShowRecordModel } from '@/pages/Connection/ShowRecordModel';
import { EnvironmentSettings } from '@/pages/Environment/Settings/Show';
import { ClassicGettingStarted } from '@/pages/GettingStarted/ClassicGettingStarted';
import { GettingStarted } from '@/pages/GettingStarted/Show';
import { Homepage } from '@/pages/Homepage/Show';
import { CreateIntegration } from '@/pages/Integrations/Create';
import { CreateIntegrationList } from '@/pages/Integrations/CreateList';
import { FunctionsOne } from '@/pages/Integrations/providerConfigKey/Functions/One';
import { ShowIntegration } from '@/pages/Integrations/providerConfigKey/Show';
import { Templates } from '@/pages/Integrations/providerConfigKey/Templates';
import { IntegrationsList } from '@/pages/Integrations/Show';
import { LogsShow } from '@/pages/Logs/Show';
import { NotFound } from '@/pages/NotFound';
import { HearAboutUs } from '@/pages/Onboarding/HearAboutUs';
import { Root } from '@/pages/Root';
import { TeamBilling } from '@/pages/Team/Billing/Show';
import { TeamSettingsPage } from '@/pages/Team/Settings';
import { UserSettings } from '@/pages/User/Settings';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';
import { sentryCreateBrowserRouter } from '@/utils/sentry';

import type { BreadcrumbHandle } from '@/hooks/useBreadcrumbs';

const GettingStartedRoute = () => {
    const showGettingStarted = useStore((state) => state.showGettingStarted);

    if (!showGettingStarted) {
        return <Navigate to="/" replace />;
    }

    return globalEnv.isCloud ? <GettingStarted /> : <ClassicGettingStarted />;
};

const RedirectPreservingLocation = ({ to }: { to: string }) => {
    const location = useLocation();
    return <Navigate to={{ pathname: to, search: location.search, hash: location.hash }} replace />;
};

const RedirectWithEnv = ({ path }: { path: string }) => {
    const env = useStore((state) => state.env);
    const params = useParams<Record<string, string>>();

    const pathWithParams = Object.entries(params)
        .filter(([_, value]) => value !== undefined)
        .reduce((acc, [key, value]) => acc.replace(`:${key}`, value!), path);

    return <Navigate to={`/${env}/${pathWithParams}`} replace />;
};

const legacyConnectionTabByHash = {
    '#auth': 'auth',
    '#syncs': 'syncs',
    '#records': 'records',
    '#settings': 'settings'
} as const;

const ConnectionIndexRedirect = () => {
    const location = useLocation();
    const targetTab = legacyConnectionTabByHash[location.hash.toLowerCase() as keyof typeof legacyConnectionTabByHash] ?? 'auth';

    return <Navigate to={{ pathname: targetTab, search: location.search }} replace />;
};

const publicAuthRoutes = (() => {
    if (!globalEnv.features.auth && !globalEnv.features.managedAuth) {
        return [];
    }

    const routes = [
        {
            path: '/signin',
            element: <Signin />
        },
        {
            path: '/signin/mfa',
            element: <MFALogin />
        }
    ];

    if (globalEnv.features.managedAuth) {
        routes.push({
            path: '/signin/verify',
            element: <ManagedEmailVerification />
        });
    }

    if (globalEnv.features.auth) {
        routes.push(
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
        );
    }

    return routes;
})();

export const router = sentryCreateBrowserRouter([
    {
        path: '/',
        element: <Root />
    },
    {
        element: <PrivateRoute />,
        children: [
            {
                path: 'dev/getting-started',
                element: <GettingStartedRoute />,
                handle: { breadcrumb: 'Getting started' } as BreadcrumbHandle
            },
            {
                path: '/onboarding/hear-about-us',
                element: <HearAboutUs />
            },
            {
                path: '/team-settings',
                element: <TeamSettingsPage />,
                handle: { breadcrumb: 'Team settings' } as BreadcrumbHandle
            },
            {
                path: '/user-settings',
                element: <UserSettings />,
                handle: { breadcrumb: 'User settings' } as BreadcrumbHandle
            },
            {
                path: '/team/billing',
                element: <TeamBilling />,
                handle: { breadcrumb: 'Team billing' } as BreadcrumbHandle
            },
            {
                path: '/team/audit',
                element: <AuditShow />,
                handle: { breadcrumb: 'Audit log' } as BreadcrumbHandle
            },
            {
                path: '/:env',
                children: [
                    {
                        index: true,
                        element: <Homepage />,
                        handle: {
                            breadcrumb: 'Metrics'
                        }
                    },
                    {
                        path: 'integrations',
                        handle: { breadcrumb: 'Integrations' } as BreadcrumbHandle,
                        children: [
                            {
                                index: true,
                                element: <IntegrationsList />
                            },
                            {
                                path: 'create',
                                handle: { breadcrumb: 'Create Integration' } as BreadcrumbHandle,
                                children: [
                                    {
                                        index: true,
                                        element: <CreateIntegrationList />
                                    },
                                    {
                                        path: ':providerConfigKey',
                                        element: <CreateIntegration />,
                                        handle: { breadcrumb: (params) => params.providerConfigKey || 'Integration' } as BreadcrumbHandle
                                    }
                                ]
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
                                        path: 'templates',
                                        element: <Templates />,
                                        handle: { breadcrumb: 'Templates' } as BreadcrumbHandle
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
                        path: 'integration/:providerConfigKey',
                        element: <RedirectWithEnv path="integrations/:providerConfigKey" />
                    },
                    {
                        path: 'connections',
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
                                handle: { breadcrumb: (params) => params.connectionId || 'Connection' } as BreadcrumbHandle,
                                element: <ConnectionShow />,
                                children: [
                                    {
                                        index: true,
                                        element: <ConnectionIndexRedirect />
                                    },
                                    {
                                        path: 'auth',
                                        element: <ConnectionAuthTab />,
                                        handle: { breadcrumb: 'Auth' } as BreadcrumbHandle
                                    },
                                    {
                                        path: 'syncs',
                                        element: <ConnectionSyncsTab />,
                                        handle: { breadcrumb: 'Syncs' } as BreadcrumbHandle
                                    },
                                    {
                                        path: 'records',
                                        handle: { breadcrumb: 'Records' } as BreadcrumbHandle,
                                        children: [
                                            {
                                                index: true,
                                                element: <ConnectionRecordsTab />
                                            },
                                            {
                                                path: ':model',
                                                element: <ConnectionShowRecordModel />,
                                                handle: {
                                                    breadcrumb: (params, searchParams) => {
                                                        if (!params.model) {
                                                            return 'Model';
                                                        }
                                                        const variant = searchParams.get('variant');
                                                        return variant ? `${params.model} (${variant})` : params.model;
                                                    }
                                                } as BreadcrumbHandle
                                            }
                                        ]
                                    },
                                    {
                                        path: 'settings',
                                        element: <ConnectionSettingsTab />,
                                        handle: { breadcrumb: 'Settings' } as BreadcrumbHandle
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        path: 'logs',
                        element: <LogsShow />,
                        handle: { breadcrumb: 'Logs' } as BreadcrumbHandle
                    },
                    {
                        path: 'activity',
                        element: <RedirectWithEnv path="logs" />
                    },
                    {
                        path: 'environment-settings',
                        element: <EnvironmentSettings />,
                        handle: { breadcrumb: 'Environment settings' } as BreadcrumbHandle
                    },
                    {
                        path: 'project-settings',
                        element: <Navigate to="/environment-settings" />
                    },
                    // Backward compat redirects for old env-prefixed URLs
                    {
                        path: 'account-settings',
                        element: <RedirectPreservingLocation to="/team-settings" />
                    },
                    {
                        path: 'team-settings',
                        element: <RedirectPreservingLocation to="/team-settings" />
                    },
                    {
                        path: 'user-settings',
                        element: <RedirectPreservingLocation to="/user-settings" />
                    },
                    {
                        path: 'team/billing',
                        element: <RedirectPreservingLocation to="/team/billing" />
                    }
                ]
            }
        ]
    },
    {
        path: '/account-settings',
        element: <RedirectPreservingLocation to="/team-settings" />
    },
    {
        path: '/hn-demo',
        element: <Navigate to={'/signup'} />
    },
    ...publicAuthRoutes,
    {
        path: '*',
        element: <NotFound />
    }
]);
