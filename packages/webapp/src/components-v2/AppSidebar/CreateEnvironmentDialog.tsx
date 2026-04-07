import { zodResolver } from '@hookform/resolvers/zod';
import { Loader } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import z from 'zod';

import { Button } from '../ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormMessage } from '../ui/form';
import { Input } from '../ui/input';
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
            <DialogContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-10">
                        <DialogHeader>
                            <DialogTitle>Environment Name</DialogTitle>
                        </DialogHeader>
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <Input type="text" placeholder="my-environment-name" {...field} />
                                    </FormControl>
                                    <FormDescription>*Must be lowercase letters, numbers, underscores and dashes.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="secondary">Cancel</Button>
                            </DialogClose>
                            <Button variant="primary" type="submit" disabled={isPending}>
                                {isPending && <Loader className="animate-spin h-full w-full" />}
                                Create Environment
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};
