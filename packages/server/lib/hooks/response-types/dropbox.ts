export interface FullAccount {
    account_id: string;
    name: Name;
    email: string;
    email_verified: boolean;
    disabled: boolean;
    locale: string;
    referral_link: string;
    is_paired: boolean;
    account_type: AccountType;
    root_info: RootInfo;
    profile_photo_url?: string;
    country?: string;
    team?: FullTeam;
    team_member_id?: string;
}

interface Name {
    given_name: string;
    surname: string;
    familiar_name: string;
    display_name: string;
    abbreviated_name: string;
}

type AccountType = 'basic' | 'pro' | 'business';

interface RootInfo {
    root_namespace_id: string;
    home_namespace_id: string;
    home_path: string;
    user?: UserRootInfo;
    team?: TeamRootInfo;
}

interface UserRootInfo {
    root_namespace_id: string;
    home_namespace_id: string;
    home_path?: string;
}

interface TeamRootInfo {
    root_namespace_id: string;
    home_namespace_id: string;
    home_path: string;
}

interface FullTeam {
    id: string;
    name: string;
    sharing_policies: TeamSharingPolicies;
}

interface TeamSharingPolicies {
    shared_folder_member_policy: SharedFolderMemberPolicy;
    shared_folder_join_policy: SharedFolderJoinPolicy;
    shared_link_create_policy: SharedLinkCreatePolicy;
    group_creation_policy: GroupCreationPolicy;
    shared_folder_link_restriction_policy: SharedFolderLinkRestrictionPolicy;
    enforce_link_password_policy: EnforceLinkPasswordPolicy;
    default_link_expiration_days_policy: DefaultLinkExpirationDaysPolicy;
    shared_link_default_permissions_policy: SharedLinkDefaultPermissionsPolicy;
    office_addin_policy: OfficeAddInPolicy;
    top_level_content_policy: TopLevelContentPolicy;
}

type SharedFolderMemberPolicy = 'team' | 'anyone' | 'team_and_approved';

type SharedFolderJoinPolicy = 'from_team_only' | 'from_anyone';

type SharedLinkCreatePolicy = 'default_public' | 'default_team_only' | 'team_only' | 'default_no_one';

type GroupCreationPolicy = 'admins_and_members' | 'admins_only';

type SharedFolderLinkRestrictionPolicy = 'members' | 'anyone';

type EnforceLinkPasswordPolicy = 'optional' | 'required';

type DefaultLinkExpirationDaysPolicy = 'none' | 'day_1' | 'day_3' | 'day_7' | 'day_30' | 'day_90' | 'day_180' | 'year_1';

type SharedLinkDefaultPermissionsPolicy = 'default' | 'edit' | 'view';

type OfficeAddInPolicy = 'disabled' | 'enabled';

type TopLevelContentPolicy = 'admin_only' | 'everyone';
