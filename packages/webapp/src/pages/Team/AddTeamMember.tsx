import { Cross1Icon, PlusIcon } from '@radix-ui/react-icons';
import Button from '../../components/ui/button/Button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../components/ui/Dialog';
import type { ApiTeam } from '@nangohq/types';
import { useState } from 'react';
import { Input } from '../../components/ui/input/Input';
import { apiPostInvite, useTeam } from '../../hooks/useTeam';
import { useStore } from '../../store';
import { useToast } from '../../hooks/useToast';

const emailReg = /(.+)?<(.+[@].+)>/;
const invalidChar = /['()&=\\/;,?`$*$€^¨°<>]/;

export const AddTeamMember: React.FC<{ team: ApiTeam }> = ({ team }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutate } = useTeam(env);

    const [open, setOpen] = useState(false);
    const [emails, setEmails] = useState<string[]>(['']);
    const [loading, setLoading] = useState(false);

    const onUpdate = (value: string, index: number) => {
        const next = emails
            .map((v, i) => {
                return i === index ? value : v;
            })
            .filter(Boolean);
        if (next.length === 0 || next[next.length - 1] !== '') {
            next.push('');
        }
        setEmails(next);
    };

    const onRemove = (index: number) => {
        if (index === 0 && emails.length === 1) {
            setEmails(['']);
        } else {
            setEmails(emails.filter((_, i) => i !== index));
        }
    };

    const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
        e.preventDefault();
        const filtered = handlePastedEmails(e.clipboardData.getData('Text'), emails);
        if (!filtered || filtered.size === 0) {
            return;
        }

        setEmails((prev) => {
            let copy = [...prev];
            const next = Array.from(filtered);

            if (copy[index] === '') {
                copy.splice(index, 0, ...next);
            } else {
                copy.push(...next);
            }
            copy = copy.filter(Boolean);
            copy.push('');
            return copy;
        });
    };

    const onSubmit = async () => {
        setLoading(true);

        const update = await apiPostInvite(env, { emails: emails.filter(Boolean) });

        if (!update || update.res.status === 200) {
            toast({ title: 'Invited successfully', variant: 'success' });
            setOpen(false);
            setEmails(['']);
            void mutate();
        }

        setLoading(false);
    };

    return (
        <div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button>
                        <PlusIcon /> Add Team Member
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogTitle>Invite new members to {team.name}&apos;s team</DialogTitle>
                    <DialogDescription>
                        You are about to invite the following members to {team.name}&apos;s team, are you sure you wish to continue?
                    </DialogDescription>
                    <div className="my-6">
                        <h4 className="font-semibold text-white text-sm mb-4">Emails:</h4>
                        <div className="flex flex-col gap-2">
                            {emails.map((email, i) => {
                                return (
                                    <div key={i} className="flex gap-2">
                                        <Input
                                            value={email}
                                            type="email"
                                            onChange={(e) => onUpdate(e.target.value, i)}
                                            inputSize={'lg'}
                                            variant={'border'}
                                            onPaste={(e) => onPaste(e, i)}
                                        />
                                        <Button variant={'icon'} size="lg" onClick={() => onRemove(i)}>
                                            <Cross1Icon />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant={'zinc'}>Cancel</Button>
                        </DialogClose>
                        <Button variant={'primary'} onClick={onSubmit} isLoading={loading} disabled={emails.filter(Boolean).length <= 0}>
                            Invite new members
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

function handlePastedEmails(clip: string, prev: string[]) {
    if (!clip) {
        return;
    }

    const split = clip.split(/[\n, ]/g);

    const filtered = new Set<string>();
    for (const item of split) {
        let transformed = item.trim();

        // Match "foo bar <foo@bar.com>"
        const match = transformed.match(emailReg);
        if (match) {
            transformed = match[2];
        }

        if (transformed === '') {
            continue;
        }

        // Invalid split if all emails are concatenated we can't do much
        const hasAt = transformed.match(/@/g);
        if (!hasAt || hasAt.length > 1) {
            continue;
        }

        // invalid chars
        if (transformed.match(invalidChar)) {
            continue;
        }

        // dedup
        if (prev.find((v) => v === transformed)) {
            continue;
        }

        filtered.add(transformed);
    }
    return filtered;
}
