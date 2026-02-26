import { useState } from 'react';
import { mutate } from 'swr';

import { InfoBloc } from '../../../../../components/InfoBloc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../../components/ui/Select';
import { Button } from '../../../../../components/ui/button/Button';
import { Input } from '../../../../../components/ui/input/Input';
import SecretInput from '../../../../../components/ui/input/SecretInput';
import { apiPatchIntegration } from '../../../../../hooks/useIntegration';
import { useToast } from '../../../../../hooks/useToast';
import { useStore } from '../../../../../store';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

interface AwsSigV4TemplateParam {
    key: string;
    value: string;
}
interface AwsSigV4Template {
    id: string;
    label: string;
    description: string;
    stackName: string;
    templateUrl: string;
    templateBody: string;
    parameters: AwsSigV4TemplateParam[];
}

type TemplateStringField = 'id' | 'label' | 'description' | 'stackName' | 'templateUrl' | 'templateBody';
type TemplateParamField = 'key' | 'value';

const defaultAwsSigV4Template = (): AwsSigV4Template => ({
    id: '',
    label: '',
    description: '',
    stackName: '',
    templateUrl: '',
    templateBody: '',
    parameters: []
});

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
        },
        templates: [] as AwsSigV4Template[]
    };
}

type AwsSigV4Config = ReturnType<typeof defaultAwsSigV4Config>;

const validateAwsSigV4Templates = (templates: AwsSigV4Template[]): string | null => {
    for (let i = 0; i < templates.length; i += 1) {
        const template = templates[i];
        const id = (template.id || '').trim();
        if (!id) {
            return `Template ${i + 1} is missing an ID`;
        }
        const hasUrl = Boolean(template.templateUrl && template.templateUrl.trim().length > 0);
        if (!hasUrl) {
            return `Template "${id}" needs a template URL`;
        }
    }
    return null;
};

const extractCloudFormationParameterKeys = (rawBody: string): string[] => {
    try {
        const parsed = JSON.parse(rawBody);
        const parameters = parsed?.Parameters;
        if (parameters && typeof parameters === 'object' && !Array.isArray(parameters)) {
            return Object.keys(parameters).filter((key) => typeof key === 'string' && key.trim().length > 0);
        }
    } catch {
        // Ignore parse errors; auto-hydration is best-effort.
    }
    return [];
};

const hydrateTemplateParameters = (template: AwsSigV4Template, body: string) => {
    const keys = extractCloudFormationParameterKeys(body);
    if (keys.length > 0) {
        const existingKeys = new Set(template.parameters.map((p) => p.key));
        const newParams = keys.filter((key) => !existingKeys.has(key)).map((key) => ({ key, value: '' }));
        if (newParams.length > 0) {
            template.parameters = [...template.parameters, ...newParams];
        }
    }
};

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
                base.stsEndpoint.value = parsed.stsEndpoint.auth.value === '***' ? '' : (parsed.stsEndpoint.auth.value || '');
            } else if (parsed.stsEndpoint.auth?.type === 'basic') {
                base.stsEndpoint.authType = 'basic';
                base.stsEndpoint.username = parsed.stsEndpoint.auth.username || '';
                base.stsEndpoint.password = parsed.stsEndpoint.auth.password === '***' ? '' : (parsed.stsEndpoint.auth.password || '');
            }
        }
        if (Array.isArray(parsed.templates)) {
            base.templates = parsed.templates
                .map((template: any) => {
                    if (!template || typeof template !== 'object') {
                        return null;
                    }
                    const normalized = defaultAwsSigV4Template();
                    normalized.id = typeof template.id === 'string' ? template.id : '';
                    normalized.label = typeof template.label === 'string' ? template.label : '';
                    normalized.description = typeof template.description === 'string' ? template.description : '';
                    normalized.stackName = typeof template.stackName === 'string' ? template.stackName : template.stack_name || '';
                    normalized.templateUrl = typeof template.templateUrl === 'string' ? template.templateUrl : template.template_url || '';
                    normalized.templateBody = typeof template.templateBody === 'string' ? template.templateBody : template.template_body || '';
                    if (template.parameters && typeof template.parameters === 'object') {
                        normalized.parameters = Object.entries(template.parameters)
                            .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
                            .map(([key, value]) => ({ key, value: value as string }));
                    }
                    if (!normalized.id && !normalized.templateBody) {
                        return null;
                    }
                    return normalized;
                })
                .filter(Boolean) as AwsSigV4Template[];
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

    const [awsSigV4Config, setAwsSigV4Config] = useState<AwsSigV4Config | null>(() => deserializeAwsSigV4Config(integration.custom?.['aws_sigv4_config']));
    const [loading, setLoading] = useState(false);
    const [loadingTemplateIndex, setLoadingTemplateIndex] = useState<number | null>(null);

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
        return config.templates.length > 0;
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

        if (config.templates && config.templates.length > 0) {
            const templates = config.templates
                .map((template) => {
                    if (!template.id || !template.templateUrl) {
                        return null;
                    }
                    const normalized: Record<string, any> = {
                        id: template.id,
                        label: template.label,
                        description: template.description,
                        stackName: template.stackName,
                        templateUrl: template.templateUrl
                    };
                    if (template.parameters && template.parameters.length > 0) {
                        const params = template.parameters
                            .filter((param) => param.key && typeof param.value === 'string')
                            .reduce<Record<string, string>>((acc, param) => {
                                acc[param.key] = param.value;
                                return acc;
                            }, {});
                        if (Object.keys(params).length > 0) {
                            normalized.parameters = params;
                        }
                    }
                    return normalized;
                })
                .filter(Boolean);
            if (templates.length > 0) {
                payload.templates = templates;
            }
        }

        return JSON.stringify(payload);
    };

    const onSaveAwsSigV4 = async () => {
        if (awsSigV4Config?.templates?.length) {
            const templateValidationError = validateAwsSigV4Templates(awsSigV4Config.templates);
            if (templateValidationError) {
                toast({ title: templateValidationError, variant: 'error' });
                return;
            }
        }

        const hasValues = hasAwsSigV4Values(awsSigV4Config);
        const payload = hasValues ? buildAwsSigV4Payload(awsSigV4Config) : null;
        if (hasValues && !payload) {
            toast({ title: awsSigV4Config?.stsMode === 'custom' ? 'Service and STS endpoint URL are required' : 'Service is required', variant: 'error' });
            return;
        }

        setLoading(true);
        const updated = await apiPatchIntegration(env, integration.unique_key, {
            custom: {
                aws_sigv4_config: payload ?? ''
            }
        });
        setLoading(false);
        if ('error' in updated.json) {
            toast({ title: updated.json.error.message || 'Failed to update, an error occurred', variant: 'error' });
        } else {
            toast({
                title: payload ? 'Successfully updated AWS SigV4 settings' : 'Removed AWS SigV4 settings',
                variant: 'success'
            });
            if (!payload) {
                setAwsSigV4Config(null);
            }
            void mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/integrations/${integration.unique_key}`));
        }
    };

    const addAwsSigV4Template = () => {
        setAwsSigV4Config((prev) => {
            const base = prev ? { ...prev } : defaultAwsSigV4Config();
            const templates = [...base.templates, defaultAwsSigV4Template()];
            return { ...base, templates };
        });
    };

    const removeAwsSigV4Template = (index: number) => {
        setAwsSigV4Config((prev) => {
            if (!prev) {
                return prev;
            }
            const templates = prev.templates.filter((_, i) => i !== index);
            return { ...prev, templates };
        });
    };

    const updateAwsSigV4TemplateField = (index: number, field: TemplateStringField, value: string) => {
        setAwsSigV4Config((prev) => {
            const base = prev ? { ...prev } : defaultAwsSigV4Config();
            const templates = [...base.templates];
            const template = { ...(templates[index] || defaultAwsSigV4Template()) };
            template[field] = value;
            templates[index] = template;
            return { ...base, templates };
        });
    };

    const updateAwsSigV4TemplateParam = (templateIndex: number, paramIndex: number, field: TemplateParamField, value: string) => {
        setAwsSigV4Config((prev) => {
            const base = prev ? { ...prev } : defaultAwsSigV4Config();
            const templates = [...base.templates];
            const template = { ...(templates[templateIndex] || defaultAwsSigV4Template()) };
            const parameters = [...template.parameters];
            parameters[paramIndex] = { ...parameters[paramIndex], [field]: value };
            template.parameters = parameters;
            templates[templateIndex] = template;
            return { ...base, templates };
        });
    };

    const addAwsSigV4TemplateParam = (templateIndex: number) => {
        setAwsSigV4Config((prev) => {
            const base = prev ? { ...prev } : defaultAwsSigV4Config();
            const templates = [...base.templates];
            const template = { ...(templates[templateIndex] || defaultAwsSigV4Template()) };
            template.parameters = [...template.parameters, { key: '', value: '' }];
            templates[templateIndex] = template;
            return { ...base, templates };
        });
    };

    const removeAwsSigV4TemplateParam = (templateIndex: number, paramIndex: number) => {
        setAwsSigV4Config((prev) => {
            if (!prev) {
                return prev;
            }
            const templates = [...prev.templates];
            const template = { ...(templates[templateIndex] || defaultAwsSigV4Template()) };
            template.parameters = template.parameters.filter((_, i) => i !== paramIndex);
            templates[templateIndex] = template;
            return { ...prev, templates };
        });
    };

    const loadAwsSigV4TemplateFromUrl = async (index: number) => {
        const url = awsSigV4Config?.templates?.[index]?.templateUrl;
        if (!url) {
            toast({ title: 'Template URL is required', variant: 'error' });
            return;
        }
        setLoadingTemplateIndex(index);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch template (${response.status})`);
            }
            const body = await response.text();
            setAwsSigV4Config((prev) => {
                if (!prev) {
                    return prev;
                }
                const templates = [...prev.templates];
                const template = { ...(templates[index] || defaultAwsSigV4Template()) };
                template.templateBody = body;
                hydrateTemplateParameters(template, body);
                templates[index] = template;
                return { ...prev, templates };
            });
            toast({ title: 'Template loaded', variant: 'success' });
        } catch (err: any) {
            toast({ title: err?.message || 'Failed to load template', variant: 'error' });
        } finally {
            setLoadingTemplateIndex(null);
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
                                value={awsSigV4Config?.stsMode || 'builtin'}
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

                    {awsSigV4Config?.stsMode === 'builtin' && (
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

                    {(!awsSigV4Config?.stsMode || awsSigV4Config.stsMode === 'custom') && (
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

                    <div className="flex flex-col gap-2">
                        <div>
                            <label className="text-xs text-white font-semibold">CloudFormation Templates (optional)</label>
                            <p className="text-xs text-text-soft">
                                Store one or more named templates for this integration. They will appear in Connect as one-click deployment buttons for
                                your customers.
                            </p>
                        </div>
                        <div className="flex flex-col gap-4">
                            {awsSigV4Config?.templates && awsSigV4Config.templates.length > 0 ? (
                                awsSigV4Config.templates.map((template, index) => (
                                    <div key={`template-${index}`} className="border border-subtle rounded-md p-4 flex flex-col gap-3 bg-[#0f1117]">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-white">{template.label || `Template ${index + 1}`}</p>
                                            <Button variant="danger" size="xs" type="button" onClick={() => removeAwsSigV4Template(index)}>
                                                Remove template
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs text-text-soft font-semibold">Template ID</label>
                                                <Input
                                                    value={template.id}
                                                    onChange={(e) => updateAwsSigV4TemplateField(index, 'id', e.target.value)}
                                                    placeholder="s3-readonly"
                                                    variant="flat"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs text-text-soft font-semibold">Display Label</label>
                                                <Input
                                                    value={template.label}
                                                    onChange={(e) => updateAwsSigV4TemplateField(index, 'label', e.target.value)}
                                                    placeholder="AWS S3 Read Only"
                                                    variant="flat"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs text-text-soft font-semibold">Description</label>
                                                <Input
                                                    value={template.description}
                                                    onChange={(e) => updateAwsSigV4TemplateField(index, 'description', e.target.value)}
                                                    placeholder="Allows read-only access to the shared bucket"
                                                    variant="flat"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs text-text-soft font-semibold">Stack Name (optional)</label>
                                                <Input
                                                    value={template.stackName}
                                                    onChange={(e) => updateAwsSigV4TemplateField(index, 'stackName', e.target.value)}
                                                    placeholder="NangoSigV4Stack"
                                                    variant="flat"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-text-soft font-semibold">Template URL</label>
                                            <div className="flex gap-2">
                                                <Input
                                                    value={template.templateUrl}
                                                    onChange={(e) => updateAwsSigV4TemplateField(index, 'templateUrl', e.target.value)}
                                                    placeholder="https://..."
                                                    variant="flat"
                                                />
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    className="shrink-0"
                                                    type="button"
                                                    onClick={() => loadAwsSigV4TemplateFromUrl(index)}
                                                    isLoading={loadingTemplateIndex === index}
                                                >
                                                    Load template
                                                </Button>
                                            </div>
                                            <p className="text-[11px] text-text-soft">
                                                Provide a public template URL. We will fetch it, extract parameter keys, and pre-fill them below.
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs text-text-soft font-semibold">Default Parameters</label>
                                            <div className="flex flex-col gap-2">
                                                {template.parameters.length === 0 && (
                                                    <p className="text-[11px] text-text-soft">No parameters configured.</p>
                                                )}
                                                {template.parameters.map((param, paramIndex) => (
                                                    <div key={`${template.id}-param-${paramIndex}`} className="grid grid-cols-[1fr_auto] gap-2">
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <Input
                                                                value={param.key}
                                                                onChange={(e) => updateAwsSigV4TemplateParam(index, paramIndex, 'key', e.target.value)}
                                                                placeholder="BucketName"
                                                                variant="flat"
                                                            />
                                                            <Input
                                                                value={param.value}
                                                                onChange={(e) =>
                                                                    updateAwsSigV4TemplateParam(index, paramIndex, 'value', e.target.value)
                                                                }
                                                                placeholder=""
                                                                variant="flat"
                                                            />
                                                        </div>
                                                        <Button
                                                            variant="zombieGray"
                                                            size="xs"
                                                            type="button"
                                                            onClick={() => removeAwsSigV4TemplateParam(index, paramIndex)}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                            <Button variant="zinc" size="xs" type="button" onClick={() => addAwsSigV4TemplateParam(index)}>
                                                Add parameter
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-text-soft">No templates configured.</p>
                            )}
                            <Button variant="zinc" size="xs" type="button" onClick={addAwsSigV4Template}>
                                Add template
                            </Button>
                        </div>
                    </div>

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
