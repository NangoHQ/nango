import { useState, useEffect, useRef } from 'react';
import { Prism } from '@mantine/prism';
import { toast } from 'react-toastify';
import { Tooltip, useModal, Modal } from '@geist-ui/core';

import CopyButton from '../components/ui/button/CopyButton';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import { useEditAccountNameAPI, useGetAccountAPI } from '../utils/api';
import type { User, InvitedUser } from '../types';
import { formatDateToUSFormat } from '../utils/utils';
import { Admin } from './AccountSettings/Admin';

export default function AccountSettings() {
    const [loaded, setLoaded] = useState(false);
    const [accountName, setAccountName] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [members, setMembers] = useState<User[]>([]);
    const [invitedMembers, setInvitedMembers] = useState<InvitedUser[]>([]);
    const [pendingSuspendMember, setPendingSuspendMember] = useState<User | null>(null);

    const [accountEditMode, setAccountEditMode] = useState(false);

    const getAccountInfo = useGetAccountAPI();
    const editAccountNameAPI = useEditAccountNameAPI();

    const formRef = useRef<HTMLFormElement>(null);
    const { setVisible, bindings } = useModal();
    const { setVisible: setInviteVisible, bindings: inviteBindings } = useModal();

    useEffect(() => {
        const getAccount = async () => {
            const res = await getAccountInfo();

            if (res?.status === 200) {
                const { account, users, invitedUsers } = await res.json();
                setAccountName(account['name']);
                setIsAdmin(account['is_admin']);
                setMembers(users);
                setInvitedMembers(invitedUsers);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getAccount();
        }
    }, [getAccountInfo, loaded, setLoaded]);

    const handleAccountNameEdit = (_: React.SyntheticEvent) => {
        setAccountEditMode(true);
    };

    const handleAccountNameSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            account_name: { value: string };
        };

        const res = await editAccountNameAPI(target.account_name.value);

        if (res?.status === 200) {
            toast.success('Account name updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setAccountEditMode(false);
            setAccountName(target.account_name.value);
        }
    };

    const onSuspendMember = (member: User) => {
        setVisible(true);
        setPendingSuspendMember(member);
    };

    const cancelSuspendMember = () => {
        setVisible(false);
        setPendingSuspendMember(null);
    };

    const confirmSuspendMember = async () => {
        if (!pendingSuspendMember) {
            setVisible(false);
            return;
        }

        const res = await fetch(`/api/v1/users/${pendingSuspendMember.id}/suspend`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        setVisible(false);

        if (res?.status === 200) {
            toast.success('Member suspended!', { position: toast.POSITION.BOTTOM_CENTER });
            setMembers(members.filter((m) => m.id !== pendingSuspendMember.id));
        }
    };

    const onAddMember = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            name: { value: string };
            email: { value: string };
        };

        const res = await fetch('/api/v1/users/invite', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: target.name.value,
                email: target.email.value
            })
        });

        if (res?.status === 200) {
            toast.success('Member invited!', { position: toast.POSITION.BOTTOM_CENTER });
            setInvitedMembers([...invitedMembers, await res.json()]);
            setInviteVisible(false);
        } else {
            const errorResponse = await res.json();
            toast.error(`Failed to invite member: ${errorResponse.error}`, { position: toast.POSITION.BOTTOM_CENTER });
        }
    };

    const handleSubmit = () => {
        if (formRef.current) {
            const submitButton = formRef.current?.querySelector('button[type="submit"]');
            if (submitButton) {
                (submitButton as HTMLElement).click();
            }
        }
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.AccountSettings}>
            <Modal {...bindings}>
                <Modal.Title>Suspend Member</Modal.Title>
                <Modal.Content>
                    <p>This action cannot be undone, are you sure?</p>
                </Modal.Content>
                <Modal.Action placeholder={null} passive onClick={() => cancelSuspendMember()}>
                    Cancel
                </Modal.Action>
                <Modal.Action placeholder={null} onClick={() => confirmSuspendMember()}>
                    Submit
                </Modal.Action>
            </Modal>
            <Modal {...inviteBindings}>
                <Modal.Title>Invite Member</Modal.Title>
                <Modal.Content>
                    <form ref={formRef} className="flex flex-col text-sm" onSubmit={onAddMember}>
                        <input name="name" className="border border-border-gray p-3" required placeholder="Name" />
                        <input name="email" className="border border-border-gray p-3 mt-2 text-sm" required type="email" placeholder="Email" />
                        <button type="submit" className="hidden" />
                    </form>
                </Modal.Content>
                <Modal.Action placeholder={null} passive onClick={() => setInviteVisible(false)}>
                    Cancel
                </Modal.Action>
                <Modal.Action placeholder={null} onClick={handleSubmit}>
                    Submit
                </Modal.Action>
            </Modal>
            <div className="h-full mb-20">
                <h2 className="text-left text-3xl font-semibold tracking-tight text-white mb-12">Account Settings</h2>
                <div className="border border-border-gray rounded-md h-fit pt-6 pb-14">
                    <div>
                        <div className="mx-8 mt-8">
                            <div className="flex flex-col">
                                <label htmlFor="public_key" className="text-text-light-gray block text-sm font-semibold mb-2">
                                    Account Name
                                </label>
                                <div className="flex">
                                    {accountEditMode && (
                                        <form className="mt-2 w-full flex" onSubmit={handleAccountNameSave}>
                                            <input
                                                id="account_name"
                                                name="account_name"
                                                defaultValue={accountName}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                                required
                                            />
                                            <button
                                                type="submit"
                                                className="border-border-blue bg-bg-dark-blue active:ring-border-blue flex h-11 rounded-md border ml-4 px-4 pt-3 text-sm font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                            >
                                                Save
                                            </button>
                                        </form>
                                    )}
                                    {!accountEditMode && (
                                        <div className="flex w-full">
                                            <Prism language="bash" colorScheme="dark" className="w-full">
                                                {accountName}
                                            </Prism>
                                            <button
                                                onClick={handleAccountNameEdit}
                                                className="hover:bg-hover-gray bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="mx-8 mt-8">
                            <div className="flex flex-col">
                                <label htmlFor="public_key" className="flex text-text-light-gray block text-sm font-semibold mb-2">
                                    Account Members
                                    <Tooltip text="Invite a new member" type="dark">
                                        <span
                                            className="bg-blue-500 cursor-pointer ml-2 text-white h-5 pb-0.5 w-5 flex items-center justify-center rounded-full"
                                            onClick={() => {
                                                setInviteVisible(true);
                                            }}
                                        >
                                            +
                                        </span>
                                    </Tooltip>
                                </label>
                                <div className="flex flex-col mt-2">
                                    <ul className="flex flex-col w-full space-y-4 text-white text-sm">
                                        {members
                                            .filter((m) => !m.suspended)
                                            .map((member) => (
                                                <li
                                                    key={member.id}
                                                    className={`flex w-full py-2 ${members.filter((m) => !m.suspended).length > 1 ? 'border-b border-border-gray' : ''} justify-between items-center`}
                                                >
                                                    <div className="flex space-x-12">
                                                        <span className="w-28">{member['name']}</span>
                                                        <Tooltip text={member['email']} type="dark">
                                                            <div className="w-48 overflow-hidden truncate">
                                                                <span className="">{member['email']}</span>
                                                            </div>
                                                        </Tooltip>
                                                    </div>
                                                    {!member.suspended && !member.currentUser && (
                                                        <Tooltip text="Remove member" type="dark">
                                                            <span
                                                                className="bg-red-500 cursor-pointer pb-0.5 text-white h-5 w-5 flex items-center justify-center rounded-full"
                                                                onClick={() => {
                                                                    onSuspendMember(member);
                                                                }}
                                                            >
                                                                x
                                                            </span>
                                                        </Tooltip>
                                                    )}
                                                </li>
                                            ))}
                                    </ul>
                                    {invitedMembers.filter((m) => !m.accepted).length > 0 && (
                                        <>
                                            <h3 className="mt-8 text-text-light-gray text-sm font-semibold mt-4 mb-2">Invited Members</h3>
                                            <ul className="flex flex-col w-full space-y-4 text-white text-sm">
                                                {invitedMembers
                                                    .filter((m) => !m.accepted)
                                                    .map((member) => (
                                                        <li
                                                            key={member.id}
                                                            className="flex w-full py-2 border-b border-border-gray justify-between items-center"
                                                        >
                                                            <div className="flex space-x-12">
                                                                <span className="w-28">{member['name']}</span>
                                                                <Tooltip text={member['email']} type="dark">
                                                                    <div className="w-48 overflow-hidden truncate">
                                                                        <span className="">{member['email']}</span>
                                                                    </div>
                                                                </Tooltip>
                                                                <Tooltip text="The invite expires on this date" type="dark">
                                                                    <span>{formatDateToUSFormat(member['expires_at'])}</span>
                                                                </Tooltip>
                                                            </div>
                                                            <CopyButton
                                                                icontype="link"
                                                                textPrompt="Copy Invite Link"
                                                                dark
                                                                text={`${window.location.host}/signup/${member.token}`}
                                                            />
                                                        </li>
                                                    ))}
                                            </ul>
                                        </>
                                    )}
                                    {members.filter((m) => !m.suspended).length === 0 && (
                                        <>
                                            <h3 className="mt-8 text-text-light-gray text-sm font-semibold mt-4 mb-2">Suspended Members</h3>
                                            <ul className="flex flex-col w-full space-y-4 text-white text-sm">
                                                {members
                                                    .filter((m) => m.suspended)
                                                    .map((member) => (
                                                        <li
                                                            key={member.id}
                                                            className="flex w-full py-2 border-b border-border-gray justify-between items-center"
                                                        >
                                                            <div className="flex space-x-12 text-gray-500">
                                                                <span className="w-28">{member['name']}</span>
                                                                <Tooltip text={member['email']} type="dark">
                                                                    <div className="w-48 overflow-hidden truncate">
                                                                        <span className="">{member['email']}</span>
                                                                    </div>
                                                                </Tooltip>
                                                            </div>
                                                        </li>
                                                    ))}
                                            </ul>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                {isAdmin && <Admin />}
            </div>
        </DashboardLayout>
    );
}
