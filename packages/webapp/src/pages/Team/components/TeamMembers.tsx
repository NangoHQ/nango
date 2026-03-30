import { Ellipsis } from 'lucide-react';
import { useMemo, useState } from 'react';

import { permissions } from '@nangohq/authz';

import { useDeleteTeamUser, usePatchTeamUser, useTeam } from '../../../hooks/useTeam';
import { useStore } from '../../../store';
import { Dot } from '@/components-v2/Dot';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { Badge } from '@/components-v2/ui/badge';
import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components-v2/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components-v2/ui/dropdown-menu';
import { Input } from '@/components-v2/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useDeleteInvite } from '@/hooks/useInvite';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useUser } from '@/hooks/useUser';

import type { ApiInvitation, ApiUser, Role } from '@nangohq/types';

const roles: { value: Role; label: string; description: string }[] = [
    { value: 'administrator', label: 'Full access', description: 'Full access to everything, including sensitive data.' },
    {
        value: 'production_support',
        label: 'Support',
        description: 'Full access to non-production environments. Read-only access to non-sensitive production data.'
    },
    { value: 'development_full_access', label: 'Contributor', description: 'Full access to non-production environments.' }
];

const EditRoleDialog: React.FC<{ user: ApiUser; onClose: () => void }> = ({ user, onClose }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const [role, setRole] = useState<Role>(user.role);
    const { mutateAsync: patchTeamUser, isPending } = usePatchTeamUser(env);

    const onSubmit = async () => {
        if (role === user.role) {
            onClose();
            return;
        }
        try {
            await patchTeamUser({ id: user.id, role });
            toast({ title: `${user.name}'s role has been updated`, variant: 'success' });
            onClose();
        } catch {
            toast({ title: 'Failed to update role', variant: 'error' });
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit role</DialogTitle>
                </DialogHeader>
                <div className="flex items-center gap-2">
                    <Input type="email" value={user.email} disabled className="flex-1" />
                    <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                        <SelectTrigger className="w-40">
                            <SelectValue placeholder="Select a role">{roles.find((r) => r.value === role)?.label}</SelectValue>
                        </SelectTrigger>
                        <SelectContent align="end" className="p-0 max-w-71">
                            {roles.map(({ value, label, description }) => (
                                <SelectItem key={value} value={value} className="h-fit p-2">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-text-primary text-body-medium-regular">{label}</span>
                                        <p className="text-text-secondary text-body-small-regular">{description}</p>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary">Cancel</Button>
                    </DialogClose>
                    <Button variant="primary" onClick={onSubmit} loading={isPending}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export const TeamMembers: React.FC = () => {
    const env = useStore((state) => state.env);
    const { confirm, DialogComponent } = useConfirmDialog();
    const { toast } = useToast();

    const { data } = useTeam(env);
    const { user: me } = useUser();
    const { mutateAsync: deleteTeamUser } = useDeleteTeamUser(env);
    const { mutateAsync: cancelInvitation } = useDeleteInvite(env);

    const [editingUser, setEditingUser] = useState<ApiUser | null>(null);

    const allUsers: ((ApiUser & { is_invitation: false }) | (ApiInvitation & { is_invitation: true }))[] = useMemo(
        () => [
            ...(data?.data.users || []).map((u) => ({ ...u, is_invitation: false as const })),
            ...(data?.data.invitedUsers || []).map((u) => ({ ...u, is_invitation: true as const }))
        ],
        [data]
    );

    const { can } = usePermissions();
    const canManageTeam = can(permissions.canManageTeam);

    const onRemoveUser = async (user: ApiUser) => {
        try {
            await deleteTeamUser({ id: user.id });
            toast({ title: `${user.name} has been removed from the team`, variant: 'success' });
        } catch {
            toast({ title: 'Failed to remove user', variant: 'error' });
        }
    };

    const onCancelInvitation = async (invitation: ApiInvitation) => {
        try {
            await cancelInvitation({ email: invitation.email });
            toast({ title: `Invitation for ${invitation.email} has been cancelled`, variant: 'success' });
        } catch {
            toast({ title: 'Failed to cancel invitation', variant: 'error' });
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-heading-sm text-text-primary">Team members</h3>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">{/* Actions */}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {allUsers?.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell>{user.name}</TableCell>

                            <TableCell>{user.email}</TableCell>

                            <TableCell>
                                <RoleBadge role={user.role} />
                            </TableCell>

                            <TableCell>
                                {user.is_invitation ? (
                                    <div className="inline-flex items-center gap-2 text-text-secondary">
                                        <Dot className="bg-feedback-warning-fg" /> Invited
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-2 text-text-primary">
                                        <Dot className="bg-feedback-success-fg" /> Active
                                    </div>
                                )}
                            </TableCell>

                            <TableCell className="text-right">
                                {me?.email === user.email ? null : (
                                    <DropdownMenu modal={false}>
                                        <PermissionGate condition={canManageTeam}>
                                            {(allowed) => (
                                                <DropdownMenuTrigger asChild disabled={!allowed}>
                                                    <Button variant="ghost" size="icon" disabled={!allowed}>
                                                        <Ellipsis />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                            )}
                                        </PermissionGate>
                                        <DropdownMenuContent align="end">
                                            {!user.is_invitation && <DropdownMenuItem onSelect={() => setEditingUser(user)}>Edit role</DropdownMenuItem>}

                                            {/* Remove user */}
                                            {!user.is_invitation && (
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        confirm({
                                                            title: 'Remove user',
                                                            description: `Are you sure you want to remove ${user.name} from the team?`,
                                                            onConfirm: () => onRemoveUser(user),
                                                            confirmButtonText: 'Remove',
                                                            confirmVariant: 'destructive'
                                                        })
                                                    }
                                                >
                                                    <span className="text-feedback-error-fg">Remove user</span>
                                                </DropdownMenuItem>
                                            )}

                                            {/* Cancel invitation */}
                                            {user.is_invitation && (
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        confirm({
                                                            title: 'Revoke invitation',
                                                            description: `Are you sure you want to revoke the invitation for ${user.email}?`,
                                                            onConfirm: () => onCancelInvitation(user),
                                                            confirmButtonText: 'Revoke',
                                                            confirmVariant: 'destructive'
                                                        })
                                                    }
                                                >
                                                    <span className="text-feedback-error-fg">Revoke invitation</span>
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {DialogComponent}
            {editingUser && <EditRoleDialog user={editingUser} onClose={() => setEditingUser(null)} />}
        </div>
    );
};

export const RoleBadge: React.FC<{ role: Role }> = ({ role }) => {
    const roleLabel = useMemo(() => {
        switch (role) {
            case 'production_support':
                return 'Support';
            case 'development_full_access':
                return 'Contributor';
            default:
                return 'Full access';
        }
    }, [role]);

    return (
        <Badge variant="ghost" className="-uppercase">
            {roleLabel}
        </Badge>
    );
};
