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

const action = (
    <AlertActions>
        <AlertButton>
            Button
            <ExternalLink />
        </AlertButton>
    </AlertActions>
);

// Only the first group runs through every status — the rest vary shape, not colour, so one variant is
// enough to read them and keeps the story short.
const WIDE_SHAPES = [
    { label: 'With title', title: true, withAction: false, dismissible: true, allVariants: true },
    { label: 'Description only', title: false, withAction: false, dismissible: true, allVariants: false },
    { label: 'Description only, with action', title: false, withAction: true, dismissible: true, allVariants: false },
    { label: 'With title and action', title: true, withAction: true, dismissible: true, allVariants: false },
    { label: 'With title and action, not dismissible', title: true, withAction: true, dismissible: false, allVariants: false }
] as const;

export const Wide: Story = {
    render: () => (
        <div className="flex flex-col gap-8">
            {WIDE_SHAPES.map((shape) => (
                <div key={shape.label} className="flex flex-col gap-2">
                    <span className="text-ds-xs text-text-secondary">{shape.label}</span>
                    {(shape.allVariants ? VARIANTS : (['info'] as const)).map((variant) => (
                        <Alert key={variant} variant={variant} size="wide" onDismiss={shape.dismissible ? onDismiss : undefined}>
                            {ICONS[variant]}
                            {shape.title && <AlertTitle>Alert title</AlertTitle>}
                            <AlertDescription>{DESCRIPTION}</AlertDescription>
                            {shape.withAction && action}
                        </Alert>
                    ))}
                </div>
            ))}
        </div>
    )
};

export const Compact: Story = {
    render: () => (
        // 320px matches the compact size's width in Figma, so text wraps the way it does there
        <div className="flex w-[320px] flex-col gap-4">
            {VARIANTS.map((variant) => (
                <Alert key={variant} variant={variant} size="compact" onDismiss={onDismiss}>
                    {ICONS[variant]}
                    <AlertTitle>Alert title</AlertTitle>
                    <AlertDescription>{DESCRIPTION}</AlertDescription>
                    {action}
                </Alert>
            ))}
        </div>
    )
};

// Figma models a toast as a single untitled line with no action. The webapp's `Toast` supports a title,
// and its deploy toast passes an action, so all three shapes ship — with a title the description stays
// neutral so the two lines keep their contrast.
const TOAST_SHAPES = [
    { label: 'Description only — the shape Figma models', title: false, withAction: false },
    { label: 'With title', title: true, withAction: false },
    { label: 'With title and action', title: true, withAction: true }
] as const;

export const Toast: Story = {
    render: () => (
        <div className="flex w-[350px] flex-col gap-8">
            {TOAST_SHAPES.map((shape) => (
                <div key={shape.label} className="flex flex-col gap-2">
                    <span className="text-ds-xs text-text-secondary">{shape.label}</span>
                    {VARIANTS.map((variant) => (
                        <Alert key={variant} variant={variant} size="toast" onDismiss={onDismiss}>
                            {ICONS[variant]}
                            {shape.title && <AlertTitle>Alert title</AlertTitle>}
                            <AlertDescription>This is an alert toast description.</AlertDescription>
                            {shape.withAction && action}
                        </Alert>
                    ))}
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
