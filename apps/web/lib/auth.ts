import { db, schema } from "@viewing/db";
import { runTool, tools, type ToolContext } from "@viewing/core";
import { agencyOfUser } from "@viewing/core/public";
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
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // "Forgot password": the link works for an hour and logs out every other session once used.
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const agencyId = await agencyOfUser(user.id);
      if (!agencyId) return console.error("Password reset for a login without an agency", user.id);
      const ctx: ToolContext = { db, agencyId, actor: { type: "system", id: null } };
      await runTool(tools.sendPasswordReset, ctx, { userId: user.id, email: user.email, name: user.name, link: url });
    },
  },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  plugins: [
    organization({
      // Agents get a week to accept; inviting again replaces the old invitation (and its link).
      invitationExpiresIn: 7 * 24 * 60 * 60,
      cancelPendingInvitationsOnReInvite: true,
      // The link was emailed to that address, so holding it is the proof.
      requireEmailVerificationOnInvitation: false,
      sendInvitationEmail: async ({ id, organization, inviter }) => {
        const ctx: ToolContext = { db, agencyId: organization.id, actor: { type: "user", id: inviter.user.id } };
        try {
          await runTool(tools.sendInvitationEmail, ctx, { invitationId: id, inviterName: inviter.user.name });
        } catch (error) {
          // The office can still copy the link from the agent's page.
          console.error("Sending the invitation email failed", error);
        }
      },
      organizationHooks: {
        // The new login belongs to the agent with the same email address.
        afterAcceptInvitation: async ({ user, organization }) => {
          const ctx: ToolContext = { db, agencyId: organization.id, actor: { type: "user", id: user.id } };
          await runTool(tools.linkAgentLogin, ctx, { userId: user.id, email: user.email });
        },
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
