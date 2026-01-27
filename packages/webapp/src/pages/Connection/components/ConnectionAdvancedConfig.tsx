import { ChevronRight } from 'lucide-react';
import React from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/Collapsible';
import { InfoTooltip } from '../../../components-v2/InfoTooltip';
import { KeyValueInput } from '../../../components-v2/KeyValueInput';
import { ScopesInput } from '../../../components-v2/ScopesInput';
import { StyledLink } from '../../../components-v2/StyledLink';
import { BinaryToggle } from '../../../components-v2/ui/binary-toggle';
import { Input } from '../../../components-v2/ui/input';
import { Label } from '../../../components-v2/ui/label';
import { Separator } from '../../../components-v2/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components-v2/ui/card';
import { cn } from '@/utils/utils';

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

// Lightweight form components that match the styling of react-hook-form's Form components.
// We use these instead of the actual Form components because this component uses controlled
// inputs (useState) passed from the parent, rather than react-hook-form's FormProvider context.
const FormItem = ({ children, className }: { children: React.ReactNode; className?: string }) => {
    return <div className={cn('grid gap-2', className)}>{children}</div>;
};

const FormLabel = ({
    children,
    htmlFor,
    required,
    tooltip
}: {
    children: React.ReactNode;
    htmlFor?: string;
    required?: boolean;
    tooltip?: React.ReactNode;
}) => {
    return (
        <Label htmlFor={htmlFor} className="flex gap-2 items-center">
            {children}
            {required && <span className="text-alert-400">*</span>}
            {tooltip && <InfoTooltip side="right">{tooltip}</InfoTooltip>}
        </Label>
    );
};

// Error message component matching FormMessage styling
const FormError = ({ message }: { message?: string }) => {
    if (!message) {
        return null;
    }
    return <p className="text-feedback-error-fg text-body-small-regular">{message}</p>;
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
                            <FormItem>
                                <FormLabel
                                    htmlFor="test_user_id"
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
                                </FormLabel>
                                <Input
                                    id="test_user_id"
                                    placeholder="User ID"
                                    value={testUserId}
                                    onChange={(e) => setTestUserId(e.target.value)}
                                    aria-invalid={!!errors.testUserId}
                                />
                                <FormError message={errors.testUserId?.[0]} />
                            </FormItem>
                            <FormItem>
                                <FormLabel
                                    htmlFor="test_user_email"
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
                                </FormLabel>
                                <Input
                                    id="test_user_email"
                                    placeholder="you@email.com"
                                    autoComplete="email"
                                    type="email"
                                    value={testUserEmail}
                                    onChange={(e) => setTestUserEmail(e.target.value)}
                                    aria-invalid={!!errors.testUserEmail}
                                />
                                <FormError message={errors.testUserEmail?.[0]} />
                            </FormItem>
                            <FormItem>
                                <FormLabel
                                    htmlFor="test_user_display_name"
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
                                </FormLabel>
                                <Input
                                    id="test_user_display_name"
                                    placeholder="Display name"
                                    value={testUserName}
                                    onChange={(e) => setTestUserName(e.target.value)}
                                    aria-invalid={!!errors.testUserName}
                                />
                                <FormError message={errors.testUserName?.[0]} />
                            </FormItem>
                            <FormItem>
                                <FormLabel
                                    tooltip={
                                        <p>
                                            Tags associated with the end user. Only accepts strings values, up to 64 keys.
                                            <br />
                                            <StyledLink to="https://nango.dev/docs/reference/api/connect/sessions/create" type="external" size="sm" icon>
                                                Documentation
                                            </StyledLink>
                                        </p>
                                    }
                                >
                                    Tags
                                </FormLabel>
                                <KeyValueInput
                                    initialValues={testUserTags}
                                    onChange={setTestUserTags}
                                    placeholderKey="Tag Name"
                                    placeholderValue="Tag Value"
                                    alwaysShowEmptyRow={true}
                                />
                                <FormError message={errors.testUserTags?.[0]} />
                            </FormItem>
                        </div>

                        {(isOauth2 || showDocsOverrideField) && (
                            <>
                                <Separator className="bg-border-muted" />

                                <div className="flex flex-col gap-5">
                                    <h3 className="text-body-small-medium uppercase text-text-secondary">Overrides</h3>
                                    <FormItem>
                                        <FormLabel
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
                                        </FormLabel>
                                        <KeyValueInput
                                            initialValues={overrideAuthParams}
                                            onChange={setOverrideAuthParams}
                                            placeholderKey="Param Name"
                                            placeholderValue="Param Value"
                                            alwaysShowEmptyRow={true}
                                        />
                                    </FormItem>
                                    <FormItem>
                                        <FormLabel
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
                                        </FormLabel>
                                        <BinaryToggle
                                            value={overrideDevAppCredentials}
                                            onChange={setOverrideDevAppCredentials}
                                            offLabel="No override"
                                            onLabel="End-user provided"
                                            offTooltip="Use the OAuth credentials configured in the integration settings"
                                            onTooltip="End users will provide their own OAuth client ID and secret"
                                        />
                                    </FormItem>
                                    <FormItem>
                                        <FormLabel
                                            htmlFor="override_scopes"
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
                                        </FormLabel>
                                        <ScopesInput
                                            scopesString={overrideOauthScopes}
                                            onChange={(newScopes) => {
                                                setOverrideOauthScopes(newScopes);
                                                return Promise.resolve();
                                            }}
                                        />
                                    </FormItem>
                                    {showDocsOverrideField && (
                                        <FormItem>
                                            <FormLabel
                                                htmlFor="override_doc_url"
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
                                            </FormLabel>
                                            <Input
                                                id="override_doc_url"
                                                placeholder="https://example.com/docs"
                                                value={overrideDocUrl}
                                                onChange={(e) => setOverrideDocUrl(e.target.value)}
                                                aria-invalid={!!errors.overrideDocUrl}
                                            />
                                            <FormError message={errors.overrideDocUrl?.[0]} />
                                        </FormItem>
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
