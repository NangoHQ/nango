export interface UserResponse {
    total: number;
    count: number;
    Users: Record<string, ReturnedUser>;
    invited: string[];
}

interface ReturnedUser {
    username: string;
    fullname: string;
    mpstrength: string;
    created: string;
    last_pw_change: string;
    last_login: string;
    neverloggedin: boolean;
    disabled: boolean;
    admin: boolean;
    totalscore: number | null;
    legacytotalscore: number | null;
    hasSharingKeys: boolean;
    duousername: string | null;
    sites: string | null;
    notes: string | null;
    formfills: string | null;
    applications: string | null;
    attachments: string | null;
    password_reset_required: boolean;
}
