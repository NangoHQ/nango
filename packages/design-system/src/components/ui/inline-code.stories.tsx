import { Info } from 'lucide-react';

import { Alert, AlertDescription } from './alert';
import { InlineCode } from './inline-code';

import type { InlineCodeSize, InlineCodeTone } from './inline-code';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta<typeof InlineCode> = {
    title: 'Design System/Components/InlineCode',
    component: InlineCode,
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const TONES: InlineCodeTone[] = ['default', 'neutral', 'info', 'success', 'warning', 'danger'];
const SIZES: InlineCodeSize[] = ['sm', 'xs'];
const STATUSES = ['info', 'success', 'warning', 'danger', 'neutral'] as const;

export const Playground: Story = {
    args: { tone: 'default', size: 'sm', children: 'NANGO_SECRET_KEY_DEV' },
    argTypes: {
        tone: { control: 'select', options: TONES },
        size: { control: 'inline-radio', options: SIZES }
    }
};

export const TonesAndSizes: Story = {
    render: () => (
        <div className="flex flex-col gap-6">
            {SIZES.map((size) => (
                <div key={size} className="flex flex-col gap-3">
                    <span className="text-ds-xs text-text-secondary">size=&quot;{size}&quot;</span>
                    {TONES.map((tone) => (
                        <p key={tone} className={size === 'sm' ? 'type-text-regular-sm text-text-default' : 'type-text-regular-xs text-text-default'}>
                            {tone}: add{' '}
                            <InlineCode tone={tone} size={size}>
                                NANGO_SECRET_KEY_DEV
                            </InlineCode>{' '}
                            to your{' '}
                            <InlineCode tone={tone} size={size}>
                                .env
                            </InlineCode>{' '}
                            file.
                        </p>
                    ))}
                </div>
            ))}
        </div>
    )
};

export const InsideAlert: Story = {
    render: () => (
        <div className="flex flex-col gap-3">
            {STATUSES.map((status) => (
                <Alert key={status} variant={status}>
                    <Info />
                    <AlertDescription>
                        <span>
                            Picks up the {status} tone: add <InlineCode>NANGO_SECRET_KEY_A_VERY_LONG_ENVIRONMENT_NAME=&lt;secret-key&gt;</InlineCode> to your{' '}
                            <InlineCode>.env</InlineCode>.
                        </span>
                    </AlertDescription>
                </Alert>
            ))}
        </div>
    )
};
