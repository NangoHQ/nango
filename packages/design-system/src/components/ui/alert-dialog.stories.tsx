import { Activity, Trash2 } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from './alert-dialog';
import { Button } from './button';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/AlertDialog',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Default size (384px): icon beside the text, buttons right-aligned. */
export const Default: Story = {
    render: () => (
        <AlertDialog defaultOpen>
            <AlertDialogTrigger asChild>
                <Button variant="outline">Enable sync</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader icon={<Activity />}>
                    <AlertDialogTitle>Enable sync?</AlertDialogTitle>
                    <AlertDialogDescription>It will start syncing potentially for multiple connections. This will impact your billing.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Enable</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
};

/** Destructive tone: danger title + danger action (e.g. delete confirmations). */
export const Destructive: Story = {
    render: () => (
        <AlertDialog defaultOpen>
            <AlertDialogTrigger asChild>
                <Button variant="danger">Delete account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent destructive>
                <AlertDialogHeader icon={<Trash2 />}>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone. This will permanently delete your account from our servers.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
};

/** Small size (320px): centered header, buttons split full-width. */
export const Small: Story = {
    render: () => (
        <AlertDialog defaultOpen>
            <AlertDialogTrigger asChild>
                <Button variant="outline">Deploy sync</Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
                <AlertDialogHeader icon={<Activity />}>
                    <AlertDialogTitle>Deploy sync?</AlertDialogTitle>
                    <AlertDialogDescription>It will start syncing potentially for multiple connections. This will impact your billing.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Deploy</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
};

/** Small + destructive. */
export const SmallDestructive: Story = {
    render: () => (
        <AlertDialog defaultOpen>
            <AlertDialogTrigger asChild>
                <Button variant="danger">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm" destructive>
                <AlertDialogHeader icon={<Trash2 />}>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone. This will permanently delete your account from our servers.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
};
