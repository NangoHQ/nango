import { Braces } from 'lucide-react';

import { permissions } from '@nangohq/authz';
import { FieldLabel } from '@nangohq/design-system';

import { ScopesInput } from '@/components/patterns/ScopesInput';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { usePatchConnectionConfig, usePostConnectionMetadata } from '@/hooks/useConnections';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { parseJsonObject, validateJsonString } from '../utils';

import type { ConnectionConfig, Metadata } from '@nangohq/types';

const JSON_DISPLAY_LIMIT = 250_000;

const EditableJsonSection = ({
    title,
    json,
    canEdit,
    tooLarge,
    onSave,
    confirmBeforeSave
}: {
    title: string;
    json: string;
    canEdit: boolean;
    tooLarge: boolean;
    onSave: (value: Record<string, unknown>) => Promise<void>;
    confirmBeforeSave?: { title: string; description: string };
}) => {
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();

    if (tooLarge) {
        return (
            <div className="flex flex-col gap-2">
                <FieldLabel>{title}</FieldLabel>
                <CodeBlock language="json" displayLanguage="JSON" icon={<Braces />} code={`${title} too large to display`} />
            </div>
        );
    }

    return (
        <>
            {DialogComponent}
            <div className="flex flex-col gap-2">
                <FieldLabel>{title}</FieldLabel>
                <CodeBlock
                    key={json}
                    language="json"
                    displayLanguage="JSON"
                    icon={<Braces />}
                    code={json}
                    canEdit={canEdit}
                    validate={validateJsonString}
                    onSave={async (value) => {
                        const parsed = parseJsonObject(value);

                        const save = async () => {
                            try {
                                await onSave(parsed);
                                toast({ title: 'Successfully updated', variant: 'success' });
                            } catch {
                                toast({ title: 'Failed to update', variant: 'error' });
                                throw new Error('save failed');
                            }
                        };

                        if (confirmBeforeSave) {
                            const confirmed = await confirm({
                                title: confirmBeforeSave.title,
                                description: confirmBeforeSave.description,
                                confirmButtonText: 'Save',
                                onConfirm: save
                            });
                            if (!confirmed) {
                                throw new Error('Cancelled');
                            }
                            return;
                        }

                        await save();
                    }}
                />
            </div>
        </>
    );
};

export const ConnectionExtras = ({
    connectionId,
    providerConfigKey,
    config,
    metadata,
    rawTokenResponse
}: {
    connectionId: string;
    providerConfigKey: string;
    config: ConnectionConfig;
    metadata: Metadata | null;
    rawTokenResponse: Record<string, unknown> | null;
}) => {
    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environment = data?.environmentAndAccount?.environment;
    const { can } = usePermissions();
    const canEditConnection = can(permissions.canWriteProdConnections) || !environment?.is_production;

    const { mutateAsync: postConnectionMetadata } = usePostConnectionMetadata();
    const { mutateAsync: patchConnectionConfig } = usePatchConnectionConfig();

    const configJson = JSON.stringify(config || {}, null, 4);
    const metadataJson = JSON.stringify(metadata || {}, null, 4);
    const rawTokenResponseJson = JSON.stringify(rawTokenResponse || {}, null, 4);
    const shouldBlurRawTokenResponse = rawTokenResponseJson !== '{}';

    return (
        <>
            {config.oauth_scopes_override && (
                <div className="flex flex-col gap-2">
                    <FieldLabel>OAuth scopes override</FieldLabel>
                    <ScopesInput scopesString={config.oauth_scopes_override.join(',')} placeholder="Scopes override" readOnly />
                </div>
            )}

            <EditableJsonSection
                title="Connection configuration"
                json={configJson}
                canEdit={canEditConnection}
                tooLarge={configJson.length >= JSON_DISPLAY_LIMIT}
                confirmBeforeSave={{
                    title: 'Update connection configuration?',
                    description:
                        'Incorrect configuration can break this connection. Existing configuration will be overwritten. Are you sure you want to save these changes?'
                }}
                onSave={async (connectionConfig) => {
                    await patchConnectionConfig({
                        params: { connectionId },
                        query: { env, provider_config_key: providerConfigKey },
                        body: { connection_config: connectionConfig }
                    });
                }}
            />

            <EditableJsonSection
                title="Connection metadata"
                json={metadataJson}
                canEdit={canEditConnection}
                tooLarge={metadataJson.length >= JSON_DISPLAY_LIMIT}
                confirmBeforeSave={{
                    title: 'Update connection metadata?',
                    description:
                        'Incorrect metadata can change the behavior of the connection. Existing metadata will be overwritten. Are you sure you want to save these changes?'
                }}
                onSave={async (nextMetadata) => {
                    await postConnectionMetadata({
                        params: { connectionId },
                        query: { env, provider_config_key: providerConfigKey },
                        body: { metadata: nextMetadata }
                    });
                }}
            />

            {rawTokenResponse !== null && (
                <div className="flex flex-col gap-2">
                    <FieldLabel>Raw token response</FieldLabel>
                    <CodeBlock
                        secret={shouldBlurRawTokenResponse}
                        language="json"
                        displayLanguage="JSON"
                        icon={<Braces />}
                        code={rawTokenResponseJson.length < JSON_DISPLAY_LIMIT ? rawTokenResponseJson : 'Raw token response too large to display'}
                    />
                </div>
            )}
        </>
    );
};
