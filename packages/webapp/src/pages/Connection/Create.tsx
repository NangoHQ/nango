import { IconBook, IconChevronRight, IconHelpCircle } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useSearchParam, useUnmount } from 'react-use';

import { Info } from '../../components/Info';
import { SimpleTooltip } from '../../components/SimpleTooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/Collapsible';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button, ButtonLink } from '../../components/ui/button/Button';
import { Input } from '../../components/ui/input/Input';
import { useListIntegration } from '../../hooks/useIntegration';
import { useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { CreateConnectionSelector } from './components/CreateConnectionSelector';

import type { ConnectUI } from '@nangohq/frontend';
import type { ApiIntegrationList } from '@nangohq/types';

export const ConnectionCreate: React.FC = () => {
    const env = useStore((state) => state.env);
    const paramExtended = useSearchParam('extended');
    const paramIntegrationId = useSearchParam('integration_id');

    const connectUI = useRef<ConnectUI>();

    const { user } = useUser(true);
    const { list: listIntegration, loading } = useListIntegration(env);

    const [integration, setIntegration] = useState<ApiIntegrationList>();
    const [testUserEmail, setTestUserEmail] = useState(user!.email);
    const [testUserId, setTestUserId] = useState(`test_${user!.name.toLocaleLowerCase().replaceAll(' ', '_')}`);
    const [testUserName, setTestUserName] = useState(user!.name);
    const [testOrgName, setTestOrgName] = useState('');
    const [testOrgId, setTestOrgId] = useState('');

    useUnmount(() => {
        if (connectUI.current) {
            connectUI.current.close();
        }
    });

    useEffect(() => {
        if (paramIntegrationId && listIntegration) {
            const exists = listIntegration.find((v) => v.unique_key === paramIntegrationId);
            if (exists) {
                setIntegration(exists);
            }
        }
    }, [paramIntegrationId, listIntegration]);

    if (loading) {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>Create Test Connection - Nango</title>
                </Helmet>
                <div className="grid grid-cols-2 text-white">
                    <div className="pr-10 flex flex-col gap-10">
                        <h1 className="text-2xl">Create test connection</h1>
                        <div className="flex flex-col gap-4">
                            <Skeleton className="w-full h-10" />
                            <Skeleton className="w-full" />
                            <Skeleton className="w-full" />
                        </div>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <Helmet>
                <title>Create Test Connection - Nango</title>
            </Helmet>
            <div className="grid grid-cols-2 text-white">
                <div className="pr-10">
                    <div className="flex flex-col gap-8">
                        <h1 className="text-2xl">Create a test connection</h1>
                        <CreateConnectionSelector />

                        <Info>
                            The test connection will use the name & email address of your Nango dashboard account. In your app, you can pass your user’s
                            details.
                        </Info>

                        {paramExtended && (
                            <Collapsible>
                                <CollapsibleTrigger className="text-grayscale-400" asChild>
                                    <Button variant={'link'} size={'auto'} className="text-sm [&[data-state=open]>svg]:rotate-90">
                                        <IconChevronRight size={18} stroke={1} className="transition-transform duration-200" /> Test user info
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-8 flex flex-col gap-8">
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="test_user_email" className="flex gap-2 items-center">
                                            Test User Email
                                            <div>
                                                <span className="text-alert-400 text-s align-super">*</span>
                                            </div>
                                            <SimpleTooltip
                                                side="right"
                                                align="center"
                                                tooltipContent={
                                                    <p className="text-s">
                                                        Emulate your End User Email. In your production this would be your user&apos;s email.
                                                        <br />
                                                        <Link
                                                            to="https://docs.nango.dev/reference/api/connect/sessions/create"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                }
                                            >
                                                <IconHelpCircle stroke={1} size={18} className="text-grayscale-500" />
                                            </SimpleTooltip>
                                        </label>
                                        <Input
                                            variant={'black'}
                                            inputSize={'lg'}
                                            id="test_user_email"
                                            placeholder="you@email.com"
                                            autoComplete="email"
                                            type="email"
                                            value={testUserEmail}
                                            onChange={(e) => setTestUserEmail(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="test_user_id" className="flex gap-2">
                                            Test User ID
                                            <div>
                                                <span className="text-alert-400 text-s align-super">*</span>
                                            </div>
                                            <SimpleTooltip
                                                side="right"
                                                align="center"
                                                tooltipContent={
                                                    <p className="text-s">
                                                        Emulate your End User ID. In your production this would be your user&apos;s id.
                                                        <br />
                                                        <Link
                                                            to="https://docs.nango.dev/reference/api/connect/sessions/create"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                }
                                            >
                                                <IconHelpCircle stroke={1} size={18} className="text-grayscale-500" />
                                            </SimpleTooltip>
                                        </label>
                                        <Input
                                            variant={'black'}
                                            inputSize={'lg'}
                                            id="test_user_id"
                                            placeholder="Your user internal ID"
                                            value={testUserId}
                                            onChange={(e) => setTestUserId(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="test_user_display_name" className="flex gap-2">
                                            Test User Display Name
                                            <SimpleTooltip
                                                side="right"
                                                align="center"
                                                tooltipContent={
                                                    <p className="text-s">
                                                        Emulate your End User Display Name. In your production this would be your user&apos;s display name.
                                                        <br />
                                                        <Link
                                                            to="https://docs.nango.dev/reference/api/connect/sessions/create"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                }
                                            >
                                                <IconHelpCircle stroke={1} size={18} className="text-grayscale-500" />
                                            </SimpleTooltip>
                                        </label>
                                        <Input
                                            variant={'black'}
                                            inputSize={'lg'}
                                            id="test_user_id"
                                            placeholder="Your user internal ID"
                                            value={testUserName}
                                            onChange={(e) => setTestUserName(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="test_org_id" className="flex gap-2">
                                            Test User Organization ID
                                            <SimpleTooltip
                                                side="right"
                                                align="center"
                                                tooltipContent={
                                                    <p className="text-s">
                                                        Emulate your End User Organization ID. In your production this would be your user&apos;s organization
                                                        ID.
                                                        <br />
                                                        <Link
                                                            to="https://docs.nango.dev/reference/api/connect/sessions/create"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                }
                                            >
                                                <IconHelpCircle stroke={1} size={18} className="text-grayscale-500" />
                                            </SimpleTooltip>
                                        </label>
                                        <Input
                                            variant={'black'}
                                            inputSize={'lg'}
                                            id="test_org_id"
                                            placeholder="Your user's organization ID"
                                            value={testOrgId}
                                            onChange={(e) => setTestOrgId(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="test_org_name" className="flex gap-2">
                                            Test User Organization Name
                                            <SimpleTooltip
                                                side="right"
                                                align="center"
                                                tooltipContent={
                                                    <p className="text-s">
                                                        Emulate your End User Organization Name. In your production this would be your user&apos;s organization
                                                        name.
                                                        <br />
                                                        <Link
                                                            to="https://docs.nango.dev/reference/api/connect/sessions/create"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                }
                                            >
                                                <IconHelpCircle stroke={1} size={18} className="text-grayscale-500" />
                                            </SimpleTooltip>
                                        </label>
                                        <Input
                                            variant={'black'}
                                            inputSize={'lg'}
                                            id="test_org_name"
                                            placeholder="Your user's organization name"
                                            value={testOrgName}
                                            onChange={(e) => setTestOrgName(e.target.value)}
                                        />
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        )}
                        <div className="flex gap-4">
                            <ButtonLink
                                to={`/${env}/connections/create-legacy?${integration ? `providerConfigKey=${integration.unique_key}` : ''}`}
                                size="md"
                                variant={'link'}
                            >
                                Or use deprecated flow <IconChevronRight stroke={1} size={18} />
                            </ButtonLink>
                        </div>
                    </div>
                </div>
                <div className="border-l border-l-grayscale-800 pl-10">
                    <div className="flex flex-col gap-10">
                        <h1 className="text-2xl">Embed in your app</h1>
                        <a
                            className="transition-all block border rounded-lg border-grayscale-700 p-7 group hover:border-gray-600 hover:shadow-card focus:shadow-card focus:border-gray-600 focus:outline-0"
                            href="https://docs.nango.dev/implementation-guides/api-auth/implement-api-auth"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <header className="flex justify-between">
                                <div className="flex gap-3 items-start">
                                    <h2>Authorize users from your app</h2>
                                </div>
                                <div className="rounded-full border border-grayscale-700 p-1.5 h-8 w-8">
                                    <IconBook stroke={1} size={18} />
                                </div>
                            </header>
                            <main>
                                <p className="text-sm text-grayscale-400">
                                    Learn how to embed Nango in your app to let users authorize 3rd-party APIs seamlessly.
                                </p>
                            </main>
                        </a>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
};
