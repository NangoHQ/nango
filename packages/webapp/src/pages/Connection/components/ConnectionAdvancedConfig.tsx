import { ChevronRight } from 'lucide-react';
import React from 'react';
import { useFormContext } from 'react-hook-form';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/Collapsible';
import { InfoTooltip } from '../../../components-v2/InfoTooltip';
import { KeyValueInput } from '../../../components-v2/KeyValueInput';
import { ScopesInput } from '../../../components-v2/ScopesInput';
import { StyledLink } from '../../../components-v2/StyledLink';
import { BinaryToggle } from '../../../components-v2/ui/binary-toggle';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../../components-v2/ui/form';
import { Input } from '../../../components-v2/ui/input';
import { Separator } from '../../../components-v2/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components-v2/ui/card';

import type { ConnectionFormData } from '../Create';

interface ConnectionAdvancedConfigProps {
    isOauth2: boolean | undefined;
}

const FormLabelWithTooltip: React.FC<{
    children: React.ReactNode;
    required?: boolean;
    tooltip?: React.ReactNode;
}> = ({ children, required, tooltip }) => {
    return (
        <FormLabel className="flex gap-2 items-center">
            {children}
            {required && <span className="text-alert-400">*</span>}
            {tooltip && <InfoTooltip side="right">{tooltip}</InfoTooltip>}
        </FormLabel>
    );
};

export const ConnectionAdvancedConfig: React.FC<ConnectionAdvancedConfigProps> = ({ isOauth2 }) => {
    const { control } = useFormContext<ConnectionFormData>();

    // Hidden: docs_connect_url override is behind plans.can_override_docs_connect_url feature flag.
    // Set to true when we want to surface it with proper frontend feature flag support.
    const showDocsOverrideField = false;

    return (
        <Card className="bg-bg-elevated rounded border-none gap-2.5">
            <Collapsible>
                <CollapsibleTrigger className="" asChild>
                    <CardHeader className={'flex flex-row items-center justify-between p-6 [&[data-state=open]_svg]:rotate-90 cursor-pointer'}>
                        <div className="flex flex-col gap-1.5">
                            <CardTitle className={'text-text-primary'}>Advanced configuration</CardTitle>
                            <CardDescription className={'text-text-tertiary'}>Configure advanced settings for your connection</CardDescription>
                        </div>
                        <ChevronRight className="size-4.5 transition-transform duration-200" />
                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-8">
                    <CardContent className="flex flex-col gap-8">
                        <div className="flex flex-col gap-5">
                            <h3 className="text-body-small-medium uppercase text-text-secondary">End User</h3>
                            <FormField
                                control={control}
                                name="testUserId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabelWithTooltip
                                            required
                                            tooltip={
                                                <p>
                                                    Uniquely identifies the end user.
                                                    <br />
                                                    <StyledLink
                                                        to="https://nango.dev/docs/reference/api/connect/sessions/create#body-end-user-id"
                                                        type="external"
                                                        size="sm"
                                                        icon
                                                    >
                                                        Documentation
                                                    </StyledLink>
                                                </p>
                                            }
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
                                            tooltip={
                                                <p>
                                                    User&apos;s email.
                                                    <br />
                                                    <StyledLink
                                                        to="https://nango.dev/docs/reference/api/connect/sessions/create#body-end-user-email"
                                                        type="external"
                                                        size="sm"
                                                        icon
                                                    >
                                                        Documentation
                                                    </StyledLink>
                                                </p>
                                            }
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
                                            tooltip={
                                                <p>
                                                    User display name.
                                                    <br />
                                                    <StyledLink
                                                        to="https://nango.dev/docs/reference/api/connect/sessions/create#body-end-user-display-name"
                                                        type="external"
                                                        size="sm"
                                                        icon
                                                    >
                                                        Documentation
                                                    </StyledLink>
                                                </p>
                                            }
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
                                            tooltip={
                                                <p>
                                                    Tags associated with the end user. Only accepts strings values, up to 64 keys.
                                                    <br />
                                                    <StyledLink
                                                        to="https://nango.dev/docs/reference/api/connect/sessions/create"
                                                        type="external"
                                                        size="sm"
                                                        icon
                                                    >
                                                        Documentation
                                                    </StyledLink>
                                                </p>
                                            }
                                        >
                                            Tags
                                        </FormLabelWithTooltip>
                                        <KeyValueInput
                                            initialValues={field.value}
                                            onChange={field.onChange}
                                            placeholderKey="Tag Name"
                                            placeholderValue="Tag Value"
                                            alwaysShowEmptyRow={true}
                                        />
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {(isOauth2 || showDocsOverrideField) && (
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
                                                            tooltip={
                                                                <p>
                                                                    Query params passed to the OAuth flow (for OAuth2 only)
                                                                    <br />
                                                                    <StyledLink
                                                                        to="https://nango.dev/docs/reference/api/connect/sessions/create#body-integrations-config-defaults-additional-properties-authorization-params"
                                                                        type="external"
                                                                        size="sm"
                                                                        icon
                                                                    >
                                                                        Documentation
                                                                    </StyledLink>
                                                                </p>
                                                            }
                                                        >
                                                            Override authorization parameters
                                                        </FormLabelWithTooltip>
                                                        <KeyValueInput
                                                            initialValues={field.value}
                                                            onChange={field.onChange}
                                                            placeholderKey="Param Name"
                                                            placeholderValue="Param Value"
                                                            alwaysShowEmptyRow={true}
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
                                                            tooltip={
                                                                <p>
                                                                    Allow end users to provide their own OAuth client ID and secret.
                                                                    <br />
                                                                    <StyledLink
                                                                        to="https://nango.dev/docs/reference/api/connect/sessions/create#body-integrations-config-defaults-additional-properties-connection-config-oauth-client-id-override"
                                                                        type="external"
                                                                        size="sm"
                                                                        icon
                                                                    >
                                                                        Documentation
                                                                    </StyledLink>
                                                                </p>
                                                            }
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
                                                            tooltip={
                                                                <p>
                                                                    Override oauth scopes
                                                                    <br />
                                                                    <StyledLink
                                                                        to="https://nango.dev/docs/reference/api/connect/sessions/create#body-integrations-config-defaults-additional-properties-connection-config-oauth-scopes-override"
                                                                        type="external"
                                                                        size="sm"
                                                                        icon
                                                                    >
                                                                        Documentation
                                                                    </StyledLink>
                                                                </p>
                                                            }
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
                                    {showDocsOverrideField && (
                                        <FormField
                                            control={control}
                                            name="overrideDocUrl"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabelWithTooltip
                                                        tooltip={
                                                            <p>
                                                                Override the documentation URL we show on the Connect UI for this connection.
                                                                <br />
                                                                <StyledLink
                                                                    to="https://nango.dev/docs/reference/api/connect/sessions/create#body-overrides-additional-properties-docs-connect"
                                                                    type="external"
                                                                    size="sm"
                                                                    icon
                                                                >
                                                                    Documentation
                                                                </StyledLink>
                                                            </p>
                                                        }
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
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
};
