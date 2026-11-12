import { ExternalLink, Lock } from 'lucide-react';

import { Alert } from './alert';
import { InlineCode } from './inline-code';

import type { AlertAction, AlertSize, AlertStatus, StatusAlertProps } from './alert';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta<StatusAlertProps> = {
    title: 'Design System/Components/Alert',
    render: (args) => <Alert {...args} />,
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const STATUSES: AlertStatus[] = ['info', 'success', 'warning', 'danger', 'neutral'];
const SIZES: AlertSize[] = ['wide', 'compact', 'toast'];

const action: AlertAction = { label: 'View docs', icon: <ExternalLink />, href: 'https://nango.dev/docs', target: '_blank' };
const secondaryAction: AlertAction = { label: 'Dismiss for now', onClick: () => undefined };

const BODY = 'Changing the callback URL requires an active redirect and updating the registered callback URL with every OAuth provider.';

interface Shape {
    label: string;
    title?: boolean;
    actions?: 0 | 1 | 2;
}

const SHAPES: Shape[] = [
    { label: 'Body only' },
    { label: 'With title', title: true },
    { label: 'With title and action', title: true, actions: 1 },
    { label: 'With title and two actions', title: true, actions: 2 },
    { label: 'Body and action', actions: 1 }
];

const Matrix = ({ size }: { size: AlertSize }) => (
    <div className="flex max-w-[720px] flex-col gap-8 pb-6">
        {SHAPES.map((shape) => (
            <div key={shape.label} className="flex flex-col gap-2">
                <span className="text-ds-xs text-text-secondary">{shape.label}</span>
                {STATUSES.map((status) => (
                    <Alert
                        key={status}
                        status={status}
                        size={size}
                        title={shape.title ? 'Alert title' : undefined}
                        action={shape.actions ? action : undefined}
                        secondaryAction={shape.actions === 2 ? secondaryAction : undefined}
                        dismissible
                    >
                        {BODY}
                    </Alert>
                ))}
            </div>
        ))}
    </div>
);

export const Playground: Story = {
    args: {
        status: 'info',
        size: 'wide',
        title: 'Alert title',
        children: BODY,
        action,
        dismissible: false
    },
    argTypes: {
        status: { control: 'select', options: STATUSES },
        size: { control: 'inline-radio', options: SIZES }
    }
};

export const Wide: Story = { render: () => <Matrix size="wide" /> };
export const Compact: Story = { render: () => <Matrix size="compact" /> };
export const Toast: Story = { render: () => <Matrix size="toast" /> };

export const WithInlineCode: Story = {
    render: () => (
        <div className="flex max-w-[720px] flex-col gap-3">
            {STATUSES.map((status) => (
                <Alert key={status} status={status} title="Rename the secret key">
                    When using the CLI, add <InlineCode>NANGO_SECRET_KEY_DEV</InlineCode> to your <InlineCode>.env</InlineCode>.
                </Alert>
            ))}
        </div>
    )
};

export const CustomIcon: Story = {
    render: () => (
        <div className="flex max-w-[720px] flex-col gap-3">
            <Alert status="neutral" icon={<Lock />}>
                You have read-only access to this environment. Ask an admin to change its settings.
            </Alert>
            <Alert status="info" icon={false}>
                No icon.
            </Alert>
        </div>
    )
};
