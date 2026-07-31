// audit_trail_events rode along here because it inherited the usage migration runner. It now has its
// own database, which every reader and writer reaches through the audit client's default, leaving
// this copy unread.
export const sql = [`DROP TABLE IF EXISTS {database:Identifier}.audit_trail_events`];
