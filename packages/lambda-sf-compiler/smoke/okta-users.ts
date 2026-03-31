import { createSync } from "nango";
import type { ProxyConfiguration } from "nango";
import { z } from "zod";

export const OktaUser = z.object({
  id: z.string(),
  status: z.string(),
  created: z.string(),
  activated: z.string(),
  statusChanged: z.string(),
  lastLogin: z.union([z.string(), z.null()]),
  lastUpdated: z.string(),
  passwordChanged: z.union([z.string(), z.null()]),

  type: z.object({
    id: z.string()
  }),

  profile: z.object({
    firstName: z.union([z.string(), z.null()]),
    lastName: z.union([z.string(), z.null()]),
    mobilePhone: z.union([z.string(), z.null()]),
    secondEmail: z.union([z.string(), z.null()]),
    login: z.string(),
    email: z.string()
  })
});

export type OktaUser = z.infer<typeof OktaUser>;

export const User = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  __raw: z.any()
});

export type User = z.infer<typeof User>;

export function toUser(user: OktaUser): User {
  return {
    id: user.id,
    firstName: user.profile.firstName || "",
    lastName: user.profile.lastName || "",
    email: user.profile.email,
    __raw: user,
  };
}


const sync = createSync({
  description: "Fetches lists users in your org",
  frequency: "every day",
  autoStart: true,
  syncType: "incremental",

  endpoints: [
    {
      method: "GET",
      path: "/users",
      group: "Users",
    },
  ],

  scopes: ["okta.users.read"],

  models: {
    User: User,
  },

  metadata: z.object({}),

  exec: async (nango) => {
    const filters = [];
    if (nango.lastSyncDate) {
      filters.push(`lastUpdated gt "${nango.lastSyncDate.toISOString()}"`);
    }

    const config: ProxyConfiguration = {
      // https://developer.okta.com/docs/api/openapi/okta-management/management/tag/User/#tag/User/operation/listUsers
      endpoint: `/api/v1/users`,
      retries: 10,
      params: {
        ...(filters.length > 0 && { filter: filters.join(" and ") }),
      },
      paginate: {
        type: "link",
        limit_name_in_request: "limit",
        link_rel_in_response_header: "next",
        limit: 100,
      },
    };

    for await (const oktaUsers of nango.paginate<OktaUser>(config)) {
      const users: User[] = oktaUsers.map((user: OktaUser) => {
        return toUser(user);
      });
      await nango.batchSave(users, "User");
    }
  },
});

export type NangoSyncLocal = Parameters<(typeof sync)["exec"]>[0];
export default sync;
