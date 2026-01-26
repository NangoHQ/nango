import { AlertTriangle, Info } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { InfoTooltip } from './InfoTooltip';
import { CopyButton } from '@/components-v2/CopyButton';
import { EditableInput } from '@/components-v2/EditableInput';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';
import { Switch } from '@/components-v2/ui/switch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { apiPatchIntegration } from '@/hooks/useIntegration';
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

    const [isEditingIntegrationId, setIsEditingIntegrationId] = useState(false);

    const [webhookForwarding, setWebhookForwarding] = useState(integration.forward_webhooks);

    const onSave = async (field: PatchIntegration['Body']) => {
        const updated = await apiPatchIntegration(env, integration.unique_key, field);
        if ('error' in updated.json) {
            const errorMessage = updated.json.error.message || 'Failed to update, an error occurred';
            toast({ title: errorMessage, variant: 'error' });
            throw new Error(errorMessage);
        } else {
            toast({ title: 'Successfully updated', variant: 'success' });
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
            confirmVariant: 'destructive',
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

    return (
        <div className="flex flex-col gap-10">
            {/* Display name */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="display_name">Display name</Label>
                <EditableInput
                    initialValue={integration.display_name || template.display_name}
                    onSave={(value) => onSave({ displayName: value })}
                    validate={validateNotEmpty}
                />
            </div>

            {/* Integration ID */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="unique_key">Integration ID</Label>
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
                        <Label htmlFor="webhook_forwarding">Webhook Forwarding</Label>
                        <Switch name="webhook_forwarding" checked={webhookForwarding} onCheckedChange={handleWebhookForwardingChange} />
                    </div>
                    {/* Webhook URL */}
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                            <Label htmlFor="webhook_url">Webhook URL</Label>
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
                                <Label htmlFor="webhook_secret">Webhook Secret</Label>
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
                                <Label htmlFor="incoming_webhook_secret">Webhook Secret</Label>
                                <InfoTooltip>Obtain the Webhook Secret from on the developer portal of the Integration Provider</InfoTooltip>
                            </div>
                            <EditableInput secret initialValue={integration.custom?.webhookSecret || ''} onSave={(value) => onSave({ webhookSecret: value })} />
                        </div>
                    )}
                </>
            )}

            {/* Confirmation Dialog */}
            {DialogComponent}
        </div>
    );
};
