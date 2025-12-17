import { CircleQuestionMark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { CopyButton } from '@/components-v2/CopyButton';
import { EditableInput } from '@/components-v2/EditableInput';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';
import { useEnvironment } from '@/hooks/useEnvironment';
import { apiPatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';

import type { GetIntegration, PatchIntegration } from '@nangohq/types';

export const SettingsTab: React.FC<{ data: GetIntegration['Success']['data'] }> = ({ data }) => {
    return (
        <div className="flex-1 flex flex-col gap-10">
            <SettingsGeneral data={data} />
        </div>
    );
};

export const SettingsGeneral: React.FC<{ data: GetIntegration['Success']['data'] }> = ({ data: { integration, meta, template } }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { environmentAndAccount } = useEnvironment(env);
    const navigate = useNavigate();

    const environment = environmentAndAccount?.environment;
    if (!environment) {
        return null;
    }

    const onSave = async (field: PatchIntegration['Body']) => {
        const updated = await apiPatchIntegration(env, integration.unique_key, field);
        if ('error' in updated.json) {
            toast({ title: updated.json.error.message || 'Failed to update, an error occurred', variant: 'error' });
        } else {
            toast({ title: 'Successfully updated', variant: 'success' });
        }
    };

    return (
        <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-2">
                <Label htmlFor="display_name">Display name</Label>
                <EditableInput initialValue={integration.display_name || template.display_name} onSave={(value) => onSave({ displayName: value })} />
            </div>
            <div className="flex flex-col gap-2">
                <Label htmlFor="unique_key">Integration ID</Label>
                <EditableInput
                    initialValue={integration.unique_key}
                    onSave={async (value) => {
                        await onSave({ integrationId: value });
                        navigate(`/${env}/integrations/${value}/settings`);
                    }}
                />
            </div>

            {template.webhook_routing_script && (
                // TODO: Toggle webhook forwards
                <>
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
                </>
            )}

            {template.webhook_user_defined_secret && (
                <div className="flex flex-col gap-2">
                    <div className="flex gap-2 items-center">
                        <Label htmlFor="incoming_webhook_secret">Webhook Secret</Label>
                        <InfoTooltip>Obtain the Webhook Secret from on the developer portal of the Integration Provider</InfoTooltip>
                    </div>
                    <EditableInput secret initialValue={integration.custom?.webhookSecret || ''} onSave={(value) => onSave({ webhookSecret: value })} />
                </div>
            )}
        </div>
    );
};

const InfoTooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <CircleQuestionMark className="size-4 text-text-tertiary" />
            </TooltipTrigger>
            <TooltipContent>{children}</TooltipContent>
        </Tooltip>
    );
};
