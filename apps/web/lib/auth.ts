import { db, schema } from "@viewing/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

// Vercel exposes the deployment, branch and production hostnames; trusting them
// lets login work on every preview URL without extra configuration.
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter(Boolean)
  .map((host) => `https://${host}`);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: vercelOrigins,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  plugins: [
    organization({
      organizationHooks: {
        // Every new agency gets its settings row, and its creator is its first agent.
        afterCreateOrganization: async ({ organization, user }) => {
          await db.insert(schema.agencySettings).values({ agencyId: organization.id }).onConflictDoNothing();
          const [agent] = await db
            .insert(schema.agents)
            .values({ agencyId: organization.id, userId: user.id, name: user.name, email: user.email, color: "#6366f1" })
            .onConflictDoNothing()
            .returning();
          // Default working hours (Mon–Fri 09:00–18:00) so bookings work straight away.
          if (agent) {
            await db.insert(schema.availabilityRules).values(
              [1, 2, 3, 4, 5].map((weekday) => ({ agencyId: organization.id, agentId: agent.id, weekday, startMinute: 540, endMinute: 1080 })),
            );
          }
        },
      },
    }),
    nextCookies(),
  ],
});
