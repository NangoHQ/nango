import { Button } from '@/components-v2/ui/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components-v2/ui/Card';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components v2/Card',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex gap-4 flex-wrap">
            <Card className="w-72">
                <CardHeader>
                    <CardTitle>GitHub Integration</CardTitle>
                    <CardDescription>Sync pull requests and issues from your repos.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-body-small-regular text-text-secondary">Connected · Last synced 2 min ago</p>
                </CardContent>
                <CardFooter>
                    <Button variant="secondary" size="sm">
                        Manage
                    </Button>
                </CardFooter>
            </Card>
            <Card className="w-72">
                <CardHeader>
                    <CardTitle>Slack Integration</CardTitle>
                    <CardDescription>Post notifications to channels on sync events.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-body-small-regular text-text-secondary">Not connected</p>
                </CardContent>
                <CardFooter>
                    <Button variant="primary" size="sm">
                        Connect
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
};
