import { useState, type ReactNode } from "react";

import { useApiToken } from "../lib/use-api-token";

/* Simple bearer-token gate for the internal /debug and /admin pages. Renders a
   lock screen until a token is entered, then hands the token to `children`.
   The token itself is verified server-side on every API call — this is only
   the client-side entry UX. */
export function TokenGate({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: (token: string, clear: () => void) => ReactNode;
}) {
  const { token, setToken, ready } = useApiToken();
  const [input, setInput] = useState("");

  if (!ready) {
    return <div className="min-h-dvh bg-[#EEF3FB]" />;
  }

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#EEF3FB] px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) setToken(input.trim());
          }}
          className="w-full max-w-sm rounded-2xl border border-[#B9CCE6]/70 bg-white p-6 shadow-lg"
        >
          <h1 className="text-[20px] font-extrabold text-[#111827]">{title}</h1>
          <p className="mt-1 text-sm text-[#6B7280]">{subtitle}</p>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="API token"
            autoFocus
            className="mt-4 w-full rounded-xl border border-[#B9CCE6] bg-white px-3 py-2.5 text-sm text-[#111827] outline-none focus:border-[#4878BC]"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-xl bg-[#4878BC] px-3 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#3a67a8]"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return <>{children(token, () => setToken(null))}</>;
}
