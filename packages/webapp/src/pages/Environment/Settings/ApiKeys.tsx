import { IconEdit, IconExternalLink, IconEye, IconEyeOff, IconKey, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { permissions } from '@nangohq/authz';

import SettingsContent from './components/SettingsContent';
import {
    SCOPE_GROUPS,
    allGroupScopes,
    groupWildcard,
    isScopeSelected,
    toggleCredential as toggleCredentialFn,
    toggleGroup as toggleGroupFn,
    toggleScope as toggleScopeFn
} from './scope-logic';
import { useApiKeys, useCreateApiKey, useDeleteApiKey, useUpdateApiKey } from '../../../hooks/useApiKeys';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { CopyButton } from '@/components-v2/CopyButton';
import { DestructiveActionModal } from '@/components-v2/DestructiveActionModal';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog';
import { Input } from '@/components-v2/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { usePermissions } from '@/hooks/usePermissions';
import { APIError } from '@/utils/api';

import type { ScopeGroup } from './scope-logic';
import type { ApiKeyListItem } from '../../../hooks/useApiKeys';

function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${weeks}w ago`;
    return `${months}mo ago`;
}

function formatFullDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function countSelectedScopes(scopes: string[]): number {
    if (scopes.includes('environment:*')) {
        return SCOPE_GROUPS.reduce((acc, g) => acc + allGroupScopes(g).length, 0);
    }
    let count = 0;
    for (const scope of scopes) {
        if (scope.endsWith(':*')) {
            const prefix = scope.slice(0, -1);
            count += SCOPE_GROUPS.reduce((acc, g) => acc + allGroupScopes(g).filter((s) => s.startsWith(prefix)).length, 0);
        } else {
            count++;
        }
    }
    return count;
}

// ── Scope selector with dropdown + collapsible groups ───────────────

interface ScopeSelectorProps {
    selectedScopes: string[];
    onChange: (scopes: string[]) => void;
    disabled?: boolean;
    hideLabel?: boolean;
}

const ScopeSelector: React.FC<ScopeSelectorProps> = ({ selectedScopes, onChange, disabled, hideLabel }) => {
    const hasFullAccess = selectedScopes.includes('environment:*');
    const isCustom = !hasFullAccess && selectedScopes.length > 0;
    const permissionMode = hasFullAccess && !isCustom ? 'full' : 'custom';

    const isGroupWildcardSelected = (group: ScopeGroup) => {
        const wc = groupWildcard(group);
        return wc ? selectedScopes.includes(wc) : false;
    };

    const isGroupAllSelected = (group: ScopeGroup) => {
        const all = allGroupScopes(group);
        return isGroupWildcardSelected(group) || all.every((s) => selectedScopes.includes(s));
    };

    const hasAnyChildSelected = (group: ScopeGroup) => allGroupScopes(group).some((s) => selectedScopes.includes(s));

    const countGroupTotal = (group: ScopeGroup): number => {
        return group.items.reduce((acc, item) => acc + (item.credentials ? 2 : 1), 0);
    };

    const countGroupSelected = (group: ScopeGroup): number => {
        if (isGroupWildcardSelected(group)) return countGroupTotal(group);
        return group.items.reduce((acc, item) => {
            const baseSelected = isScopeSelected(item.value, selectedScopes) || (!!item.credentials && isScopeSelected(item.credentials, selectedScopes));
            const credSelected = !!item.credentials && isScopeSelected(item.credentials, selectedScopes);
            return acc + (baseSelected ? 1 : 0) + (credSelected ? 1 : 0);
        }, 0);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                {!hideLabel && (
                    <div className="flex items-center gap-1.5">
                        <label className="text-body-medium-semi text-text-primary">Permission</label>
                        <a
                            href="https://nango.dev/docs/reference/backend/http-api/api-keys#scopes"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-tertiary hover:text-text-primary"
                        >
                            <IconExternalLink stroke={1} size={14} />
                        </a>
                    </div>
                )}
                <Select
                    value={permissionMode}
                    onValueChange={(v) => {
                        if (v === 'full') {
                            onChange(['environment:*']);
                        } else {
                            onChange([]);
                        }
                    }}
                    disabled={disabled}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="full">Full access</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {permissionMode === 'custom' && (
                <div className="flex flex-col gap-1.5">
                    <label className="text-body-medium-semi text-text-primary">
                        Selected scopes<span className="text-feedback-error-fg">*</span>
                    </label>
                    <div className="max-h-[320px] overflow-y-auto flex flex-col px-1">
                        {SCOPE_GROUPS.map((group) => {
                            const groupSelected = isGroupAllSelected(group);
                            const wildcardSelected = isGroupWildcardSelected(group);

                            return (
                                <div key={group.group} className="flex flex-col border-b border-border-muted last:border-b-0">
                                    <div className="flex items-center gap-2 py-2">
                                        <label className="flex items-center gap-2 cursor-pointer flex-1">
                                            <input
                                                type="checkbox"
                                                checked={groupSelected}
                                                disabled={disabled}
                                                ref={(el) => {
                                                    if (el) el.indeterminate = !groupSelected && hasAnyChildSelected(group);
                                                }}
                                                onChange={() => onChange(toggleGroupFn(group, selectedScopes))}
                                                className="accent-brand shrink-0"
                                            />
                                            <span className="text-body-small-semi text-text-primary">{group.group}</span>
                                        </label>
                                        <span className="text-body-small-regular text-text-tertiary">
                                            {countGroupSelected(group)}/{countGroupTotal(group)}
                                        </span>
                                    </div>
                                    <div className="flex flex-col pb-2">
                                        {group.items.map((item) => (
                                            <div key={item.value} className="flex flex-col">
                                                <label className="flex items-center gap-2 pl-7 cursor-pointer py-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            isScopeSelected(item.value, selectedScopes) ||
                                                            (!!item.credentials && isScopeSelected(item.credentials, selectedScopes))
                                                        }
                                                        disabled={disabled || wildcardSelected}
                                                        onChange={() => onChange(toggleScopeFn(item.value, item.credentials, selectedScopes))}
                                                        className="accent-brand shrink-0"
                                                    />
                                                    <span
                                                        className={`text-body-small-regular ${wildcardSelected ? 'text-text-tertiary' : 'text-text-primary'}`}
                                                    >
                                                        {item.label}
                                                    </span>
                                                </label>
                                                {item.credentials && (
                                                    <label className="flex items-center gap-2 pl-7 cursor-pointer py-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={isScopeSelected(item.credentials, selectedScopes)}
                                                            disabled={disabled || wildcardSelected}
                                                            onChange={() => onChange(toggleCredentialFn(item.value, item.credentials!, selectedScopes))}
                                                            className="accent-brand shrink-0"
                                                        />
                                                        <span
                                                            className={`text-body-small-regular ${wildcardSelected ? 'text-text-tertiary' : 'text-text-primary'}`}
                                                        >
                                                            {item.label}:with_credentials
                                                        </span>
                                                    </label>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {selectedScopes.length === 0 && <p className="text-body-small-regular text-feedback-error-fg">Select at least one scope to continue</p>}
                </div>
            )}
        </div>
    );
};

// ── Create dialog ───────────────────────────────────────────────────

interface CreateApiKeyDialogProps {
    env: string;
    onCreated: () => void;
    disabled?: boolean;
}

const CreateApiKeyDialog: React.FC<CreateApiKeyDialogProps> = ({ env, onCreated, disabled }) => {
    const [open, setOpen] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [selectedScopes, setSelectedScopes] = useState<string[]>(['environment:*']);
    const { toast } = useToast();
    const { mutateAsync: createApiKey, isPending } = useCreateApiKey(env);

    const hasNoScopes = selectedScopes.length === 0;

    const handleCreate = async () => {
        if (!displayName.trim()) {
            toast({ title: 'Display name is required', variant: 'error' });
            return;
        }
        if (hasNoScopes) {
            toast({ title: 'Select at least one scope or choose Full access', variant: 'error' });
            return;
        }
        try {
            await createApiKey({
                display_name: displayName.trim(),
                scopes: selectedScopes
            });
            setOpen(false);
            setDisplayName('');
            setSelectedScopes(['environment:*']);
            toast({ title: 'API Key successfully created.', variant: 'success' });
            onCreated();
        } catch (err) {
            if (err instanceof APIError) {
                toast({ title: (err.json as any)?.error?.message ?? 'Failed to create API key', variant: 'error' });
            } else {
                toast({ title: 'Failed to create API key', variant: 'error' });
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="primary" disabled={disabled}>
                    <IconKey stroke={1} size={16} />
                    Create new API key
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create API Key</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="api-key-name" className="text-body-medium-semi text-text-primary">
                            Display name<span className="text-feedback-error-fg">*</span>
                        </label>
                        <Input id="api-key-name" placeholder="e.g. Production backend" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                    </div>
                    <ScopeSelector selectedScopes={selectedScopes} onChange={setSelectedScopes} />
                </div>
                <DialogFooter>
                    <Button variant="tertiary" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} loading={isPending} disabled={hasNoScopes}>
                        Create API Key
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// ── Key configuration page ──────────────────────────────────────────

interface KeyConfigProps {
    apiKey: ApiKeyListItem;
    env: string;
    onBack: () => void;
    canReadSecret: boolean;
    canManageKeys: boolean;
}

const KeyConfig: React.FC<KeyConfigProps> = ({ apiKey, env, onBack, canReadSecret, canManageKeys }) => {
    const [editedScopes, setEditedScopes] = useState<string[]>(apiKey.scopes);
    const [editedName, setEditedName] = useState<string>(apiKey.display_name);
    const [secretRevealed, setSecretRevealed] = useState(false);
    const { mutateAsync: updateApiKey, isPending } = useUpdateApiKey(env);
    const { toast } = useToast();

    const scopesChanged = JSON.stringify(editedScopes.slice().sort()) !== JSON.stringify(apiKey.scopes.slice().sort());
    const nameChanged = editedName.trim() !== apiKey.display_name;
    const hasChanges = scopesChanged || nameChanged;
    const hasNoScopes = editedScopes.length === 0;

    const masked = `····${apiKey.secret.slice(-4)}`;

    const handleSave = async () => {
        if (hasNoScopes) {
            toast({ title: 'Select at least one scope or choose Full access', variant: 'error' });
            return;
        }
        try {
            const updates: { keyId: number; scopes?: string[]; display_name?: string } = { keyId: apiKey.id };
            if (scopesChanged) {
                updates.scopes = editedScopes;
            }
            if (nameChanged) {
                updates.display_name = editedName.trim();
            }
            await updateApiKey(updates);
            toast({ title: 'API Key successfully updated.', variant: 'success' });
        } catch (err) {
            if (err instanceof APIError) {
                toast({ title: (err.json as any)?.error?.message ?? 'Failed to update API key', variant: 'error' });
            } else {
                toast({ title: 'Failed to update API key', variant: 'error' });
            }
        }
    };

    return (
        <SettingsContent title="Key configuration">
            <div className="flex flex-col gap-6">
                <div className="grid grid-cols-[200px_1fr] items-center gap-y-6">
                    <label className="text-body-medium-semi text-text-secondary">Name</label>
                    {canManageKeys ? (
                        <Input value={editedName} onChange={(e) => setEditedName(e.target.value)} />
                    ) : (
                        <span className="text-body-medium-regular text-text-primary">{apiKey.display_name}</span>
                    )}

                    <label className="text-body-medium-semi text-text-secondary">Secret</label>
                    <div className="relative">
                        <Input
                            value={secretRevealed && canReadSecret ? apiKey.secret : masked}
                            disabled
                            className="font-mono bg-bg-surface text-text-tertiary pr-20"
                        />
                        {canReadSecret && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSecretRevealed((r) => !r)}
                                    className="text-text-tertiary hover:text-text-primary h-7 w-7"
                                >
                                    {secretRevealed ? <IconEyeOff stroke={1} size={16} /> : <IconEye stroke={1} size={16} />}
                                </Button>
                                <CopyButton text={apiKey.secret} />
                            </div>
                        )}
                    </div>
                </div>

                <ScopeSelector selectedScopes={editedScopes} onChange={setEditedScopes} disabled={!canManageKeys} />

                {canManageKeys && (
                    <div className="flex gap-2 pt-2">
                        <Button variant="tertiary" onClick={onBack}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} loading={isPending} disabled={!hasChanges || hasNoScopes}>
                            Save
                        </Button>
                    </div>
                )}
            </div>
        </SettingsContent>
    );
};

// ── Delete button with self-managed open state ─────────────────────

const DeleteApiKeyButton: React.FC<{ displayName: string; onDelete: () => void }> = ({ displayName, onDelete }) => {
    const [open, setOpen] = useState(false);

    return (
        <DestructiveActionModal
            title="Delete API Key"
            description={`This action is irreversible. Any services using the key "${displayName}" will lose access immediately.`}
            inputLabel="To confirm, type the key name below:"
            confirmationKeyword={displayName}
            confirmButtonText="Delete API Key"
            trigger={
                <Button variant="ghost" size="icon" className="text-text-tertiary hover:text-feedback-error-fg">
                    <IconTrash stroke={1} size={16} />
                </Button>
            }
            onConfirm={onDelete}
            open={open}
            onOpenChange={setOpen}
        />
    );
};

// ── Managed secret key (env var) ────────────────────────────────────

const ManagedSecretKeyView: React.FC<{ secretKey: string; env: string }> = ({ secretKey, env }) => {
    const [revealed, setRevealed] = useState(false);
    const masked = `····${secretKey.slice(-4)}`;

    return (
        <SettingsContent title="API Keys">
            <div className="flex flex-col gap-4 py-4">
                <div className="text-body-small-regular text-text-secondary">
                    This key is managed via the <code className="text-text-primary">NANGO_SECRET_KEY_{env.toUpperCase()}</code> environment variable.
                </div>
                <div>
                    <label className="text-body-small-semi text-text-primary block mb-1.5">Secret Key</label>
                    <div className="relative">
                        <Input value={revealed ? secretKey : masked} disabled className="font-mono bg-bg-surface text-text-tertiary pr-20" />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setRevealed((r) => !r)}
                                className="text-text-tertiary hover:text-text-primary h-7 w-7"
                            >
                                {revealed ? <IconEyeOff stroke={1} size={16} /> : <IconEye stroke={1} size={16} />}
                            </Button>
                            <CopyButton text={secretKey} />
                        </div>
                    </div>
                </div>
            </div>
        </SettingsContent>
    );
};

// ── Main component ──────────────────────────────────────────────────

export const ApiKeys: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data, isLoading } = useApiKeys(env);
    const { data: envData } = useEnvironment(env);
    const { mutateAsync: deleteApiKey } = useDeleteApiKey(env);
    const { toast } = useToast();
    const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);

    const { can } = usePermissions();
    const isProd = envData?.environmentAndAccount?.environment?.is_production || false;
    const canReadSecret = can(permissions.canReadProdSecretKey) || !isProd;
    const canManageKeys = can(permissions.canWriteProdEnvironmentKeys) || !isProd;
    const canMakeActions = canReadSecret || canManageKeys;
    const managedSecretKey = envData?.environmentAndAccount?.managed_secret_key ?? null;

    const apiKeys = data?.data ?? [];
    const selectedKey = selectedKeyId !== null ? apiKeys.find((k) => k.id === selectedKeyId) : null;

    const handleDelete = async (keyId: number) => {
        try {
            await deleteApiKey(keyId);
            setSelectedKeyId(null);
            toast({ title: 'API key deleted', variant: 'success' });
        } catch (err) {
            if (err instanceof APIError) {
                toast({ title: (err.json as any)?.error?.message ?? 'Failed to delete API key', variant: 'error' });
            } else {
                toast({ title: 'Failed to delete API key', variant: 'error' });
            }
        }
    };

    if (managedSecretKey) {
        return <ManagedSecretKeyView secretKey={managedSecretKey} env={env} />;
    }

    if (selectedKey) {
        return <KeyConfig apiKey={selectedKey} env={env} onBack={() => setSelectedKeyId(null)} canReadSecret={canReadSecret} canManageKeys={canManageKeys} />;
    }

    return (
        <SettingsContent
            title="API Keys"
            action={
                <PermissionGate condition={canManageKeys}>
                    {(allowed) => <CreateApiKeyDialog env={env} onCreated={() => void 0} disabled={!allowed} />}
                </PermissionGate>
            }
        >
            {isLoading ? (
                <div className="text-body-small-regular text-text-tertiary py-4">Loading API keys...</div>
            ) : apiKeys.length === 0 ? (
                <div className="text-body-small-regular text-text-tertiary py-4">No API keys yet. Create one to get started.</div>
            ) : (
                <div className="[&_[data-slot=table-container]]:border-0 [&_[data-slot=table-container]]:rounded-none">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Scopes</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Last used</TableHead>
                                {canMakeActions && <TableHead>Action</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {apiKeys.map((key) => (
                                <TableRow key={key.id}>
                                    <TableCell>
                                        <span className="text-body-small-semi text-text-primary">{key.display_name}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-body-small-regular text-text-secondary">{countSelectedScopes(key.scopes)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-text-secondary cursor-default" title={formatFullDate(key.created_at)}>
                                            {formatRelativeTime(key.created_at)}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-text-secondary cursor-default" title={formatFullDate(key.last_used_at)}>
                                            {formatRelativeTime(key.last_used_at)}
                                        </span>
                                    </TableCell>
                                    {canMakeActions && (
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                {canReadSecret && <CopyButton text={key.secret} />}
                                                {canManageKeys && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setSelectedKeyId(key.id)}
                                                        className="text-text-tertiary hover:text-text-primary"
                                                    >
                                                        <IconEdit stroke={1} size={16} />
                                                    </Button>
                                                )}
                                                {canManageKeys && (
                                                    <DeleteApiKeyButton displayName={key.display_name} onDelete={() => void handleDelete(key.id)} />
                                                )}
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </SettingsContent>
    );
};
