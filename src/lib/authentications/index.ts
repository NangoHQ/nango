/**
 * Handle SQL queries to the authentications' table
 */

import { store } from '../database'

/**
 * Retrieve an authentication from the database
 * @param authId (string) - The authentication ID
 */

export const getAuthentication = async (integration: string, authId: string) => {
  return await store('authentications')
    .select('auth_id', 'user_attributes', 'created_at', 'updated_at')
    .where({ buid: integration, auth_id: authId })
    .first()
}

export const get = getAuthentication // Alias
