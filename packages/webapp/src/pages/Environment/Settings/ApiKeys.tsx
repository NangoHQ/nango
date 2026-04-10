import { EyeSlashIcon } from '@heroicons/react/24/outline';
import { IconKey, IconPencil, IconTrash } from '@tabler/icons-react';
import { EyeIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { permissions } from '@nangohq/authz';

import SettingsContent from './components/SettingsContent';
import {
    SCOPE_GROUPS,
    SCOPE_PRESETS,
    allGroupScopes,
    expandScopes,
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
import { Badge } from '@/components-v2/ui/badge';
import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog';
import { Input } from '@/components-v2/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { usePermissions } from '@/hooks/usePermissions';
import { APIError } from '@/utils/api';

import type { ScopeGroup } from './scope-logic';
import type { ApiKeyListItem } from '../../../hooks/useApiKeys';

const MAX_VISIBLE_SCOPES = 3;

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

function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Secret field with masked preview ─────────────────────────────────

const KeySecretField: React.FC<{ secret: string; canRead: boolean }> = ({ secret, canRead }) => {
    const [revealed, setRevealed] = useState(false);
    const toggle = useCallback(() => setRevealed((r) => !r), []);
    const masked = `····${secret.slice(-4)}`;

    return (
        <div className="flex items-center gap-2 rounded border border-border-muted bg-bg-surface px-3 py-1.5">
            <span className="flex-1 font-mono text-body-small-regular text-text-primary">{revealed && canRead ? secret : masked}</span>
            {canRead && (
                <Button type="button" variant="ghost" size="icon" onClick={toggle}>
                    {revealed ? <EyeIcon size={16} /> : <EyeSlashIcon className="h-4 w-4" />}
                </Button>
            )}
            {canRead && <CopyButton text={secret} />}
        </div>
    );
};

// ── Scope selector (used in create dialog) ──────────────────────────

interface ScopeSelectorProps {
    selectedScopes: string[];
    onChange: (scopes: string[]) => void;
}

const ScopeSelector: React.FC<ScopeSelectorProps> = ({ selectedScopes, onChange }) => {
    const hasFullAccess = selectedScopes.includes('environment:*');

    const isGroupWildcardSelected = (group: ScopeGroup) => {
        const wc = groupWildcard(group);
        return wc ? selectedScopes.includes(wc) : false;
    };

    const isGroupAllSelected = (group: ScopeGroup) => {
        const all = allGroupScopes(group);
        return isGroupWildcardSelected(group) || all.every((s) => selectedScopes.includes(s));
    };

    const hasAnyChildSelected = (group: ScopeGroup) => allGroupScopes(group).some((s) => selectedScopes.includes(s));

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label className="text-body-medium-semi text-text-primary">Quick presets</label>
                    <a
                        href="https://nango.dev/docs/implementation-guides/platform/api-keys#scopes"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-body-small-regular text-text-brand hover:underline"
                    >
                        Learn more about scopes
                    </a>
                </div>
                <p className="text-body-small-regular text-text-tertiary">Select a preset to pre-fill scopes, then customize below</p>
                <div className="flex flex-wrap gap-2">
                    {SCOPE_PRESETS.map((preset) => (
                        <button
                            key={preset.label}
                            type="button"
                            onClick={() => onChange([...preset.scopes])}
                            title={preset.description}
                            className="px-3 py-1.5 rounded text-body-small-regular border transition-colors cursor-pointer bg-bg-surface text-text-secondary border-border-muted hover:border-border-default"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex flex-col gap-1.5">
                <label className="text-body-medium-semi text-text-primary">Scopes</label>
                <div className="max-h-[280px] overflow-y-auto border border-border-muted rounded p-3 flex flex-col gap-3">
                    {hasFullAccess && (
                        <div className="flex items-center gap-2 pb-2 border-b border-border-muted">
                            <input type="checkbox" checked={true} onChange={() => onChange([])} className="accent-brand" />
                            <span className="text-body-small-semi text-text-primary">Full access</span>
                            <span className="text-body-small-regular text-text-tertiary">— all current and future scopes</span>
                        </div>
                    )}
                    {SCOPE_GROUPS.map((group) => {
                        const groupSelected = isGroupAllSelected(group);
                        const wildcardSelected = isGroupWildcardSelected(group);
                        const childrenDisabled = hasFullAccess || wildcardSelected;
                        return (
                            <div key={group.group} className="flex flex-col gap-1">
                                <label className={`flex items-center gap-2 ${hasFullAccess ? '' : 'cursor-pointer'}`}>
                                    <input
                                        type="checkbox"
                                        checked={groupSelected || isScopeSelected(group.items[0].value, selectedScopes)}
                                        disabled={hasFullAccess}
                                        ref={(el) => {
                                            if (el) el.indeterminate = !hasFullAccess && !groupSelected && hasAnyChildSelected(group);
                                        }}
                                        onChange={() => onChange(toggleGroupFn(group, selectedScopes))}
                                        className="accent-brand"
                                    />
                                    <span className="text-body-small-semi text-text-secondary">{group.group}</span>
                                    {wildcardSelected && <span className="text-body-small-regular text-text-tertiary">— all</span>}
                                </label>
                                {group.items.map((item) => (
                                    <div key={item.value} className="flex flex-col gap-1">
                                        <label className={`flex items-center gap-2 pl-5 ${childrenDisabled ? '' : 'cursor-pointer'}`}>
                                            <input
                                                type="checkbox"
                                                checked={
                                                    isScopeSelected(item.value, selectedScopes) ||
                                                    (!!item.credentials && isScopeSelected(item.credentials, selectedScopes))
                                                }
                                                disabled={childrenDisabled}
                                                onChange={() => onChange(toggleScopeFn(item.value, item.credentials, selectedScopes))}
                                                className="accent-brand"
                                            />
                                            <span className={`text-body-small-regular ${childrenDisabled ? 'text-text-tertiary' : 'text-text-primary'}`}>
                                                {item.label}
                                            </span>
                                        </label>
                                        {item.credentials && (
                                            <label className={`flex items-center gap-2 pl-10 ${childrenDisabled ? '' : 'cursor-pointer'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={isScopeSelected(item.credentials, selectedScopes)}
                                                    disabled={childrenDisabled}
                                                    onChange={() => onChange(toggleCredentialFn(item.value, item.credentials!, selectedScopes))}
                                                    className="accent-brand"
                                                />
                                                <span className={`text-body-small-regular ${childrenDisabled ? 'text-text-tertiary' : 'text-text-primary'}`}>
                                                    with credentials
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
                {selectedScopes.length === 0 && <p className="text-body-small-regular text-text-tertiary">No scopes selected — key will have full access</p>}
            </div>
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
    const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
    const { toast } = useToast();
    const { mutateAsync: createApiKey, isPending } = useCreateApiKey(env);

    const handleCreate = async () => {
        if (!displayName.trim()) {
            toast({ title: 'Display name is required', variant: 'error' });
            return;
        }
        try {
            await createApiKey({
                display_name: displayName.trim(),
                scopes: selectedScopes.length > 0 ? selectedScopes : undefined
            });
            setOpen(false);
            setDisplayName('');
            setSelectedScopes([]);
            toast({ title: 'API key created', variant: 'success' });
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
                <Button variant="secondary" disabled={disabled}>
                    <IconKey stroke={1} size={18} />
                    Create API Key
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create API Key</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="api-key-name" className="text-body-medium-semi text-text-primary">
                            Display name
                        </label>
                        <Input id="api-key-name" placeholder="e.g. Production backend" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                    </div>
                    <ScopeSelector selectedScopes={selectedScopes} onChange={setSelectedScopes} />
                </div>
                <DialogFooter>
                    <Button variant="tertiary" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} loading={isPending}>
                        Create API Key
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// ── Key detail view ─────────────────────────────────────────────────

interface KeyDetailProps {
    apiKey: ApiKeyListItem;
    env: string;
    onDelete: (keyId: number) => void;
    canReadSecret: boolean;
    canManageKeys: boolean;
}

const KeyDetail: React.FC<KeyDetailProps> = ({ apiKey, env, onDelete, canReadSecret, canManageKeys }) => {
    const [editedScopes, setEditedScopes] = useState<string[]>(apiKey.scopes);
    const [editedName, setEditedName] = useState<string>(apiKey.display_name);
    const { mutateAsync: updateApiKey, isPending } = useUpdateApiKey(env);
    const { toast } = useToast();

    const scopesChanged = JSON.stringify(editedScopes.slice().sort()) !== JSON.stringify(apiKey.scopes.slice().sort());
    const nameChanged = editedName.trim() !== apiKey.display_name;
    const hasChanges = scopesChanged || nameChanged;

    const handleSave = async () => {
        try {
            const updates: { keyId: number; scopes?: string[]; display_name?: string } = { keyId: apiKey.id };
            if (scopesChanged) {
                updates.scopes = editedScopes.length > 0 ? editedScopes : ['environment:*'];
            }
            if (nameChanged) {
                updates.display_name = editedName.trim();
            }
            await updateApiKey(updates);
            toast({ title: 'API key updated', variant: 'success' });
        } catch (err) {
            if (err instanceof APIError) {
                toast({ title: (err.json as any)?.error?.message ?? 'Failed to update API key', variant: 'error' });
            } else {
                toast({ title: 'Failed to update API key', variant: 'error' });
            }
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex gap-6">
                <div className="flex flex-col gap-0.5">
                    <span className="text-body-small-semi text-text-secondary">Created</span>
                    <span className="text-body-small-regular text-text-primary">{formatDate(apiKey.created_at)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="text-body-small-semi text-text-secondary">Modified</span>
                    <span className="text-body-small-regular text-text-primary">{formatDate(apiKey.updated_at)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="text-body-small-semi text-text-secondary">Last used</span>
                    <span className="text-body-small-regular text-text-primary" title={formatFullDate(apiKey.last_used_at)}>
                        {formatRelativeTime(apiKey.last_used_at)}
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-body-small-semi text-text-secondary">Name</label>
                {canManageKeys ? (
                    <Input value={editedName} onChange={(e) => setEditedName(e.target.value)} />
                ) : (
                    <span className="text-body-medium-semi text-text-primary">{apiKey.display_name}</span>
                )}
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-body-small-semi text-text-secondary">Secret</label>
                <KeySecretField secret={apiKey.secret} canRead={canReadSecret} />
            </div>

            {canManageKeys ? (
                <ScopeSelector selectedScopes={editedScopes} onChange={setEditedScopes} />
            ) : (
                <div className="flex flex-col gap-1.5">
                    <label className="text-body-small-semi text-text-secondary">Scopes</label>
                    <div className="border border-border-muted rounded p-3 flex flex-wrap gap-1 opacity-60">
                        {expandScopes(apiKey.scopes).map((scope) => (
                            <Badge key={scope} variant="secondary">
                                {scope}
                            </Badge>
                        ))}
                    </div>
                    <p className="text-body-small-regular text-text-tertiary">You do not have permission to edit scopes on this environment.</p>
                </div>
            )}

            <div className="flex justify-between pt-2 border-t border-border-muted">
                {canManageKeys ? <DeleteApiKeyButton displayName={apiKey.display_name} onDelete={() => onDelete(apiKey.id)} /> : <div />}
                {hasChanges && canManageKeys && (
                    <Button size="sm" onClick={handleSave} loading={isPending}>
                        Save changes
                    </Button>
                )}
            </div>
        </div>
    );
};

// ── Delete button with name confirmation ────────────────────────────

const DeleteApiKeyButton: React.FC<{ displayName: string; onDelete: () => void; iconOnly?: boolean }> = ({ displayName, onDelete, iconOnly }) => {
    const [open, setOpen] = useState(false);

    const trigger = iconOnly ? (
        <Button variant="ghost" size="icon" className="text-text-tertiary hover:text-feedback-error-fg">
            <IconTrash stroke={1} size={16} />
        </Button>
    ) : (
        <Button variant="destructive" size="sm">
            <IconTrash stroke={1} size={16} />
            Delete key
        </Button>
    );

    return (
        <DestructiveActionModal
            title="Delete API Key"
            description={`This action is irreversible. Any services using the key "${displayName}" will lose access immediately.`}
            inputLabel={`To confirm, type the key name (${displayName}) below:`}
            confirmationKeyword={displayName}
            confirmButtonText="Delete API Key"
            trigger={trigger}
            onConfirm={onDelete}
            open={open}
            onOpenChange={setOpen}
        />
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

    if (selectedKey) {
        return (
            <SettingsContent title="API Keys">
                <KeyDetail
                    apiKey={selectedKey}
                    env={env}
                    onDelete={(keyId) => void handleDelete(keyId)}
                    canReadSecret={canReadSecret}
                    canManageKeys={canManageKeys}
                />
            </SettingsContent>
        );
    }

    return (
        <SettingsContent title="API Keys">
            <div className="flex items-center justify-between">
                <p className="text-body-small-regular text-text-secondary">API keys allow programmatic access to this Nango environment.</p>
                <PermissionGate condition={canManageKeys}>
                    {(allowed) => <CreateApiKeyDialog env={env} onCreated={() => void 0} disabled={!allowed} />}
                </PermissionGate>
            </div>

            {isLoading ? (
                <div className="text-body-small-regular text-text-tertiary py-4">Loading API keys...</div>
            ) : apiKeys.length === 0 ? (
                <div className="text-body-small-regular text-text-tertiary py-4">No API keys yet. Create one to get started.</div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Key</TableHead>
                            <TableHead>Scopes</TableHead>
                            <TableHead>Last used</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {apiKeys.map((key) => (
                            <TableRow key={key.id}>
                                <TableCell>
                                    <span className="text-body-small-semi text-text-primary">{key.display_name}</span>
                                </TableCell>
                                <TableCell>
                                    <span className="font-mono text-body-small-regular text-text-tertiary">····{key.secret.slice(-4)}</span>
                                </TableCell>
                                <TableCell>
                                    {(() => {
                                        const expanded = expandScopes(key.scopes);
                                        return (
                                            <div className="flex flex-wrap gap-1">
                                                {expanded.slice(0, MAX_VISIBLE_SCOPES).map((scope) => (
                                                    <Badge key={scope} variant="secondary">
                                                        {scope}
                                                    </Badge>
                                                ))}
                                                {expanded.length > MAX_VISIBLE_SCOPES && (
                                                    <Badge variant="gray">+{expanded.length - MAX_VISIBLE_SCOPES} more</Badge>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </TableCell>
                                <TableCell>
                                    <span className="text-text-secondary" title={formatFullDate(key.last_used_at)}>
                                        {formatRelativeTime(key.last_used_at)}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setSelectedKeyId(key.id)}
                                            className="text-text-tertiary hover:text-text-primary"
                                        >
                                            <IconPencil stroke={1} size={16} />
                                        </Button>
                                        {canManageKeys && (
                                            <DeleteApiKeyButton displayName={key.display_name} onDelete={() => void handleDelete(key.id)} iconOnly />
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </SettingsContent>
    );
};
