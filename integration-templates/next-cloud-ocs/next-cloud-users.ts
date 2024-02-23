import type { NextCloudUser, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const userIDs: string[] = await getAllUsers(nango);

        for (const userId of userIDs) {
            const specificUser = await getSpecificUser(nango, userId);
            if (specificUser) {
                const mappedUser: NextCloudUser = mapUser(specificUser);

                totalRecords++;
                await nango.log(`Saving user details for user: ${specificUser.id} (total user(s): ${totalRecords})`);
                await nango.batchSave([mappedUser], 'NextCloudUser');
            }
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

async function getAllUsers(nango: NangoSync) {
    const records: any[] = [];
    const endpoint = '/cloud/users';
    const response = await nango.get({ endpoint });
    records.push(...response.data.ocs.data.users);

    return records;
}

async function getSpecificUser(nango: NangoSync, userId: string) {
    const endpoint = `/cloud/users/${userId}`;
    try {
        const specificUser = await nango.get({ endpoint });
        return mapUser(specificUser.data.ocs.data);
    } catch (error: any) {
        throw new Error(`Error in getSpecificUser: ${error.message}`);
    }
}

function mapUser(user: any): NextCloudUser {
    return {
        enabled: user.enabled,
        id: user.id,
        lastLogin: user.lastLogin,
        backend: user.backend,
        subadmin: user.subadmin,
        quota: user.quota,
        manager: user.manager,
        avatarScope: user.avatarScope,
        email: user.email,
        emailScope: user.emailScope,
        additional_mail: user.additional_mail,
        additional_mailScope: user.additional_mailScope,
        displayname: user.displayname,
        display_name: user['display-name'],
        displaynameScope: user.displaynameScope,
        phone: user.phone,
        phoneScope: user.phoneScope,
        address: user.address,
        addressScope: user.addressScope,
        website: user.website,
        websiteScope: user.websiteScope,
        twitter: user.twitter,
        twitterScope: user.twitterScope,
        fediverse: user.fediverse,
        fediverseScope: user.fediverseScope,
        organisation: user.organisation,
        organisationScope: user.organisationScope,
        role: user.role,
        roleScope: user.roleScope,
        headline: user.headline,
        headlineScope: user.headlineScope,
        biography: user.biography,
        biographyScope: user.biographyScope,
        profile_enabled: user.profile_enabled,
        profile_enabledScope: user.profile_enabledScope,
        groups: user.groups,
        language: user.language,
        locale: user.locale,
        notify_email: user.notify_email,
        backendCapabilities: user.backendCapabilities
    };
}
