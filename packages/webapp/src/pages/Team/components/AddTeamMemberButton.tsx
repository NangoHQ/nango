import { Plus } from 'lucide-react';
import { useState } from 'react';

import { permissions } from '@nangohq/authz';

import { PermissionGate } from '@/components-v2/PermissionGate';
import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog';
import { Input } from '@/components-v2/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/select';
import { usePostInvite } from '@/hooks/useInvite';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';

import type { Role } from '@nangohq/types';

const roles: { value: Role; label: string; description: string }[] = [
    { value: 'administrator', label: 'Full access', description: 'Full access to everything, including sensitive data.' },
    {
        value: 'production_support',
        label: 'Support',
        description: 'Full access to non-production environments. Read-only access to non-sensitive production data.'
    },
    { value: 'development_full_access', label: 'Contributor', description: 'Full access to non-production environments.' }
];

export const AddTeamMemberButton = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { can } = usePermissions();
    const canManageTeam = can(permissions.canManageTeam);

    const [email, setEmail] = useState('');
    const [role, setRole] = useState<Role>('administrator');

    const [isOpen, setIsOpen] = useState(false);

    const { mutateAsync: inviteAsync, isPending } = usePostInvite(env);

    const onSubmit = async () => {
        try {
            await inviteAsync({ emails: [email], role });
            toast({ title: `Invite sent to ${email}`, variant: 'success' });
            setIsOpen(false);
            setEmail('');
            setRole('administrator');
        } catch {
            toast({ title: 'Failed to invite team member', variant: 'error' });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <PermissionGate asChild condition={canManageTeam}>
                    {(allowed) => (
                        <Button size="lg" disabled={!allowed}>
                            <Plus /> Add Team Member
                        </Button>
                    )}
                </PermissionGate>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Invite a team member</DialogTitle>
                </DialogHeader>
                <div className="flex items-center gap-2">
                    <Input type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
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
                    <Button variant="primary" onClick={() => onSubmit()} loading={isPending}>
                        Invite
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
