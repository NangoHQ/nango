import { CircleAlert, CircleCheck, ExternalLink, Info, TriangleAlert } from 'lucide-react';

import { Alert, AlertActions, AlertButton, AlertDescription, AlertTitle } from './alert';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Alert',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// Storybook-only dismiss handler; the close affordance renders whenever `onDismiss` is passed.
const onDismiss = () => undefined;

const VARIANTS = ['info', 'success', 'warning', 'danger', 'neutral'] as const;

const ICONS: Record<(typeof VARIANTS)[number], React.ReactNode> = {
    info: <Info />,
    success: <CircleCheck />,
    warning: <TriangleAlert />,
    danger: <CircleAlert />,
    neutral: <Info />
};

const DESCRIPTION = 'This is an alert banner description. This is an alert banner description.';

export const AllVariants: Story = {
    name: 'All variants',
    render: () => (
        <div className="flex flex-col gap-4">
            {VARIANTS.map((variant) => (
                <Alert key={variant} variant={variant} onDismiss={onDismiss}>
                    {ICONS[variant]}
                    <AlertTitle>Alert title</AlertTitle>
                    <AlertDescription>{DESCRIPTION}</AlertDescription>
                    <AlertActions>
                        <AlertButton>
                            Button
                            <ExternalLink />
                        </AlertButton>
                        <AlertButton>
                            Button
                            <ExternalLink />
                        </AlertButton>
                    </AlertActions>
                </Alert>
            ))}
        </div>
    )
};

export const Wide: Story = {
    render: () => (
        <div className="flex flex-col gap-4">
            {VARIANTS.map((variant) => (
                <Alert key={variant} variant={variant} size="wide" onDismiss={onDismiss}>
                    {ICONS[variant]}
                    <AlertTitle>Alert title</AlertTitle>
                    <AlertDescription>{DESCRIPTION}</AlertDescription>
                    <AlertActions>
                        <AlertButton>
                            Button
                            <ExternalLink />
                        </AlertButton>
                    </AlertActions>
                </Alert>
            ))}
        </div>
    )
};

export const Compact: Story = {
    render: () => (
        <div className="grid grid-cols-2 gap-4">
            {VARIANTS.map((variant) => (
                <Alert key={`${variant}-title`} variant={variant} size="compact" onDismiss={onDismiss}>
                    {ICONS[variant]}
                    <AlertTitle>Alert title</AlertTitle>
                    <AlertDescription>{DESCRIPTION}</AlertDescription>
                    <AlertActions>
                        <AlertButton>
                            Button
                            <ExternalLink />
                        </AlertButton>
                        <AlertButton>
                            Button
                            <ExternalLink />
                        </AlertButton>
                    </AlertActions>
                </Alert>
            ))}
            {VARIANTS.map((variant) => (
                <Alert key={`${variant}-no-title`} variant={variant} size="compact" onDismiss={onDismiss}>
                    {ICONS[variant]}
                    <AlertDescription>{DESCRIPTION}</AlertDescription>
                    <AlertActions>
                        <AlertButton>
                            Button
                            <ExternalLink />
                        </AlertButton>
                    </AlertActions>
                </Alert>
            ))}
        </div>
    )
};

export const Toast: Story = {
    render: () => (
        <div className="flex flex-col items-start gap-4">
            {VARIANTS.map((variant) => (
                <div key={variant} className="w-[350px]">
                    <Alert variant={variant} size="toast" onDismiss={onDismiss}>
                        {ICONS[variant]}
                        <AlertDescription>This is an alert toast description.</AlertDescription>
                    </Alert>
                </div>
            ))}
        </div>
    )
};

// Figma's toast has no title, but the webapp's `Toast` supports one — the description stays neutral so
// the two lines keep their contrast.
export const ToastWithTitle: Story = {
    name: 'Toast with title',
    render: () => (
        <div className="flex flex-col items-start gap-4">
            {VARIANTS.map((variant) => (
                <div key={variant} className="w-[350px]">
                    <Alert variant={variant} size="toast" onDismiss={onDismiss}>
                        {ICONS[variant]}
                        <AlertTitle>Alert title</AlertTitle>
                        <AlertDescription>This is an alert toast description.</AlertDescription>
                    </Alert>
                </div>
            ))}
        </div>
    )
};

export const WithoutIcon: Story = {
    name: 'Without icon',
    render: () => (
        <div className="flex flex-col gap-4">
            {VARIANTS.map((variant) => (
                <Alert key={variant} variant={variant}>
                    <AlertDescription>Token expires in 3 days — {variant}.</AlertDescription>
                </Alert>
            ))}
        </div>
    )
};

export const DescriptionOnly: Story = {
    name: 'Description only',
    render: () => (
        <div className="flex flex-col gap-4">
            <Alert variant="info">
                <Info />
                <AlertDescription>{DESCRIPTION}</AlertDescription>
            </Alert>
            <Alert variant="danger" onDismiss={onDismiss}>
                <CircleAlert />
                <AlertDescription>{DESCRIPTION}</AlertDescription>
            </Alert>
        </div>
    )
};

export const NotDismissible: Story = {
    name: 'Not dismissible',
    render: () => (
        <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>Alert title</AlertTitle>
            <AlertDescription>Omitting `onDismiss` hides the close affordance.</AlertDescription>
            <AlertActions>
                <AlertButton>
                    Button
                    <ExternalLink />
                </AlertButton>
            </AlertActions>
        </Alert>
    )
};
