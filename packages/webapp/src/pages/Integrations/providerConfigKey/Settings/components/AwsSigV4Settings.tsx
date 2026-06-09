import { useState } from 'react';
import { mutate } from 'swr';

import { InfoBloc } from '../../../../../components/patterns/InfoBloc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../../components/ui/Select';
import { Button } from '../../../../../components/ui/button/Button';
import { Input } from '../../../../../components/ui/input/Input';
import SecretInput from '../../../../../components/ui/input/SecretInput';
import { usePatchIntegration } from '../../../../../hooks/useIntegration';
import { useToast } from '../../../../../hooks/useToast';
import { useStore } from '../../../../../store';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

function defaultAwsSigV4Config() {
    return {
        service: '',
        defaultRegion: '',
        stsMode: 'builtin' as 'builtin' | 'custom',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        stsEndpoint: {
            url: '',
            authType: 'none' as 'none' | 'api_key' | 'basic',
            header: 'x-api-key',
            value: '',
            username: '',
            password: ''
        }
    };
}

type AwsSigV4Config = ReturnType<typeof defaultAwsSigV4Config>;

const deserializeAwsSigV4Config = (raw?: string | null) => {
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        const base = defaultAwsSigV4Config();
        if (parsed.service) {
            base.service = parsed.service;
        }
        if (parsed.defaultRegion) {
            base.defaultRegion = parsed.defaultRegion;
        }
        if (parsed.stsMode === 'builtin' || parsed.stsMode === 'custom') {
            base.stsMode = parsed.stsMode;
        }
        if (parsed.stsEndpoint) {
            base.stsEndpoint.url = parsed.stsEndpoint.url || '';
            if (parsed.stsEndpoint.auth?.type === 'api_key') {
                base.stsEndpoint.authType = 'api_key';
                base.stsEndpoint.header = parsed.stsEndpoint.auth.header || 'x-api-key';
                // "***" means the secret is configured but redacted — show as empty so the user can leave it unchanged
                base.stsEndpoint.value = parsed.stsEndpoint.auth.value === '***' ? '' : parsed.stsEndpoint.auth.value || '';
            } else if (parsed.stsEndpoint.auth?.type === 'basic') {
                base.stsEndpoint.authType = 'basic';
                base.stsEndpoint.username = parsed.stsEndpoint.auth.username || '';
                base.stsEndpoint.password = parsed.stsEndpoint.auth.password === '***' ? '' : parsed.stsEndpoint.auth.password || '';
            }
        }
        return base;
    } catch {
        return null;
    }
};

export const AwsSigV4Settings: React.FC<{
    data: GetIntegration['Success']['data'];
    environment: ApiEnvironment;
}> = ({ data: { integration } }) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);

    const [awsSigV4Config, setAwsSigV4Config] = useState<AwsSigV4Config | null>(() => deserializeAwsSigV4Config(integration.custom?.['aws_sigv4_config']));
    const [loading, setLoading] = useState(false);

    // Single source of truth for the displayed/active STS mode. Without this, the Select would
    // fall back to 'builtin' while the conditional render branches separately, causing the
    // built-in dropdown to be shown alongside custom-mode form fields on a fresh integration.
    const effectiveStsMode: 'builtin' | 'custom' = awsSigV4Config?.stsMode ?? 'builtin';

    const hasAwsSigV4Values = (config: AwsSigV4Config | null) => {
        if (!config) {
            return false;
        }
        if (config.service || config.defaultRegion) {
            return true;
        }
        if (config.stsMode === 'builtin' && (config.awsAccessKeyId || config.awsSecretAccessKey)) {
            return true;
        }
        if (config.stsEndpoint.url) {
            return true;
        }
        if (config.stsEndpoint.authType === 'api_key' && (config.stsEndpoint.header || config.stsEndpoint.value)) {
            return true;
        }
        if (config.stsEndpoint.authType === 'basic' && (config.stsEndpoint.username || config.stsEndpoint.password)) {
            return true;
        }
        return false;
    };

    const buildAwsSigV4Payload = (config: AwsSigV4Config | null) => {
        if (!config) {
            return null;
        }

        if (!config.service) {
            return null;
        }

        if (config.stsMode === 'custom' && !config.stsEndpoint.url) {
            return null;
        }

        const payload: any = {
            service: config.service,
            defaultRegion: config.defaultRegion,
            stsMode: config.stsMode
        };

        if (config.stsMode === 'builtin') {
            // Omit credentials when empty — backend preserves the existing secret
            if (config.awsAccessKeyId) {
                payload.awsAccessKeyId = config.awsAccessKeyId;
            }
            if (config.awsSecretAccessKey) {
                payload.awsSecretAccessKey = config.awsSecretAccessKey;
            }
        } else {
            payload.stsEndpoint = {
                url: config.stsEndpoint.url
            };

            if (config.stsEndpoint.authType === 'api_key') {
                payload.stsEndpoint.auth = {
                    type: 'api_key',
                    header: config.stsEndpoint.header,
                    ...(config.stsEndpoint.value ? { value: config.stsEndpoint.value } : {})
                };
            } else if (config.stsEndpoint.authType === 'basic') {
                payload.stsEndpoint.auth = {
                    type: 'basic',
                    username: config.stsEndpoint.username,
                    ...(config.stsEndpoint.password ? { password: config.stsEndpoint.password } : {})
                };
            }
        }

        return JSON.stringify(payload);
    };

    const onSaveAwsSigV4 = async () => {
        const hasValues = hasAwsSigV4Values(awsSigV4Config);
        const payload = hasValues ? buildAwsSigV4Payload(awsSigV4Config) : null;
        if (hasValues && !payload) {
            toast({ title: awsSigV4Config?.stsMode === 'custom' ? 'Service and STS endpoint URL are required' : 'Service is required', variant: 'error' });
            return;
        }

        setLoading(true);
        try {
            await patchIntegration({
                custom: {
                    aws_sigv4_config: payload ?? ''
                }
            });
            toast({
                title: payload ? 'Successfully updated AWS SigV4 settings' : 'Removed AWS SigV4 settings',
                variant: 'success'
            });
            if (!payload) {
                setAwsSigV4Config(null);
            }
            void mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/integrations/${integration.unique_key}`));
        } catch {
            toast({ title: 'Failed to update, an error occurred', variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 gap-10">
            <InfoBloc title="AWS SigV4 Settings" help={<p>Configure how this integration issues temporary AWS credentials.</p>}>
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-white font-semibold">AWS Service</label>
                            <Input
                                value={awsSigV4Config?.service || ''}
                                onChange={(e) =>
                                    setAwsSigV4Config((prev) => ({
                                        ...(prev || defaultAwsSigV4Config()),
                                        service: e.target.value
                                    }))
                                }
                                placeholder="e.g. s3"
                                variant={'flat'}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-white font-semibold">STS Mode</label>
                            <Select
                                value={effectiveStsMode}
                                onValueChange={(value: string) =>
                                    setAwsSigV4Config((prev) => ({
                                        ...(prev || defaultAwsSigV4Config()),
                                        stsMode: value as 'builtin' | 'custom'
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="builtin">Built-in AWS STS</SelectItem>
                                    <SelectItem value="custom">Custom STS Endpoint</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {effectiveStsMode === 'builtin' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-white font-semibold">AWS Access Key ID</label>
                                <SecretInput
                                    value={awsSigV4Config?.awsAccessKeyId || ''}
                                    onChange={(e) =>
                                        setAwsSigV4Config((prev) => ({
                                            ...(prev || defaultAwsSigV4Config()),
                                            awsAccessKeyId: e.target.value
                                        }))
                                    }
                                    placeholder="AKIA..."
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-white font-semibold">AWS Secret Access Key</label>
                                <SecretInput
                                    value={awsSigV4Config?.awsSecretAccessKey || ''}
                                    onChange={(e) =>
                                        setAwsSigV4Config((prev) => ({
                                            ...(prev || defaultAwsSigV4Config()),
                                            awsSecretAccessKey: e.target.value
                                        }))
                                    }
                                    placeholder="Secret access key"
                                />
                            </div>
                        </div>
                    )}

                    {effectiveStsMode === 'custom' && (
                        <>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-white font-semibold">STS Endpoint URL</label>
                                <Input
                                    value={awsSigV4Config?.stsEndpoint.url || ''}
                                    onChange={(e) =>
                                        setAwsSigV4Config((prev) => ({
                                            ...(prev || defaultAwsSigV4Config()),
                                            stsEndpoint: { ...(prev?.stsEndpoint || defaultAwsSigV4Config().stsEndpoint), url: e.target.value }
                                        }))
                                    }
                                    placeholder="https://sts.example.com/assume"
                                    variant={'flat'}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-white font-semibold">Auth Type</label>
                                    <Select
                                        value={awsSigV4Config?.stsEndpoint.authType || 'none'}
                                        onValueChange={(value: string) =>
                                            setAwsSigV4Config((prev) => ({
                                                ...(prev || defaultAwsSigV4Config()),
                                                stsEndpoint: {
                                                    ...(prev?.stsEndpoint || defaultAwsSigV4Config().stsEndpoint),
                                                    authType: value as 'none' | 'api_key' | 'basic'
                                                }
                                            }))
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            <SelectItem value="api_key">API Key</SelectItem>
                                            <SelectItem value="basic">Basic</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {awsSigV4Config?.stsEndpoint.authType === 'api_key' && (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-white font-semibold">Header</label>
                                            <Input
                                                value={awsSigV4Config?.stsEndpoint.header || ''}
                                                onChange={(e) =>
                                                    setAwsSigV4Config((prev) => ({
                                                        ...(prev || defaultAwsSigV4Config()),
                                                        stsEndpoint: {
                                                            ...(prev?.stsEndpoint || defaultAwsSigV4Config().stsEndpoint),
                                                            header: e.target.value
                                                        }
                                                    }))
                                                }
                                                placeholder="x-api-key"
                                                variant={'flat'}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-white font-semibold">Value</label>
                                            <SecretInput
                                                value={awsSigV4Config?.stsEndpoint.value || ''}
                                                onChange={(e) =>
                                                    setAwsSigV4Config((prev) => ({
                                                        ...(prev || defaultAwsSigV4Config()),
                                                        stsEndpoint: {
                                                            ...(prev?.stsEndpoint || defaultAwsSigV4Config().stsEndpoint),
                                                            value: e.target.value
                                                        }
                                                    }))
                                                }
                                                placeholder="API key"
                                            />
                                        </div>
                                    </>
                                )}

                                {awsSigV4Config?.stsEndpoint.authType === 'basic' && (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-white font-semibold">Username</label>
                                            <Input
                                                value={awsSigV4Config?.stsEndpoint.username || ''}
                                                onChange={(e) =>
                                                    setAwsSigV4Config((prev) => ({
                                                        ...(prev || defaultAwsSigV4Config()),
                                                        stsEndpoint: {
                                                            ...(prev?.stsEndpoint || defaultAwsSigV4Config().stsEndpoint),
                                                            username: e.target.value
                                                        }
                                                    }))
                                                }
                                                placeholder="Username"
                                                variant={'flat'}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-white font-semibold">Password</label>
                                            <SecretInput
                                                value={awsSigV4Config?.stsEndpoint.password || ''}
                                                onChange={(e) =>
                                                    setAwsSigV4Config((prev) => ({
                                                        ...(prev || defaultAwsSigV4Config()),
                                                        stsEndpoint: {
                                                            ...(prev?.stsEndpoint || defaultAwsSigV4Config().stsEndpoint),
                                                            password: e.target.value
                                                        }
                                                    }))
                                                }
                                                placeholder="Password"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    <div className="flex justify-end">
                        <Button variant={'primary'} onClick={onSaveAwsSigV4} isLoading={loading}>
                            Save AWS SigV4 Settings
                        </Button>
                    </div>
                </div>
            </InfoBloc>
        </div>
    );
};
