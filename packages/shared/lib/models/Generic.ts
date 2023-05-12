export type HTTP_VERB = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface DBConfig {
    encryption_key_hash?: string | null;
    encryption_complete: boolean;
}
