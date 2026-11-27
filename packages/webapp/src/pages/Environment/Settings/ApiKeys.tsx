import { ArrowRight, ChevronRight, CircleCheck, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import {
    Alert,
    AlertDescription,
    Button,
    CopyButton,
    copyText,
    Field,
    FieldError,
    InlineCode,
    Input,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    LinkButton,
    SecretInput
} from '@nangohq/design-system';

import { DestructiveActionModal } from '@/components/patterns/DestructiveActionModal';
import { PERMISSION_DENIED_REASON } from '@/components/patterns/PermissionGate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { usePermissions } from '@/hooks/usePermissions';
import { formatRelativeTime } from '@/utils/dates';
import { useApiKeys, useCreateApiKey, useDeleteApiKey, useUpdateApiKey } from '../../../hooks/useApiKeys';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { countSelectedScopes, ScopesPicker } from './components/ScopesPicker';
import { SettingsCard, SettingsRow } from './components/SettingsCard';
import { renameLegacyScopes } from './scope-logic';
import { apiErrorMessage, secretKeyEnvVar, settingsPath } from './utils';

import type { ApiKeyListItem } from '../../../hooks/useApiKeys';

const FULL_ACCESS = 'environment:*';

function formatFullDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function isFullAccess(scopes: string[]): boolean {
    return scopes.includes(FULL_ACCESS);
}

function accessLabel(scopes: string[]): string {
    if (isFullAccess(scopes)) return 'Full access';
    const count = countSelectedScopes(scopes);
    return `Custom · ${count} scope${count === 1 ? '' : 's'}`;
}

function sameScopes(a: string[], b: string[]): boolean {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

const KeyBreadcrumb: React.FC<{ current: string; onBack: () => void }> = ({ current, onBack }) => (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 type-text-medium-md text-text-strong">
        <button type="button" onClick={onBack} className="focus-default rounded-ds-xs type-text-regular-md text-text-secondary hover:text-text-default">
            API keys
        </button>
        <ChevronRight className="size-3.5 shrink-0 text-icon-muted" />
        <span aria-current="page" className="truncate">
            {current}
        </span>
    </nav>
);

const AccessFields: React.FC<{ scopes: string[]; onChange: (scopes: string[]) => void; readOnly: boolean; showEmptyError: boolean }> = ({
    scopes,
    onChange,
    readOnly,
    showEmptyError
}) => {
    const full = isFullAccess(scopes);
    return (
        <>
            <SettingsRow label="Access" htmlFor="key-access">
                <div>
                    <Select value={full ? 'full' : 'custom'} onValueChange={(v) => onChange(v === 'full' ? [FULL_ACCESS] : [])} disabled={readOnly}>
                        <SelectTrigger id="key-access" aria-label="Access" className="h-8 w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="full">Full access</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </SettingsRow>
            {!full && (
                <div className="border-t border-border-muted pt-5">
                    <ScopesPicker selected={scopes} onChange={onChange} readOnly={readOnly} showEmptyError={showEmptyError} />
                </div>
            )}
        </>
    );
};

interface KeyPageProps {
    apiKey: ApiKeyListItem;
    env: string;
    onBack: () => void;
    canReadSecret: boolean;
    canManageKeys: boolean;
    canDeleteKeys: boolean;
}

const KeyPage: React.FC<KeyPageProps> = ({ apiKey, env, onBack, canReadSecret, canManageKeys, canDeleteKeys }) => {
    const savedScopes = renameLegacyScopes(apiKey.scopes);
    const [scopes, setScopes] = useState<string[]>(savedScopes);
    const [name, setName] = useState(apiKey.display_name);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const { mutateAsync: updateApiKey, isPending } = useUpdateApiKey(env);
    const { mutateAsync: deleteApiKey } = useDeleteApiKey(env);
    const { toast } = useToast();

    const nameChanged = name.trim() !== apiKey.display_name;
    const scopesChanged = !sameScopes(scopes, savedScopes);
    const nameError = name.trim() ? null : 'Give the key a name.';

    const onSave = async () => {
        try {
            await updateApiKey({
                keyId: apiKey.id,
                ...(nameChanged && { display_name: name.trim() }),
                ...(scopesChanged && { scopes })
            });
            toast({ title: 'API key updated', variant: 'success' });
        } catch (err) {
            toast({ title: apiErrorMessage(err, 'Failed to update API key'), variant: 'error' });
        }
    };

    const onDelete = async () => {
        try {
            await deleteApiKey(apiKey.id);
            toast({ title: 'API key deleted', variant: 'success' });
            onBack();
        } catch (err) {
            toast({ title: apiErrorMessage(err, 'Failed to delete API key'), variant: 'error' });
        }
    };

    return (
        <div className="flex max-w-205 flex-col gap-5">
            <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <KeyBreadcrumb current={apiKey.display_name} onBack={onBack} />
                    {canDeleteKeys && (
                        <DestructiveActionModal
                            title="Delete API key?"
                            description={
                                <>
                                    Any service using <strong className="text-text-strong">{apiKey.display_name}</strong> loses access immediately. This
                                    can&apos;t be undone.
                                </>
                            }
                            confirmationKeyword={apiKey.display_name}
                            confirmButtonText="Delete API key"
                            trigger={
                                <Button variant="danger-ghost" size="sm">
                                    <Trash2 />
                                    Delete API key
                                </Button>
                            }
                            onConfirm={onDelete}
                            open={deleteOpen}
                            onOpenChange={setDeleteOpen}
                        />
                    )}
                </div>
                <p className="type-text-regular-xs text-text-muted">
                    Created <span className="text-text-secondary">{formatFullDate(apiKey.created_at)}</span> · Last used{' '}
                    <span className="text-text-secondary" title={formatFullDate(apiKey.last_used_at)}>
                        {formatRelativeTime(apiKey.last_used_at)}
                    </span>
                </p>
            </div>

            <SettingsCard
                dirty={nameChanged || scopesChanged}
                invalid={!!nameError || scopes.length === 0}
                saving={isPending}
                canEdit={canManageKeys}
                onSave={onSave}
                onDiscard={() => {
                    setName(apiKey.display_name);
                    setScopes(savedScopes);
                }}
            >
                <SettingsRow label="Name" htmlFor="key-name">
                    <Field data-invalid={!!nameError}>
                        <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManageKeys} aria-invalid={!!nameError} />
                        {nameError && <FieldError>{nameError}</FieldError>}
                    </Field>
                </SettingsRow>
                <SettingsRow label="Key ID" htmlFor="key-id">
                    <InputGroup>
                        <InputGroupInput id="key-id" mono value={apiKey.uuid} readOnly />
                        <InputGroupAddon align="inline-end">
                            <CopyButton value={apiKey.uuid} />
                        </InputGroupAddon>
                    </InputGroup>
                </SettingsRow>
                <SettingsRow label="API key" htmlFor="key-secret">
                    <SecretInput id="key-secret" value={apiKey.secret} canReveal={canReadSecret} disabledReason={PERMISSION_DENIED_REASON} />
                </SettingsRow>
                <AccessFields scopes={scopes} onChange={setScopes} readOnly={!canManageKeys} showEmptyError />
            </SettingsCard>
        </div>
    );
};

const CreateKeyPage: React.FC<{ env: string; onBack: () => void; onCreated: (key: ApiKeyListItem) => void }> = ({ env, onBack, onCreated }) => {
    const [name, setName] = useState('');
    const [scopes, setScopes] = useState<string[]>([FULL_ACCESS]);
    const [touched, setTouched] = useState(false);
    const { mutateAsync: createApiKey, isPending } = useCreateApiKey(env);
    const { toast } = useToast();

    const nameError = touched && !name.trim() ? 'Give the key a name.' : null;

    const onCreate = async () => {
        setTouched(true);
        if (!name.trim() || scopes.length === 0) return;
        try {
            const res = await createApiKey({ display_name: name.trim(), scopes });
            onCreated(res.data);
        } catch (err) {
            toast({ title: apiErrorMessage(err, 'Failed to create API key'), variant: 'error' });
        }
    };

    return (
        <div className="flex max-w-205 flex-col gap-5">
            <KeyBreadcrumb current="New API key" onBack={onBack} />
            <SettingsCard
                footer={
                    <>
                        <span />
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={onBack}>
                                Cancel
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => void onCreate()} loading={isPending}>
                                Create API key
                            </Button>
                        </div>
                    </>
                }
            >
                <SettingsRow label="Name" description="Name it after the service that uses it." htmlFor="key-name">
                    <Field data-invalid={!!nameError}>
                        <Input
                            id="key-name"
                            value={name}
                            placeholder="e.g. Production backend"
                            onChange={(e) => setName(e.target.value)}
                            aria-invalid={!!nameError}
                            autoFocus
                        />
                        {nameError && <FieldError>{nameError}</FieldError>}
                    </Field>
                </SettingsRow>
                <AccessFields scopes={scopes} onChange={setScopes} readOnly={false} showEmptyError={touched} />
            </SettingsCard>
        </div>
    );
};

const CreatedKeyPage: React.FC<{ apiKey: ApiKeyListItem; env: string; onDone: () => void }> = ({ apiKey, env, onDone }) => {
    const { toast } = useToast();
    const envLine = `${secretKeyEnvVar(env)}=${apiKey.secret}`;

    return (
        <div className="flex max-w-205 flex-col gap-5">
            <KeyBreadcrumb current={apiKey.display_name} onBack={onDone} />
            <SettingsCard
                footer={
                    <>
                        <span className="type-text-regular-xs text-text-muted">You can reveal it again later.</span>
                        <Button variant="primary" size="sm" onClick={onDone}>
                            Done
                        </Button>
                    </>
                }
            >
                <Alert variant="success">
                    <CircleCheck />
                    <AlertDescription>API key created. Copy it into your backend.</AlertDescription>
                </Alert>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="key-env-line" className="type-text-medium-sm text-text-default">
                        Add to your <InlineCode>.env</InlineCode>
                    </label>
                    <InputGroup>
                        <InputGroupInput id="key-env-line" mono value={envLine} readOnly />
                        <InputGroupAddon align="inline-end">
                            <CopyButton value={envLine} />
                        </InputGroupAddon>
                    </InputGroup>
                    <div>
                        <LinkButton
                            size="sm"
                            leftIcon={<Copy />}
                            onClick={() => {
                                void copyText(apiKey.secret).then(
                                    () => toast({ title: 'API key copied', variant: 'success' }),
                                    () => toast({ title: 'Couldn’t copy. Select the value and copy it manually.', variant: 'error' })
                                );
                            }}
                        >
                            Copy key only
                        </LinkButton>
                    </div>
                </div>
            </SettingsCard>
        </div>
    );
};

const ManagedSecretKeyView: React.FC<{ secretKey: string; env: string; canReadSecret: boolean }> = ({ secretKey, env, canReadSecret }) => (
    <SettingsCard title="API key">
        <p className="type-text-regular-sm text-text-secondary">
            This key is managed through the <InlineCode>{secretKeyEnvVar(env)}</InlineCode> environment variable.
        </p>
        <SecretInput value={secretKey} canReveal={canReadSecret} disabledReason={PERMISSION_DENIED_REASON} aria-label="API key" />
    </SettingsCard>
);

export const ApiKeys: React.FC<{ subPath?: string }> = ({ subPath }) => {
    const env = useStore((state) => state.env);
    const navigate = useNavigate();
    const { data, isLoading } = useApiKeys(env);
    const { data: envData } = useEnvironment(env);
    const [createdKey, setCreatedKey] = useState<ApiKeyListItem | null>(null);

    useEffect(() => {
        // 'new' is still on screen for a render after the key is created, before the URL switches to its id.
        if (createdKey && subPath !== 'new' && subPath !== String(createdKey.id)) {
            setCreatedKey(null);
        }
    }, [subPath, createdKey]);

    const { can } = usePermissions();
    const canReadSecret = can('environment:settings:read_secret');
    const canManageKeys = can('environment:api_keys:update');
    const canCreateKeys = can('environment:api_keys:create');
    const canDeleteKeys = can('environment:api_keys:delete');
    const managedSecretKey = envData?.environmentAndAccount?.managed_secret_key ?? null;

    const apiKeys = data?.data ?? [];
    const listPath = settingsPath(env, 'api-keys');
    const backToList = () => {
        setCreatedKey(null);
        void navigate(listPath);
    };

    if (managedSecretKey) {
        return <ManagedSecretKeyView secretKey={managedSecretKey} env={env} canReadSecret={canReadSecret} />;
    }

    if (subPath === 'new') {
        if (!canCreateKeys) {
            return <Navigate replace to={listPath} />;
        }
        return (
            <CreateKeyPage
                env={env}
                onBack={backToList}
                onCreated={(key) => {
                    setCreatedKey(key);
                    void navigate(settingsPath(env, 'api-keys', key.id), { replace: true });
                }}
            />
        );
    }

    if (subPath) {
        if (createdKey && String(createdKey.id) === subPath) {
            return <CreatedKeyPage apiKey={createdKey} env={env} onDone={backToList} />;
        }
        if (isLoading) {
            return <Skeleton className="h-[200px] w-full" />;
        }
        const apiKey = apiKeys.find((k) => String(k.id) === subPath);
        if (!apiKey) {
            return <Navigate replace to={listPath} />;
        }
        return (
            <KeyPage
                key={apiKey.id}
                apiKey={apiKey}
                env={env}
                onBack={backToList}
                canReadSecret={canReadSecret}
                canManageKeys={canManageKeys}
                canDeleteKeys={canDeleteKeys}
            />
        );
    }

    if (isLoading) {
        return <Skeleton className="h-[200px] w-full" />;
    }

    const createButton = canCreateKeys && (
        <Button variant="primary" onClick={() => void navigate(settingsPath(env, 'api-keys', 'new'))}>
            <Plus />
            Create API key
        </Button>
    );

    if (apiKeys.length === 0) {
        return (
            <div className="flex min-h-79 flex-col items-center justify-center gap-5 rounded-ds-xs border-ds-1 border-border-muted bg-surface-panel-muted px-10 pt-6 pb-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-ds-sm border-ds-1 border-border-default bg-surface-panel text-icon-default">
                    <KeyRound className="size-5" />
                </span>
                <div className="flex flex-col items-center gap-1.5">
                    <span className="type-heading-sm text-text-strong">No API keys in {env}</span>
                    <span className="max-w-[422px] type-text-regular-md text-text-secondary">
                        Your backend needs an API key to call the Nango API. Create one and scope it to what it needs.
                    </span>
                </div>
                {createButton}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            {createButton && <div className="flex justify-end">{createButton}</div>}
            <div className="rounded bg-surface-panel">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>API key</TableHead>
                            <TableHead>Access</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Last used</TableHead>
                            <TableHead>
                                <span className="sr-only">Open</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {apiKeys.map((key) => {
                            const open = () => void navigate(settingsPath(env, 'api-keys', key.id));
                            return (
                                <TableRow
                                    key={key.id}
                                    tabIndex={0}
                                    className="group cursor-pointer"
                                    onClick={open}
                                    onKeyDown={(e) => {
                                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                                            e.preventDefault();
                                            open();
                                        }
                                    }}
                                >
                                    <TableCell>
                                        <span className="type-text-medium-sm text-text-default">{key.display_name}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="inline-flex items-center gap-1 type-code-regular-xs text-text-secondary">
                                            …{key.secret.slice(-4)}
                                            {canReadSecret && (
                                                // Copying must not also open the key.
                                                <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                                    <CopyButton value={key.secret} aria-label={`Copy API key for ${key.display_name}`} />
                                                </span>
                                            )}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="type-text-regular-sm text-text-secondary">{accessLabel(renameLegacyScopes(key.scopes))}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="type-code-regular-xs text-text-secondary">{formatFullDate(key.created_at)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="type-text-regular-sm text-text-secondary" title={formatFullDate(key.last_used_at)}>
                                            {formatRelativeTime(key.last_used_at)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="w-8">
                                        <ArrowRight className="size-3.5 text-icon-muted group-hover:text-icon-default" />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};
