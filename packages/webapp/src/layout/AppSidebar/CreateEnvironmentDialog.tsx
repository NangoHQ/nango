import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import z from 'zod';

import { Button } from '@nangohq/design-system';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { usePostEnvironment } from '@/hooks/useEnvironment';
import { useToast } from '@/hooks/useToast';
import { APIError } from '@/utils/api';

interface CreateEnvironmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const environmentFormSchema = z.object({
    name: z
        .string()
        .regex(/^[a-z0-9_-]+$/, 'Invalid environment name')
        .max(255)
});

type EnvironmentForm = z.infer<typeof environmentFormSchema>;

export const CreateEnvironmentDialog: React.FC<CreateEnvironmentDialogProps> = ({ open, onOpenChange }) => {
    const form = useForm<EnvironmentForm>({
        resolver: zodResolver(environmentFormSchema),
        defaultValues: {
            name: ''
        }
    });

    const { toast } = useToast();
    const navigate = useNavigate();
    const { mutateAsync: postEnvironmentAsync, isPending } = usePostEnvironment();

    async function onSubmit(data: EnvironmentForm) {
        try {
            const res = await postEnvironmentAsync({ name: data.name });
            navigate(`/${res.data.name}`);
            onOpenChange(false);
            form.reset();
        } catch (err) {
            if (err instanceof APIError && 'error' in err.json) {
                const apiErr = err.json.error;
                if (apiErr.code === 'invalid_body') {
                    form.setError('name', { message: 'Invalid environment name' });
                } else if (['conflict', 'feature_disabled', 'resource_capped'].includes(apiErr.code)) {
                    toast({ title: apiErr.message, variant: 'error' });
                } else {
                    toast({ title: 'Failed to create environment', variant: 'error' });
                }
            } else {
                toast({ title: 'Failed to create environment', variant: 'error' });
            }
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
            <DialogContent className="gap-0 rounded border-border-default p-0 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.08)] sm:max-w-md">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col">
                        <DialogHeader className="gap-2 p-4 text-left">
                            <DialogTitle className="type-heading-sm">Create environment</DialogTitle>
                            <DialogDescription>Use it to switch between contexts like dev, staging, or production.</DialogDescription>
                        </DialogHeader>
                        <div className="px-4 pb-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <Input type="text" placeholder="my-environment-name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <DialogFooter className="border-t border-border-muted bg-surface-panel p-4">
                            <DialogClose asChild>
                                <Button variant="outline" size="sm">
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button variant="primary" size="sm" type="submit" loading={isPending}>
                                Create environment
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};
