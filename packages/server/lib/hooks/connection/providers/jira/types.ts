export interface JiraSite {
    id: string;
    name: string;
    url: string;
    scopes: string[];
    avatarUrl: string;
}

interface AvatarUrls {
    '16x16'?: string;
    '24x24'?: string;
    '32x32'?: string;
    '48x48'?: string;
}

export interface JiraUser {
    accountId?: string;
    accountType?: string;
    active?: boolean;
    applicationRoles?: object;
    avatarUrls?: AvatarUrls;
    displayName?: string;
    emailAddress?: string;
    expand?: string;
    groups?: object;
    key?: string;
    self?: string;
    timeZone?: string;
    locale?: string;
    name?: string;
}

interface Icon {
    path?: string;
    width?: number;
    height?: number;
    isDefault?: boolean;
}

interface OperationCheckResult {
    operation: string;
    targetType: string;
    targetKey?: string;
    allow: boolean;
}

interface UserDetails {
    business?: Record<string, any>;
    personal?: Record<string, any>;
    personalSpace?: Space | null;
}

interface Space {
    id?: string;
    key?: string;
    name?: string;
    type?: string;
    status?: string;
    _expandable?: Record<string, string>;
    _links?: GenericLinks;
}

interface GenericLinks {
    self?: string;
    webui?: string;
    [key: string]: any;
}

export interface ConfluenceUser {
    type: 'known' | 'unknown' | 'anonymous' | 'user';
    accountId?: string | null;
    accountType?: string;
    email?: string | null;
    publicName: string;
    profilePicture?: Icon | null;
    displayName?: string | null;
    timeZone?: string | null;
    isGuest?: boolean;
    operations?: OperationCheckResult[] | null;
    details?: UserDetails;
    _expandable?: Record<string, string>;
    _links?: GenericLinks;
    [key: string]: any;
}
