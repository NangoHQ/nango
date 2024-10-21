export interface UserInfoResponse {
    sub: string;
    name: string;
    given_name: string;
    family_name: string;
    created: string;
    email: string;
    accounts: AccountInfo[];
}

export interface AccountInfo {
    account_id: string;
    is_default: boolean;
    account_name: string;
    base_uri: string;
    organization: OrganizationInfo;
}

interface OrganizationInfo {
    organization_id: string;
    links: OrgLinkInfo[];
}

interface OrgLinkInfo {
    rel: string;
    href: string;
}
