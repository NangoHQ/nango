import { ChevronRight, ExternalLink } from 'lucide-react';
import React from 'react';
import { useFormContext } from 'react-hook-form';

import { Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@nangohq/design-system';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { KeyValueInput } from '../../../components/patterns/KeyValueInput';
import { ScopesInput } from '../../../components/patterns/ScopesInput';
import { BinaryToggle } from '../../../components/ui/BinaryToggle';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../../../components/ui/Form';
import { Separator } from '../../../components/ui/Separator';

import type { ConnectionFormData } from '../Create';

const CONNECT_SESSION_DOCS_URL = 'https://nango.dev/docs/reference/backend/http-api/connect/sessions/create';

interface ConnectionAdvancedConfigProps {
    isOauth2: boolean | undefined;
}

const RequiredLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <FormLabel>
            {children}
            <span className="text-text-danger">*</span>
        </FormLabel>
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
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-body-small-medium uppercase text-text-secondary">End User</h3>
                                    <Button asChild variant="link-accent" size="xs">
                                        <a href={CONNECT_SESSION_DOCS_URL} target="_blank" rel="noopener noreferrer">
                                            API reference
                                            <ExternalLink />
                                        </a>
                                    </Button>
                                </div>
                                <FormField
                                    control={control}
                                    name="testUserId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <RequiredLabel>ID</RequiredLabel>
                                            <FormControl>
                                                <Input placeholder="User ID" {...field} />
                                            </FormControl>
                                            <FormDescription>Uniquely identifies the end user.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={control}
                                    name="testUserEmail"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
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
                                            <FormLabel>Display Name</FormLabel>
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
                                            <FormLabel>Tags</FormLabel>
                                            <KeyValueInput
                                                initialValues={field.value}
                                                onChange={field.onChange}
                                                placeholderKey="Tag Name"
                                                placeholderValue="Tag Value"
                                            />
                                            <FormDescription>String values only, up to 64 keys.</FormDescription>
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
                                                        <FormLabel>Override authorization parameters</FormLabel>
                                                        <KeyValueInput
                                                            initialValues={field.value}
                                                            onChange={field.onChange}
                                                            placeholderKey="Param Name"
                                                            placeholderValue="Param Value"
                                                        />
                                                        <FormDescription>Query params passed to the OAuth flow.</FormDescription>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={control}
                                                name="overrideDevAppCredentials"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Override developer app credentials</FormLabel>
                                                        <BinaryToggle
                                                            value={field.value}
                                                            onChange={field.onChange}
                                                            offLabel="No override"
                                                            onLabel="End-user provided"
                                                            offTooltip="Use the OAuth credentials configured in the integration settings"
                                                            onTooltip="End users will provide their own OAuth client ID and secret"
                                                        />
                                                        <FormDescription>Let end users provide their own OAuth client ID and secret.</FormDescription>
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={control}
                                                name="overrideOauthScopes"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Override OAuth scopes</FormLabel>
                                                        <ScopesInput
                                                            scopesString={field.value}
                                                            onChange={(newScopes) => {
                                                                field.onChange(newScopes);
                                                                return Promise.resolve();
                                                            }}
                                                        />
                                                        <FormDescription>Replaces the scopes configured on the integration.</FormDescription>
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
                                                <FormLabel>Override webhook URL</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="https://example.com/webhooks-from-nango" {...field} />
                                                </FormControl>
                                                <FormDescription>
                                                    Sends this connection&apos;s webhooks here instead of the environment-wide URL. Useful for local
                                                    development.
                                                </FormDescription>
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
                                                    <FormLabel>Override end-user documentation URL</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="https://example.com/docs" {...field} />
                                                    </FormControl>
                                                    <FormDescription>
                                                        Replaces the documentation link shown in the Connect UI for this connection.
                                                    </FormDescription>
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
