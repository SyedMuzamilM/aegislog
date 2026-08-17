"use server";

import { createActionLogger, withAegisContext } from "@aegislog/next";
import { audit, logger } from "aegislog";

// 1. Next.js Server Action with ambient user context & automatic error ring buffer
export async function updateUserSettings(formData: FormData) {
  const email = formData.get("email") as string;
  const newPassword = formData.get("password") as string;

  return withAegisContext(
    {
      actor: { id: "usr_alex_next", email },
      tenant: { id: "org_enterprise", slug: "acme-corp" },
      tags: { source: "server-action" },
    },
    async () => {
      // The password is automatically redacted by Helmet Shield!
      logger.info("User updating security profile", {
        newEmail: email,
        password: newPassword, // Masked as [REDACTED]
      });

      // Immutable business compliance audit trail
      await audit.record({
        action: "user.password_updated",
        resource: { type: "user", id: "usr_alex_next" },
        outcome: "success",
        details: { method: "web-ui" },
      });

      return { success: true, message: "Profile updated successfully." };
    },
  );
}

// 2. Action Logger pattern
export async function inviteTeamMember(inviteEmail: string, role: string) {
  const log = createActionLogger({
    actionName: "inviteTeamMember",
    actor: { id: "usr_admin_1", email: "admin@company.com" },
  });

  log.info("Sending invitation email", { inviteEmail, role });

  return { success: true, invited: inviteEmail };
}
