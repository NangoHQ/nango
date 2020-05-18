/**
 * Handle SQL queries to the configurations' table
 */

import { store } from '.'
import { Types } from '../../types'

/**
 * Retrieve a configuration from the database
 * @param integration (string) - The integration name
 * @param id (string)- The configuration ID
 */

export const getConfiguration = async (integration: string, id?: string): Promise<Types.Configuration> => {
  // Retrieve the matching configuration and id
  if (id) {
    return await store('configurations')
      .where({ buid: integration, setup_id: id })
      .first()
  }

  // Or retrieve the latest one
  return await store('configurations')
    .where({ buid: integration })
    .orderBy('updated_at', 'desc')
    .first()
}

export const get = getConfiguration // Alias
