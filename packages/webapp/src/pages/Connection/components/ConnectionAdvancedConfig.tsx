import { IconChevronRight, IconHelpCircle } from '@tabler/icons-react';
import React from 'react';
import { Link } from 'react-router-dom';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/Collapsible';
import { KeyValueInput } from '../../../components-v2/KeyValueInput';
import { ScopesInput } from '../../../components-v2/ScopesInput';
import { BinaryToggle } from '../../../components-v2/ui/binary-toggle';
import { Input } from '../../../components-v2/ui/input';
import { Separator } from '../../../components-v2/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components-v2/ui/tooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components-v2/ui/card';

interface ConnectionAdvancedConfigProps {
    testUserId: string;
    setTestUserId: (value: string) => void;
    testUserEmail: string;
    setTestUserEmail: (value: string) => void;
    testUserName: string;
    setTestUserName: (value: string) => void;
    testUserTags: Record<string, string>;
    setTestUserTags: (value: Record<string, string>) => void;
    overrideAuthParams: Record<string, string>;
    setOverrideAuthParams: (value: Record<string, string>) => void;
    overrideOauthScopes: string | undefined;
    setOverrideOauthScopes: (value: string | undefined) => void;
    overrideDevAppCredentials: boolean;
    setOverrideDevAppCredentials: (value: boolean) => void;
    overrideDocUrl: string | undefined;
    setOverrideDocUrl: (value: string) => void;
    isOauth2: boolean | undefined;
    errors: Record<string, string[] | undefined>;
}

const ErrorMessage = ({ message }: { message?: string }) => {
    if (!message) {
        return null;
    }
    return <p className="text-xs text-feedback-error-text mt-1">{message}</p>;
};

export const ConnectionAdvancedConfig: React.FC<ConnectionAdvancedConfigProps> = ({
    testUserId,
    setTestUserId,
    testUserEmail,
    setTestUserEmail,
    testUserName,
    setTestUserName,
    testUserTags,
    setTestUserTags,
    overrideAuthParams,
    setOverrideAuthParams,
    overrideOauthScopes,
    setOverrideOauthScopes,
    overrideDevAppCredentials,
    setOverrideDevAppCredentials,
    overrideDocUrl,
    setOverrideDocUrl,
    isOauth2,
    errors
}) => {
    return (
        <Card className={'dark:bg-bg-elevated rounded dark:border-neutral-900 gap-2.5'}>
            <Collapsible>
                <CollapsibleTrigger className="" asChild>
                    <CardHeader className={'flex flex-row items-center justify-between p-6 [&[data-state=open]_svg]:rotate-90 cursor-pointer'}>
                        <div className="flex flex-col gap-1.5">
                            <CardTitle>Advanced configuration</CardTitle>
                            <CardDescription>Configure advanced settings for your connection</CardDescription>
                        </div>
                        <IconChevronRight size={18} stroke={1} className="transition-transform duration-200" />
                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-8">
                    <CardContent className="flex flex-col gap-8">
                        <div className="flex flex-col gap-4">
                            <h3 className="text-xs font-medium uppercase text-text-secondary">End User</h3>
                            <div className="flex flex-col gap-4">
                                <label htmlFor="test_user_id" className="flex gap-2 items-center text-sm font-medium">
                                    ID
                                    <span className="text-alert-400">*</span>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right" align="center">
                                            <p className="text-s">
                                                Uniquely identifies the end user.
                                                <br />
                                                <Link
                                                    to="https://nango.dev/docs/reference/api/connect/sessions/create#body-end-user-id"
                                                    className="underline"
                                                    target="_blank"
                                                >
                                                    Documentation
                                                </Link>
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </label>
                                <Input
                                    id="test_user_id"
                                    placeholder="User ID"
                                    value={testUserId}
                                    onChange={(e) => setTestUserId(e.target.value)}
                                    aria-invalid={!!errors.testUserId}
                                />
                                <ErrorMessage message={errors.testUserId?.[0]} />
                            </div>
                            <div className="flex flex-col gap-4">
                                <label htmlFor="test_user_email" className="flex gap-2 items-center text-sm font-medium">
                                    Email
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right" align="center">
                                            <p className="text-s">
                                                User&apos;s email.
                                                <br />
                                                <Link
                                                    to="https://nango.dev/docs/reference/api/connect/sessions/create#body-end-user-email"
                                                    className="underline"
                                                    target="_blank"
                                                >
                                                    Documentation
                                                </Link>
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </label>
                                <Input
                                    id="test_user_email"
                                    placeholder="you@email.com"
                                    autoComplete="email"
                                    type="email"
                                    value={testUserEmail}
                                    onChange={(e) => setTestUserEmail(e.target.value)}
                                    aria-invalid={!!errors.testUserEmail}
                                />
                                <ErrorMessage message={errors.testUserEmail?.[0]} />
                            </div>
                            <div className="flex flex-col gap-4">
                                <label htmlFor="test_user_display_name" className="flex gap-2 items-center text-sm font-medium">
                                    Display Name
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right" align="center">
                                            <p className="text-s">
                                                User display name.
                                                <br />
                                                <Link
                                                    to="https://nango.dev/docs/reference/api/connect/sessions/create#body-end-user-display-name"
                                                    className="underline"
                                                    target="_blank"
                                                >
                                                    Documentation
                                                </Link>
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </label>
                                <Input
                                    id="test_user_display_name"
                                    placeholder="Display name"
                                    value={testUserName}
                                    onChange={(e) => setTestUserName(e.target.value)}
                                    aria-invalid={!!errors.testUserName}
                                />
                                <ErrorMessage message={errors.testUserName?.[0]} />
                            </div>
                            <div className="flex flex-col gap-4">
                                <label className="flex gap-2 items-center text-sm font-medium">
                                    Tags
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right" align="center">
                                            <p className="text-s">
                                                Tags associated with the end user. Only accepts strings values, up to 64 keys.
                                                <br />
                                                <Link to="https://nango.dev/docs/reference/api/connect/sessions/create" className="underline" target="_blank">
                                                    Documentation
                                                </Link>
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </label>
                                <KeyValueInput initialValues={testUserTags} onChange={setTestUserTags} placeholderKey="Tag Name" placeholderValue="Tag Value" />
                                <ErrorMessage message={errors.testUserTags?.[0]} />
                            </div>
                        </div>

                        <Separator className="bg-border-muted" />

                        <div className="flex flex-col gap-4">
                            <h3 className="text-xs font-large uppercase text-text-secondary">Overrides</h3>
                            {isOauth2 && (
                                <>
                                    <div className="flex flex-col gap-4">
                                        <label className="flex gap-2 items-center text-sm font-medium">
                                            Override authorization parameters
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                </TooltipTrigger>
                                                <TooltipContent side="right" align="center">
                                                    <p className="text-s">
                                                        Query params passed to the OAuth flow (for OAuth2 only)
                                                        <br />
                                                        <Link
                                                            to="https://nango.dev/docs/reference/api/connect/sessions/create#body-integrations-config-defaults-additional-properties-authorization-params"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </label>
                                        <KeyValueInput
                                            initialValues={overrideAuthParams}
                                            onChange={setOverrideAuthParams}
                                            placeholderKey="Param Name"
                                            placeholderValue="Param Value"
                                            alwaysShowEmptyRow={true}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label className="flex gap-2 items-center text-sm font-medium">
                                            Override developer app credentials
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                </TooltipTrigger>
                                                <TooltipContent side="right" align="center">
                                                    <p className="text-s">
                                                        Allow end users to provide their own OAuth client ID and secret.
                                                        <br />
                                                        <Link
                                                            to="https://nango.dev/docs/reference/api/connect/sessions/create#body-integrations-config-defaults-additional-properties-connection-config-oauth-client-id-override"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </label>
                                        <BinaryToggle
                                            value={overrideDevAppCredentials}
                                            onChange={setOverrideDevAppCredentials}
                                            offLabel="No override"
                                            onLabel="End-user provided"
                                            offTooltip="Use the OAuth credentials configured in the integration settings"
                                            onTooltip="End users will provide their own OAuth client ID and secret"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <label htmlFor="override_scopes" className="flex gap-2 items-center text-sm font-medium">
                                            Override OAuth scopes
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                </TooltipTrigger>
                                                <TooltipContent side="right" align="center">
                                                    <p className="text-s">
                                                        Override oauth scopes
                                                        <br />
                                                        <Link
                                                            to="https://nango.dev/docs/reference/api/connect/sessions/create#body-integrations-config-defaults-additional-properties-connection-config-oauth-scopes-override"
                                                            className="underline"
                                                            target="_blank"
                                                        >
                                                            Documentation
                                                        </Link>
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </label>
                                        <ScopesInput
                                            scopesString={overrideOauthScopes}
                                            onChange={(newScopes) => {
                                                setOverrideOauthScopes(newScopes);
                                                return Promise.resolve();
                                            }}
                                        />
                                    </div>
                                </>
                            )}
                            <div className="flex flex-col gap-4">
                                <label htmlFor="override_doc_url" className="flex gap-2 items-center text-sm font-medium">
                                    Override end-user documentation URL
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                        </TooltipTrigger>
                                        <TooltipContent side="right" align="center">
                                            <p className="text-s">
                                                Override the documentation URL we show on the Connect UI for this connection.
                                                <br />
                                                <Link
                                                    to="https://nango.dev/docs/reference/api/connect/sessions/create#body-overrides-additional-properties-docs-connect"
                                                    className="underline"
                                                    target="_blank"
                                                >
                                                    Documentation
                                                </Link>
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </label>
                                <Input
                                    id="override_doc_url"
                                    placeholder="https://example.com/docs"
                                    value={overrideDocUrl}
                                    onChange={(e) => setOverrideDocUrl(e.target.value)}
                                    aria-invalid={!!errors.overrideDocUrl}
                                />
                                <ErrorMessage message={errors.overrideDocUrl?.[0]} />
                            </div>
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
};
