import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";

const TITLE = "Your Service Guide · maids.cc";
const DESCRIPTION =
  "Your personal step-by-step guide to bringing your maid to the UAE — prepared for you by maids.cc.";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      // The guides carry a client's own process details behind an unguessable
      // token. They are not secret, but they have no business in a search index.
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/assets/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-[#EEF3FB] text-[#111827]">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}

/* A client following a stale or mistyped link lands here, so it says what to do
   rather than showing a bare 404. */
function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#EEF3FB] px-6 font-sans">
      <div className="w-full max-w-sm rounded-2xl border border-[#B9CCE6]/70 bg-white p-7 text-center shadow-lg">
        <img
          src="/assets/maids-logo.png"
          alt="maids.cc"
          width={247}
          height={83}
          className="mx-auto h-9 w-auto"
        />
        <h1 className="mt-5 text-[20px] font-extrabold text-[#111827]">Guide not found</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6B7280]">
          This link may have expired or been mistyped. Please open the most recent link we sent you,
          or reply to your maids.cc WhatsApp chat and we&apos;ll send a fresh one.
        </p>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#EEF3FB] px-6 font-sans">
      <div className="w-full max-w-sm rounded-2xl border border-[#B9CCE6]/70 bg-white p-7 text-center shadow-lg">
        <h1 className="text-[20px] font-extrabold text-[#111827]">This page didn&apos;t load</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6B7280]">
          Something went wrong on our end. Try again in a moment.
        </p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 w-full rounded-xl bg-[#4878BC] px-3 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#3a67a8]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
