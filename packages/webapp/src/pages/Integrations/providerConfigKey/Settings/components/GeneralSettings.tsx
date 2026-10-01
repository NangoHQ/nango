import { AlertTriangle, Info } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Alert, AlertDescription, FieldLabel, InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { EditableInput } from '@/components/patterns/EditableInput';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { CopyButton } from '@/components/ui/CopyButton';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Switch } from '@/components/ui/Switch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { validateNotEmpty } from '@/pages/Integrations/utils';
import { useStore } from '@/store';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const GeneralSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, meta, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const navigate = useNavigate();
    const { confirm, DialogComponent } = useConfirmDialog();
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);

    const { can } = usePermissions();
    const canEdit = can('environment:integrations:update', environment);

    const [isEditingIntegrationId, setIsEditingIntegrationId] = useState(false);

    const [webhookForwarding, setWebhookForwarding] = useState(integration.forward_webhooks);
    const [allowUnverifiedWebhooks, setAllowUnverifiedWebhooks] = useState(integration.allow_unverified_webhooks);

    const onSave = async (field: PatchIntegration['Body']) => {
        try {
            await patchIntegration(field);
            toast({ title: 'Successfully updated', variant: 'success' });
        } catch {
            const message = 'Failed to update, an error occurred';
            toast({ title: message, variant: 'error' });
            throw new Error(message);
        }
    };

    const handleWebhookForwardingChange = async (checked: boolean) => {
        // If enabling, save directly
        if (checked) {
            await onSave({ forward_webhooks: true });
            setWebhookForwarding(true);
            return;
        }

        // If disabling, show confirmation dialog
        const confirmed = await confirm({
            icon: <AlertTriangle />,
            title: 'Disable Webhook Forwarding?',
            description: 'Disabling webhook forwarding will stop forwarding incoming webhooks to your configured endpoint. Are you sure you want to continue?',
            confirmButtonText: 'Disable',
            confirmVariant: 'danger',
            onConfirm: async () => {
                await onSave({ forward_webhooks: false });
                setWebhookForwarding(false);
            }
        });

        // If user cancelled, don't do anything (switch will remain in previous state)
        if (!confirmed) {
            return;
        }
    };

    const handleAllowUnverifiedWebhooksChange = async (checked: boolean) => {
        if (!checked) {
            await onSave({ allow_unverified_webhooks: false });
            setAllowUnverifiedWebhooks(false);
            return;
        }

        await confirm({
            icon: <AlertTriangle />,
            title: 'Allow unverified webhooks?',
            description:
                'Webhooks without a signature will be processed and forwarded. Anyone who knows your webhook URL could send events that look like they came from the provider. Webhooks with an invalid signature are still rejected.',
            confirmButtonText: 'Allow',
            confirmVariant: 'danger',
            onConfirm: async () => {
                await onSave({ allow_unverified_webhooks: true });
                setAllowUnverifiedWebhooks(true);
            }
        });
    };

    return (
        <div className="flex flex-col gap-10">
            {/* Display name */}
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="display_name">Display name</FieldLabel>
                <EditableInput
                    initialValue={integration.display_name || template.display_name}
                    onSave={(value) => onSave({ displayName: value })}
                    validate={validateNotEmpty}
                    canEdit={canEdit}
                />
            </div>

            {/* Integration ID */}
            <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="unique_key">Integration ID</FieldLabel>
                <EditableInput
                    initialValue={integration.unique_key}
                    hintText="Must only contain letters, numbers, underscores and dashes."
                    validate={(value) => {
                        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                            return 'Must only contain letters, numbers, underscores and dashes.';
                        }
                        return null;
                    }}
                    onEditingChange={(isEditing) => {
                        setIsEditingIntegrationId(isEditing);
                    }}
                    onSave={async (value) => {
                        await onSave({ integrationId: value });
                        navigate(`/${env}/integrations/${value}/settings`);
                    }}
                    canEdit={canEdit}
                />
                {isEditingIntegrationId && (
                    <Alert variant="info">
                        <Info />
                        <AlertDescription>You won&apos;t be able to change the integration ID if the integration has any active connections.</AlertDescription>
                    </Alert>
                )}
            </div>

            {/* Webhook settings */}
            {template.webhook_routing_script && (
                <>
                    <div className="flex gap-5 items-center">
                        <FieldLabel htmlFor="webhook_forwarding">Webhook Forwarding</FieldLabel>
                        <PermissionGate asChild condition={canEdit}>
                            {(allowed) => (
                                <div className="flex items-center">
                                    <Switch
                                        name="webhook_forwarding"
                                        checked={webhookForwarding}
                                        onCheckedChange={handleWebhookForwardingChange}
                                        disabled={!allowed}
                                    />
                                </div>
                            )}
                        </PermissionGate>
                    </div>
                    {meta.canAllowUnverifiedWebhooks && (
                        <div className="flex gap-5 items-center">
                            <div className="flex gap-2 items-center">
                                <FieldLabel htmlFor="allow_unverified_webhooks">Allow unverified webhooks</FieldLabel>
                                <InfoTooltip>
                                    Process webhooks that are missing a signature or that Nango cannot verify. Webhooks with an invalid signature are always
                                    rejected.
                                </InfoTooltip>
                            </div>
                            <PermissionGate asChild condition={canEdit}>
                                {(allowed) => (
                                    <div className="flex items-center">
                                        <Switch
                                            id="allow_unverified_webhooks"
                                            name="allow_unverified_webhooks"
                                            checked={allowUnverifiedWebhooks}
                                            onCheckedChange={handleAllowUnverifiedWebhooksChange}
                                            disabled={!allowed}
                                        />
                                    </div>
                                )}
                            </PermissionGate>
                        </div>
                    )}
                    {/* Webhook URL */}
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                            <FieldLabel htmlFor="webhook_url">Webhook URL</FieldLabel>
                            <InfoTooltip>
                                Register this webhook URL on the developer portal of the Integration Provider to receive incoming webhooks
                            </InfoTooltip>
                        </div>
                        <InputGroup>
                            <InputGroupInput disabled value={`${environment.webhook_receive_url}/${integration.unique_key}`} />
                            <InputGroupAddon align="inline-end">
                                <CopyButton text={`${environment.webhook_receive_url}/${integration.unique_key}`} />
                            </InputGroupAddon>
                        </InputGroup>
                    </div>

                    {/* Webhook Secret */}
                    {meta.webhookSecret && (
                        <div className="flex flex-col gap-2">
                            <div className="flex gap-2 items-center">
                                <FieldLabel htmlFor="webhook_secret">Webhook Secret</FieldLabel>
                                <InfoTooltip>Input this secret into the &quot;Webhook secret (optional)&quot; field in the Webhook section</InfoTooltip>
                            </div>
                            <InputGroup>
                                <InputGroupInput disabled value={meta.webhookSecret} />
                                <InputGroupAddon align="inline-end">
                                    <CopyButton text={meta.webhookSecret} />
                                </InputGroupAddon>
                            </InputGroup>
                        </div>
                    )}

                    {/* User-defined webhook secret */}
                    {template.webhook_user_defined_secret && (
                        <div className="flex flex-col gap-2">
                            <div className="flex gap-2 items-center">
                                <FieldLabel htmlFor="incoming_webhook_secret">Webhook Secret</FieldLabel>
                                <InfoTooltip>Obtain the Webhook Secret from on the developer portal of the Integration Provider</InfoTooltip>
                            </div>
                            <EditableInput
                                secret
                                initialValue={integration.custom?.webhookSecret || ''}
                                onSave={(value) => onSave({ webhookSecret: value })}
                                canEdit={canEdit}
                                canRead={canEdit}
                            />
                        </div>
                    )}
                </>
            )}

            {/* Confirmation Dialog */}
            {DialogComponent}
        </div>
    );
};
