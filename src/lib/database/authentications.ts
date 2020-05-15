/**
 * Handle SQL queries to the authentications' table
 */

import { store } from '.'
import { Types } from '../../types'

/**
 * Retrieve an authentication from the database
 *
 * @param authId (string) - The authentication ID
 */

export const getAuthentication = async (integration: string, authId: string): Promise<Types.Authentication> => {
  return await store('authentications')
    .select('id', 'auth_id', 'payload', 'created_at', 'updated_at')
    .where({ buid: integration, auth_id: authId })
    .first()
}

export const get = getAuthentication // Alias

/**
 * Update an authentication with new data
 *
 * @param authId (string) - The authentication ID
 */

export const update = async (authId: string, newData: Types.Authentication): Promise<Types.Authentication> => {
  return await store('authentications')
    .where({ auth_id: authId })
    .update(newData)
}
