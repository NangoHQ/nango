import { Button } from './button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Card',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="flex flex-wrap gap-4">
            <div className="w-72">
                <Card>
                    <CardHeader>
                        <CardTitle>GitHub Integration</CardTitle>
                        <CardDescription>Sync pull requests and issues from your repos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-text-secondary text-ds-md">Connected · Last synced 2 min ago</p>
                    </CardContent>
                    <CardFooter>
                        <Button variant="secondary" size="md">
                            Manage
                        </Button>
                    </CardFooter>
                </Card>
            </div>
            <div className="w-72">
                <Card>
                    <CardHeader>
                        <CardTitle>Slack Integration</CardTitle>
                        <CardDescription>Post notifications to channels on sync events.</CardDescription>
                        <CardAction>
                            <Button variant="primary" size="md">
                                Connect
                            </Button>
                        </CardAction>
                    </CardHeader>
                    <CardContent>
                        <p className="text-text-secondary text-ds-md">Not connected</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
};
