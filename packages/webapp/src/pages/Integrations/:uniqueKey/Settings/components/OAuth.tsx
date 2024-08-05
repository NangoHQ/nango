import type { GetIntegration } from '@nangohq/types';
import { CopyButton } from '../../../../../components/ui/button/CopyButton';
import { defaultCallback } from '../../../../../utils/utils';
import type { EnvironmentAndAccount } from '@nangohq/server';
import SecretInput from '../../../../../components/ui/input/SecretInput';
import * as Tooltip from '../../../../../components/ui/Tooltip';
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import Button from '../../../../../components/ui/button/Button';
import { InfoBloc } from '../../../../../components/InfoBloc';
import { Input } from '../../../../../components/ui/input/Input';
import { useState } from 'react';
import { DeleteIntegrationButton } from './Delete';
import { useStore } from '../../../../../store';

export const SettingsOAuth: React.FC<{ data: GetIntegration['Success']['data']; environment: EnvironmentAndAccount['environment'] }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const [loading, setLoading] = useState(false);

    const onSave = () => {
        setLoading(true);
        setLoading(false);
    };

    return (
        <div className="mt-10">
            <InfoBloc title="Callback URL">
                <div className="text-white text-sm">{environment.callback_url || defaultCallback()}</div>
                <CopyButton text={environment.callback_url || defaultCallback()} />
            </InfoBloc>

            {integration.unique_key && template.webhook_routing_script && (
                <>
                    <div className="flex flex-col">
                        <div className="flex items-center mb-1">
                            <div className="text-gray-400 text-xs uppercase">Webhook Url</div>

                            <Tooltip.Tooltip delayDuration={0}>
                                <Tooltip.TooltipTrigger asChild>
                                    <Button variant="icon">
                                        <QuestionMarkCircledIcon />
                                    </Button>
                                </Tooltip.TooltipTrigger>
                                <Tooltip.TooltipContent>
                                    <div className="flex text-white text-sm">
                                        <p>Register this webhook URL on the developer portal of the Integration Provider to receive incoming webhooks.</p>
                                    </div>
                                </Tooltip.TooltipContent>
                            </Tooltip.Tooltip>
                        </div>
                        <div className="flex text-white items-center gap-2">
                            <div className="text-white">{`${environment.webhook_receive_url}/${integration.unique_key}`}</div>
                            <CopyButton text={`${environment.webhook_receive_url}/${integration.unique_key}`} />
                        </div>
                    </div>
                    {template.webhook_user_defined_secret && (
                        <div className="flex flex-col w-full">
                            <div className="flex items-center mb-1">
                                <div className="text-gray-400 text-xs uppercase">Webhook Secret</div>
                                <Tooltip.Tooltip delayDuration={0}>
                                    <Tooltip.TooltipTrigger asChild>
                                        <Button variant="icon">
                                            <QuestionMarkCircledIcon />
                                        </Button>
                                    </Tooltip.TooltipTrigger>
                                    <Tooltip.TooltipContent>
                                        <div className="flex text-white text-sm">
                                            <p>{`Obtain the Webhook Secret from on the developer portal of the Integration Provider.`}</p>
                                        </div>
                                    </Tooltip.TooltipContent>
                                </Tooltip.Tooltip>
                            </div>
                            <div className="flex text-white w-full">
                                <SecretInput
                                    copy={true}
                                    id="incoming_webhook_secret"
                                    name="incoming_webhook_secret"
                                    autoComplete="one-time-code"
                                    defaultValue={integration ? integration.custom?.webhookSecret : ''}
                                    additionalclass={`w-full`}
                                    required
                                />
                            </div>
                        </div>
                    )}
                </>
            )}

            <div className="flex flex-col gap-10 mt-10">
                <InfoBloc title="Client ID">
                    <Input
                        id="client_id"
                        name="client_id"
                        type="text"
                        defaultValue={integration ? integration.oauth_client_id : ''}
                        autoComplete="one-time-code"
                        placeholder="Find the Client ID on the developer portal of the external API provider."
                        required
                        minLength={1}
                        variant={'flat'}
                        after={<CopyButton text={integration.oauth_client_id} />}
                    />
                </InfoBloc>
                <InfoBloc title="Client Secret">
                    <SecretInput
                        copy={true}
                        id="client_secret"
                        name="client_secret"
                        autoComplete="one-time-code"
                        placeholder="Find the Client Secret on the developer portal of the external API provider."
                        defaultValue={integration ? integration.oauth_client_secret : ''}
                        required
                    />
                </InfoBloc>
                <div className="flex justify-between">
                    {integration && <DeleteIntegrationButton env={env} integration={integration} />}
                    <Button variant={'primary'} onClick={onSave} isLoading={loading}>
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
};
