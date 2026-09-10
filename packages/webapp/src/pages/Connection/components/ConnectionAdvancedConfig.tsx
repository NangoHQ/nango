import { ChevronRight } from 'lucide-react';
import React from 'react';
import { useFormContext } from 'react-hook-form';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@nangohq/design-system';

import { DocsIconLink } from '@/components/patterns/DocsIconLink';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { KeyValueInput } from '../../../components/patterns/KeyValueInput';
import { ScopesInput } from '../../../components/patterns/ScopesInput';
import { BinaryToggle } from '../../../components/ui/BinaryToggle';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../../components/ui/Form';
import { InfoTooltip } from '../../../components/ui/InfoTooltip';
import { Separator } from '../../../components/ui/Separator';

import type { ConnectionFormData } from '../Create';

interface ConnectionAdvancedConfigProps {
    isOauth2: boolean | undefined;
}

const FormLabelWithTooltip: React.FC<{
    children: React.ReactNode;
    required?: boolean;
    tooltip?: React.ReactNode;
    docsHref?: string;
    docsLabel?: string;
}> = ({ children, required, tooltip, docsHref, docsLabel }) => {
    return (
        <div className="flex items-center gap-2">
            <FormLabel>
                {children}
                {required && <span className="text-text-danger">*</span>}
            </FormLabel>
            {tooltip && <InfoTooltip side="right">{tooltip}</InfoTooltip>}
            {docsHref && docsLabel && <DocsIconLink href={docsHref} label={docsLabel} />}
        </div>
    );
};

export const ConnectionAdvancedConfig: React.FC<ConnectionAdvancedConfigProps> = ({ isOauth2 }) => {
    const { control } = useFormContext<ConnectionFormData>();

    // Hidden: docs_connect_url override is behind plans.can_override_docs_connect_url feature flag.
    // Set to true when we want to surface it with proper frontend feature flag support.
    const showDocsOverrideField = false;

    return (
        <Card>
            <Collapsible>
                <CollapsibleTrigger className="w-full cursor-pointer text-left [&[data-state=open]_svg]:rotate-90" asChild>
                    <CardHeader>
                        <CardTitle>Advanced configuration</CardTitle>
                        <CardDescription>Configure advanced settings for your connection</CardDescription>
                        <CardAction>
                            <ChevronRight className="size-4.5 transition-transform duration-200" />
                        </CardAction>
                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-8">
                    <CardContent>
                        <div className="flex flex-col gap-8">
                            <div className="flex flex-col gap-5">
                                <h3 className="text-body-small-medium uppercase text-text-secondary">End User</h3>
                                <FormField
                                    control={control}
                                    name="testUserId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabelWithTooltip
                                                required
                                                tooltip="Uniquely identifies the end user."
                                                docsHref="https://nango.dev/docs/reference/backend/http-api/connect/sessions/create#body-end-user-id"
                                                docsLabel="End user ID documentation"
                                            >
                                                ID
                                            </FormLabelWithTooltip>
                                            <FormControl>
                                                <Input placeholder="User ID" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={control}
                                    name="testUserEmail"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabelWithTooltip
                                                tooltip="User's email."
                                                docsHref="https://nango.dev/docs/reference/backend/http-api/connect/sessions/create#body-end-user-email"
                                                docsLabel="End user email documentation"
                                            >
                                                Email
                                            </FormLabelWithTooltip>
                                            <FormControl>
                                                <Input placeholder="you@email.com" autoComplete="email" type="email" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={control}
                                    name="testUserName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabelWithTooltip
                                                tooltip="User display name."
                                                docsHref="https://nango.dev/docs/reference/backend/http-api/connect/sessions/create#body-end-user-display-name"
                                                docsLabel="End user display name documentation"
                                            >
                                                Display Name
                                            </FormLabelWithTooltip>
                                            <FormControl>
                                                <Input placeholder="Display name" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={control}
                                    name="testUserTags"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabelWithTooltip
                                                tooltip="Tags associated with the end user. Only accepts strings values, up to 64 keys."
                                                docsHref="https://nango.dev/docs/reference/backend/http-api/connect/sessions/create"
                                                docsLabel="End user tags documentation"
                                            >
                                                Tags
                                            </FormLabelWithTooltip>
                                            <KeyValueInput
                                                initialValues={field.value}
                                                onChange={field.onChange}
                                                placeholderKey="Tag Name"
                                                placeholderValue="Tag Value"
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <>
                                <Separator className="bg-border-muted" />

                                <div className="flex flex-col gap-5">
                                    <h3 className="text-body-small-medium uppercase text-text-secondary">Overrides</h3>
                                    {isOauth2 && (
                                        <>
                                            <FormField
                                                control={control}
                                                name="overrideAuthParams"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabelWithTooltip
                                                            tooltip="Query params passed to the OAuth flow (for OAuth2 only)"
                                                            docsHref="https://nango.dev/docs/reference/backend/http-api/connect/sessions/create#body-integrations-config-defaults-additional-properties-authorization-params"
                                                            docsLabel="Authorization parameters documentation"
                                                        >
                                                            Override authorization parameters
                                                        </FormLabelWithTooltip>
                                                        <KeyValueInput
                                                            initialValues={field.value}
                                                            onChange={field.onChange}
                                                            placeholderKey="Param Name"
                                                            placeholderValue="Param Value"
                                                        />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={control}
                                                name="overrideDevAppCredentials"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabelWithTooltip
                                                            tooltip="Allow end users to provide their own OAuth client ID and secret."
                                                            docsHref="https://nango.dev/docs/reference/backend/http-api/connect/sessions/create#body-integrations-config-defaults-additional-properties-connection-config-oauth-client-id-override"
                                                            docsLabel="Developer app credential override documentation"
                                                        >
                                                            Override developer app credentials
                                                        </FormLabelWithTooltip>
                                                        <BinaryToggle
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                            offLabel="No override"
                                                            onLabel="End-user provided"
                                                            offTooltip="Use the OAuth credentials configured in the integration settings"
                                                            onTooltip="End users will provide their own OAuth client ID and secret"
                                                        />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={control}
                                                name="overrideOauthScopes"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabelWithTooltip
                                                            tooltip="Override OAuth scopes."
                                                            docsHref="https://nango.dev/docs/reference/backend/http-api/connect/sessions/create#body-integrations-config-defaults-additional-properties-connection-config-oauth-scopes-override"
                                                            docsLabel="OAuth scope override documentation"
                                                        >
                                                            Override OAuth scopes
                                                        </FormLabelWithTooltip>
                                                        <ScopesInput
                                                            scopesString={field.value}
                                                            onChange={(newScopes) => {
                                                                field.onChange(newScopes);
                                                                return Promise.resolve();
                                                            }}
                                                        />
                                                    </FormItem>
                                                )}
                                            />
                                        </>
                                    )}
                                    <FormField
                                        control={control}
                                        name="overrideWebhookUrl"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabelWithTooltip
                                                    tooltip={
                                                        <p>
                                                            Deliver this connection&apos;s webhooks to a different URL than the environment-wide webhook URL.
                                                            Useful for routing a single connection&apos;s events to a development tunnel.
                                                        </p>
                                                    }
                                                >
                                                    Override webhook URL
                                                </FormLabelWithTooltip>
                                                <FormControl>
                                                    <Input placeholder="https://example.com/webhooks-from-nango" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {showDocsOverrideField && (
                                        <FormField
                                            control={control}
                                            name="overrideDocUrl"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabelWithTooltip
                                                        tooltip="Override the documentation URL we show on the Connect UI for this connection."
                                                        docsHref="https://nango.dev/docs/reference/backend/http-api/connect/sessions/create#body-overrides-additional-properties-docs-connect"
                                                        docsLabel="Connect UI documentation override documentation"
                                                    >
                                                        Override end-user documentation URL
                                                    </FormLabelWithTooltip>
                                                    <FormControl>
                                                        <Input placeholder="https://example.com/docs" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>
                            </>
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
};
