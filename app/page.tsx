import { Inbox } from "@/registry/inbox/inbox";
import { mockThreads } from "@/registry/inbox/mock";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Wraps Components</h1>
        <p className="text-muted-foreground">
          Email UI for shadcn: inbox, composer, and a sandboxed HTML email
          renderer. Backend-agnostic; works with Wraps or anything else.
        </p>
        <code className="mt-2 w-fit rounded-md bg-muted px-2 py-1 text-sm">
          npx shadcn add https://components.wraps.dev/r/inbox.json
        </code>
      </header>
      <main>
        <Inbox
          threads={mockThreads}
          onSend={async (draft) => {
            "use server";
            console.log("send", draft);
          }}
        />
      </main>
    </div>
  );
}
