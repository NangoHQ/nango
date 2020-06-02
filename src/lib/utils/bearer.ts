/**
 * Bearer.sh
 *
 * Initialize the Bearer agent if the environment key is provided.
 * Bearer will monitor and shield the Pizzly instance from APIs failure.
 * Learn more: https://www.bearer.sh/
 *
 * To get your BEARER_AGENT_KEY, create an account on www.bearer.sh
 * then heads to https://app.bearer.sh/settings/key
 */

import Bearer from '@bearer/node-agent'

if (process.env.BEARER_AGENT_KEY) {
  console.log('Initializing')
  Bearer.init({ secretKey: process.env.BEARER_AGENT_KEY })
}
