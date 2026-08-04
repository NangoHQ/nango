import { Info, KeyRound, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Helmet } from 'react-helmet';

import { permissions } from '@nangohq/authz';
import {
    Button,
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Field,
    FieldLabel,
    IconButton,
    Input
} from '@nangohq/design-system';

import { DestructiveActionModal } from '@/components/patterns/DestructiveActionModal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { LineSnippet } from '@/components/ui/LineSnippet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useAccountApiKeys, useCreateAccountApiKey, useDeleteAccountApiKey } from '@/hooks/useAccountApiKeys';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useUser } from '@/hooks/useUser';
import DashboardLayout from '@/layout/DashboardLayout';
import { track } from '@/utils/analytics';
import { APIError } from '@/utils/api';

import type { AccountApiKey, CreateAccountApiKey } from '@nangohq/types';

type CreatedAccountApiKey = CreateAccountApiKey['Success']['data'];

function apiErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof APIError)) {
        return fallback;
    }
    const json = error.json as { error?: { message?: string } };
    return json.error?.message ?? fallback;
}

function formatDate(value: string | null): string {
    if (!value) {
        return 'Never';
    }
    return new Date(value).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

const CreatedSecretDialog: React.FC<{ apiKey: CreatedAccountApiKey | null; onDone: () => void }> = ({ apiKey, onDone }) => {
    return (
        <Dialog open={apiKey !== null}>
            <DialogContent
                showCloseButton={false}
                onEscapeKeyDown={(event) => event.preventDefault()}
                onPointerDownOutside={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Save your API key</DialogTitle>
                    <DialogDescription>This secret is shown only once. Store it securely before closing this dialog.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    {apiKey && <LineSnippet snippet={apiKey.secret} className="min-w-0" onCopy={() => track('web:account_api_keys:secret_copied', {})} />}
                </DialogBody>
                <DialogFooter>
                    <Button size="sm" onClick={onDone}>
                        I’ve saved it
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const CreateAccountApiKeyDialog: React.FC<{ onCreated: (apiKey: CreatedAccountApiKey) => void }> = ({ onCreated }) => {
    const [open, setOpen] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const inputId = useId();
    const formId = useId();
    const { mutateAsync: createAccountApiKey, isPending } = useCreateAccountApiKey();
    const { toast } = useToast();

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) {
            setDisplayName('');
        }
    };

    const handleCreate = async () => {
        const name = displayName.trim();
        if (!name) {
            return;
        }

        try {
            const result = await createAccountApiKey({ display_name: name });
            track('web:account_api_keys:created', {});
            handleOpenChange(false);
            onCreated(result.data);
        } catch (err) {
            toast({ title: apiErrorMessage(err, 'Failed to create account API key'), variant: 'error' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="primary">
                    <KeyRound size={16} strokeWidth={1} />
                    Create API key
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create account API key</DialogTitle>
                    <DialogDescription>This key will have full access to account-level APIs. It will not grant access to environments.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <form
                        id={formId}
                        onSubmit={(event) => {
                            event.preventDefault();
                            void handleCreate();
                        }}
                    >
                        <Field>
                            <FieldLabel htmlFor={inputId}>Display name</FieldLabel>
                            <Input
                                id={inputId}
                                name="display_name"
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                                placeholder="e.g. Billing automation"
                                autoComplete="off"
                                autoFocus
                            />
                        </Field>
                    </form>
                </DialogBody>
                <DialogFooter>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} size="sm" loading={isPending} disabled={!displayName.trim()}>
                        Create API key
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const DeleteAccountApiKeyButton: React.FC<{
    apiKey: AccountApiKey;
    disabled: boolean;
    onDelete: (apiKey: AccountApiKey) => Promise<void>;
}> = ({ apiKey, disabled, onDelete }) => {
    const [open, setOpen] = useState(false);

    return (
        <DestructiveActionModal
            title="Delete account API key"
            description={`This action is irreversible. Any services using "${apiKey.display_name}" will lose account access immediately.`}
            inputLabel="To confirm, type the key name below:"
            confirmationKeyword={apiKey.display_name}
            confirmButtonText="Delete API key"
            trigger={
                <IconButton label={`Delete ${apiKey.display_name}`} variant="ghost" size="2xs" disabled={disabled}>
                    <Trash2 size={14} />
                </IconButton>
            }
            onConfirm={() => void onDelete(apiKey)}
            open={open}
            onOpenChange={setOpen}
        />
    );
};

export const AccountApiKeysShow: React.FC = () => {
    const { user } = useUser();
    const { can } = usePermissions();
    const canManageAccountKeys = can(permissions.canManageAccountKeys);
    const { data, isLoading, isError, refetch } = useAccountApiKeys(Boolean(user) && canManageAccountKeys);
    const { mutateAsync: deleteAccountApiKey, isPending: isDeleting, variables: deletingKeyId } = useDeleteAccountApiKey();
    const { toast } = useToast();
    const [createdApiKey, setCreatedApiKey] = useState<CreatedAccountApiKey | null>(null);

    const handleDelete = async (apiKey: AccountApiKey) => {
        try {
            await deleteAccountApiKey(apiKey.id);
            track('web:account_api_keys:deleted', {});
            toast({ title: 'Account API key deleted', variant: 'success' });
        } catch (err) {
            toast({ title: apiErrorMessage(err, 'Failed to delete account API key'), variant: 'error' });
        }
    };

    if (!user) {
        return (
            <DashboardLayout fullWidth title="API keys">
                <Helmet>
                    <title>Account API keys - Nango</title>
                </Helmet>
                <p className="text-body-small-regular text-text-muted">Loading API keys…</p>
            </DashboardLayout>
        );
    }

    if (!canManageAccountKeys) {
        return (
            <DashboardLayout fullWidth title="API keys">
                <Helmet>
                    <title>Account API keys - Nango</title>
                </Helmet>
                <div className="flex flex-col items-center gap-2 rounded-md border border-border-muted p-10 py-20 text-center text-text-strong">
                    <h2 className="text-xl">Access denied</h2>
                    <p className="text-sm text-text-muted">Only account administrators can manage account API keys.</p>
                </div>
            </DashboardLayout>
        );
    }

    const apiKeys = data?.data ?? [];

    return (
        <DashboardLayout fullWidth title="Account API keys">
            <Helmet>
                <title>Account API keys - Nango</title>
            </Helmet>

            <div className="mx-auto flex max-w-377 flex-col gap-4">
                <Alert variant="info">
                    <Info />
                    <AlertTitle>Full account access</AlertTitle>
                    <AlertDescription>
                        Account API keys can access account-level APIs but cannot access environments. For environment-level access, create an API key in
                        Environment settings.
                    </AlertDescription>
                </Alert>

                <div className="flex justify-end">
                    <CreateAccountApiKeyDialog onCreated={setCreatedApiKey} />
                </div>

                {isLoading ? (
                    <p className="text-body-small-regular text-text-muted">Loading API keys…</p>
                ) : isError ? (
                    <div className="flex items-center justify-between gap-4">
                        <p className="text-body-small-regular text-text-muted">Failed to load account API keys.</p>
                        <Button variant="outline" size="sm" onClick={() => void refetch()}>
                            Try again
                        </Button>
                    </div>
                ) : apiKeys.length === 0 ? (
                    <div className="flex flex-col gap-1 py-4">
                        <p className="text-body-small-semi text-text-strong">No account API keys</p>
                        <p className="text-body-small-regular text-text-muted">Create a key for account-level automation.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Access</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Last used</TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {apiKeys.map((apiKey) => (
                                <TableRow key={apiKey.id}>
                                    <TableCell>
                                        <span className="text-body-small-semi text-text-strong">{apiKey.display_name}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-body-small-regular text-text-secondary">Full account access</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-text-secondary">{formatDate(apiKey.created_at)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-text-secondary">{formatDate(apiKey.last_used_at)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <DeleteAccountApiKeyButton
                                            apiKey={apiKey}
                                            disabled={isDeleting && deletingKeyId === apiKey.id}
                                            onDelete={handleDelete}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>

            <CreatedSecretDialog apiKey={createdApiKey} onDone={() => setCreatedApiKey(null)} />
        </DashboardLayout>
    );
};
