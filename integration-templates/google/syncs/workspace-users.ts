import type { NangoSync, User } from '../../models';

interface DirectoryUsersResponse {
    kind: string;
    etag: string;
    users: DirectoryUser[];
}

interface DirectoryUser {
    kind: string;
    id: string;
    etag: string;
    primaryEmail: string;
    name: Name;
    isAdmin: boolean;
    isDelegatedAdmin: boolean;
    lastLoginTime: string;
    creationTime: string;
    deletionTime?: string;
    agreedToTerms: boolean;
    suspended: boolean;
    archived: boolean;
    changePasswordAtNextLogin: boolean;
    ipWhitelisted: boolean;
    emails: Email[];
    languages: Language[];
    aliases?: string[];
    nonEditableAliases?: string[];
    customerId: string;
    orgUnitPath: string;
    isMailboxSetup: boolean;
    isEnrolledIn2Sv: boolean;
    isEnforcedIn2Sv: boolean;
    includeInGlobalAddressList: boolean;
    thumbnailPhotoUrl?: string;
    thumbnailPhotoEtag?: string;
    recoveryEmail?: string;
    recoveryPhone?: string;
    phones?: Phone[];
}

interface Name {
    givenName: string;
    familyName: string;
    fullName: string;
}

interface Email {
    address: string;
    type: string;
    primary?: boolean;
}

interface Language {
    languageCode: string;
    preference: string;
}

interface Phone {
    value: string;
    type: string;
    customType?: string;
}

interface OrgToSync {
    id: string;
    path: string;
}

interface Metadata {
    orgsToSync: OrgToSync[];
}

export default async function fetchData(nango: NangoSync) {
    const metadata = await nango.getMetadata<Metadata>();
    const { orgsToSync } = metadata;

    if (!metadata) {
        throw new Error('No metadata');
    }

    if (!orgsToSync || !orgsToSync.length) {
        throw new Error('No orgs to sync');
    }

    for (const orgUnit of orgsToSync) {
        await nango.log(`Fetching users for org unit ID: ${orgUnit.id} at the path: ${orgUnit.path}`);
        await fetchAndUpdateUsers(nango, orgUnit);
    }

    await nango.log('Detecting deleted users');
    await fetchAndUpdateUsers(nango, null, true);
}

async function fetchAndUpdateUsers(nango: NangoSync, orgUnit: OrgToSync | null, runDelete = false): Promise<void> {
    const baseUrlOverride = 'https://admin.googleapis.com';
    const endpoint = '/admin/directory/v1/users';

    let pageToken: string = '';
    do {
        const suspendedUsers: User[] = [] as User[];

        const params = {
            customer: 'my_customer',
            orderBy: 'email',
            query: orgUnit ? `orgUnitPath='${orgUnit.path}'` : '',
            maxResults: '500',
            showDeleted: runDelete ? 'true' : 'false',
            pageToken
        };

        const response = await nango.get<DirectoryUsersResponse & { nextPageToken?: string }>({
            baseUrlOverride,
            endpoint,
            params
        });

        if (!response) {
            await nango.log(`No response from the Google API${orgUnit ? `for organizational unit ID: ${orgUnit.id}` : '.'}`);
            break;
        }

        const { data } = response;

        if (!data.users) {
            await nango.log(`No users to ${runDelete ? 'delete.' : `save for organizational unit ID: ${orgUnit?.id}`}`);
            break;
        }

        const users: User[] = [];

        for (const u of data.users) {
            const user: User = {
                id: u.id,
                email: u.primaryEmail,
                displayName: u.name.fullName,
                familyName: u.name.familyName,
                givenName: u.name.givenName,
                picture: u.thumbnailPhotoUrl,
                type: u.kind,
                isAdmin: u.isAdmin,
                createdAt: u.creationTime,
                deletedAt: u.deletionTime || null,
                phone: {
                    value: u.phones?.[0]?.value,
                    type: u.phones?.[0]?.type
                },
                organizationId: runDelete ? null : orgUnit?.id,
                organizationPath: runDelete ? null : u.orgUnitPath,
                department: null
            };

            if (u.suspended || u.archived) {
                suspendedUsers.push(user);
                continue;
            }
            users.push(user);
        }

        if (runDelete) {
            await nango.batchDelete<User>(users, 'User');
        } else {
            await nango.batchSave<User>(users, 'User');

            if (suspendedUsers.length) {
                await nango.batchDelete<User>(suspendedUsers, 'User');
            }
        }
        pageToken = data.nextPageToken as string;
    } while (pageToken);
}
