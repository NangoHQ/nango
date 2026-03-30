import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { permissions } from '@nangohq/authz';

import { PermissionGate } from '@/components-v2/PermissionGate';
import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';
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

const inviteSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    role: z.enum(['administrator', 'production_support', 'development_full_access'] as const)
});

type InviteFormData = z.infer<typeof inviteSchema>;

export const AddTeamMemberButton = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { can } = usePermissions();
    const canManageTeam = can(permissions.canManageTeam);

    const [isOpen, setIsOpen] = useState(false);

    const { mutateAsync: inviteAsync, isPending } = usePostInvite(env);

    const form = useForm<InviteFormData>({
        resolver: zodResolver(inviteSchema),
        defaultValues: { email: '', role: 'administrator' },
        mode: 'onTouched'
    });

    const onSubmit = async ({ email, role }: InviteFormData) => {
        try {
            await inviteAsync({ emails: [email], role });
            toast({ title: `Invite sent to ${email}`, variant: 'success' });
            setIsOpen(false);
            form.reset();
        } catch {
            toast({ title: 'Failed to invite team member', variant: 'error' });
        }
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                setIsOpen(open);
                if (!open) form.reset();
            }}
        >
            <PermissionGate condition={canManageTeam}>
                {(allowed) => (
                    <DialogTrigger asChild>
                        <Button size="lg" disabled={!allowed}>
                            <Plus /> Add Team Member
                        </Button>
                    </DialogTrigger>
                )}
            </PermissionGate>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Invite a team member</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form id="invite-form" onSubmit={form.handleSubmit(onSubmit)}>
                        <div className="flex items-start gap-2">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field, fieldState }) => (
                                    <FormItem className="flex-1">
                                        <FormControl>
                                            <InputGroup>
                                                <InputGroupInput
                                                    placeholder="name@company.com"
                                                    autoComplete="off"
                                                    {...field}
                                                    aria-invalid={!!fieldState.error}
                                                />
                                            </InputGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Controller
                                control={form.control}
                                name="role"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={(value) => field.onChange(value as Role)}>
                                        <SelectTrigger className="w-40">
                                            <SelectValue placeholder="Select a role">{roles.find((r) => r.value === field.value)?.label}</SelectValue>
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
                                )}
                            />
                        </div>
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary">Cancel</Button>
                    </DialogClose>
                    <Button type="submit" form="invite-form" variant="primary" loading={isPending}>
                        Invite
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
