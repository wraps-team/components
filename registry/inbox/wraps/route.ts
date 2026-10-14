// app/api/inbox/route.ts — serves the Wraps inbox to <Inbox />.
//
// SECURITY: `authorize` below denies everything until you replace it. Return
// true only for signed-in users who may read and send as this mailbox.
import { WrapsEmail } from "@wraps.dev/email";
import { createInboxHandlers } from "@/components/inbox/wraps/server";

const wraps = new WrapsEmail({
  region: process.env.AWS_REGION ?? "us-east-1",
  inboxBucketName: process.env.WRAPS_INBOX_BUCKET,
  // Credentials resolve from your environment, or pass `roleArn` /
  // `credentials` here. See @wraps.dev/email.
});

export const { GET, POST } = createInboxHandlers({
  wraps,
  from: process.env.WRAPS_INBOX_FROM ?? "inbox@example.com",
  authorize: async (_request) => {
    // e.g. const session = await auth(); return session?.user?.role === "admin";
    return false;
  },
});
