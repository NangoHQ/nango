import { zodResolver } from '@hookform/resolvers/zod';
import { Loader } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import z from 'zod';

import { Button } from '../ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormMessage } from '../ui/form';
import { Input } from '../ui/input';
import { apiPostEnvironment } from '@/hooks/useEnvironment';
import { useMeta } from '@/hooks/useMeta';
import { useToast } from '@/hooks/useToast';

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
    const { mutate: mutateMeta } = useMeta();

    const [loading, setLoading] = useState(false);

    async function onSubmit(data: EnvironmentForm) {
        setLoading(true);

        const res = await apiPostEnvironment({ name: data.name });
        if ('error' in res.json) {
            const err = res.json.error;
            if (err.code === 'invalid_body') {
                form.setError('name', { message: 'Invalid environment name' });
            } else if (['conflict', 'feature_disabled', 'resource_capped'].includes(err.code)) {
                toast({ title: err.message, variant: 'error' });
            } else {
                toast({ title: 'Failed to create environment', variant: 'error' });
            }
        } else {
            navigate(`/${res.json.data.name}`);
            onOpenChange(false);
            form.reset();
            void mutateMeta();
        }

        setLoading(false);
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
                                        <Input type="text" placeholder="my-environment-name" autoComplete="off" data-form-type="other" {...field} />
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
                            <Button variant="primary" type="submit" disabled={loading}>
                                {loading && <Loader className="animate-spin h-full w-full" />}
                                Create Environment
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};
