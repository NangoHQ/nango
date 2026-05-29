import { useForm } from 'react-hook-form';

import { Button } from '@/components-v2/ui/Button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components-v2/ui/Form';
import { Input } from '@/components-v2/ui/Input';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Form',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => {
        const form = useForm({ defaultValues: { connectionId: '' } });
        return (
            <Form {...form}>
                <form onSubmit={form.handleSubmit(() => {})} className="w-80 flex flex-col gap-4">
                    <FormField
                        control={form.control}
                        name="connectionId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Connection ID</FormLabel>
                                <FormControl>
                                    <Input placeholder="user-123" {...field} />
                                </FormControl>
                                <FormDescription>A unique identifier for this connection.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" size="sm">
                        Save
                    </Button>
                </form>
            </Form>
        );
    }
};
