import type { NangoSync, User } from './models';

interface DirectoryUser {
    '@odata.type': string;
    id: string;
    businessPhones: string[];
    displayName: string;
    givenName: string;
    jobTitle: string | null;
    mail: string;
    mobilePhone: string | null;
    officeLocation: string | null;
    preferredLanguage: string;
    surname: string;
    userPrincipalName: string;
    deletedDateTime?: string;
    createdDateTime?: string;
    userType: string;
    accountEnabled: boolean;
    department: string | null;
}

interface DirectoryUsersResponse {
    '@odata.context': string;
    '@odata.nextLink'?: string;
    value: DirectoryUser[];
}

interface Metadata {
    orgsToSync: string[];
}

export default async function fetchData(nango: NangoSync) {
    const metadata = await nango.getMetadata<Metadata>();
    const { orgsToSync } = metadata;

    if (!metadata) {
        throw new Error('No metadata');
    }

    if (!orgsToSync) {
        throw new Error('No orgs to sync');
    }

    const baseEndpoint = '/v1.0/groups';

    for (const orgId of orgsToSync) {
        const endpoint = `${baseEndpoint}/${orgId}/transitiveMembers?$top=500`;

        await nango.log(`Fetching users for org ID: ${orgId}`);
        await fetchAndUpdateUsers(nango, endpoint);
    }

    const endpoint = 'v1.0/directory/deletedItems/microsoft.graph.user?$top=100';
    await nango.log(`Detecting deleted users`);
    await fetchAndUpdateUsers(nango, endpoint, true);
}
async function fetchAndUpdateUsers(nango: NangoSync, endpoint: string, runDelete = false): Promise<void> {
    const selects = [
        'id',
        'mail',
        'displayName',
        'givenName',
        'deletedDateTime',
        'surname',
        'userPrincipalName',
        'mobilePhone',
        'accountEnabled',
        'userType',
        'createdDateTime'
    ];

    do {
        const disabledUsers: User[] = [] as User[];

        const response = await nango.get<DirectoryUsersResponse>({
            endpoint,
            retries: 5,
            params: {
                $select: selects.join(',')
            }
        });

        const { data } = response;

        if (!data.value) {
            await nango.log(`No ${runDelete ? 'deleted ' : ''}users found.`);
            break;
        }

        const users: User[] = [];
        for (const u of data.value) {
            let email = u.mail;
            if (runDelete && !email && u.userPrincipalName) {
                const id = u.id.replace(/-/g, '');
                email = u.userPrincipalName.replace(id, '');
            }

            if (u['@odata.type'] && !u['@odata.type'].includes('#microsoft.graph.user')) {
                continue;
            }
            const user: User = {
                id: u.id,
                email,
                displayName: u.displayName,
                givenName: u.givenName,
                familyName: u.surname,
                picture: null,
                type: u.userType,
                isAdmin: null,
                phone: {
                    value: u.mobilePhone,
                    type: 'mobile'
                },
                createdAt: u.createdDateTime ?? null,
                deletedAt: u.deletedDateTime ?? null,
                organizationId: null,
                organizationPath: null,
                department: u.department ?? null
            };

            if (u.accountEnabled !== undefined && u.accountEnabled === false) {
                disabledUsers.push(user);
                continue;
            }

            users.push(user);
        }

        if (runDelete) {
            await nango.batchDelete<User>(users, 'User');
        } else {
            if (disabledUsers.length) {
                await nango.batchDelete<User>(disabledUsers, 'User');
            }
            await nango.batchSave<User>(users, 'User');
        }

        endpoint = data['@odata.nextLink'] as string;
    } while (endpoint);
}
