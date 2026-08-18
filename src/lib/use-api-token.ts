import { useEffect, useState } from "react";

/* Holds the shared API bearer token for the token-gated /debug and
   /admin/admin pages. Kept in sessionStorage (cleared when the tab closes) and
   sent as `Authorization: Bearer …` to the API. Never persisted to disk. */

const KEY = "mvg_api_token";

export function useApiToken() {
  const [token, setTokenState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTokenState(sessionStorage.getItem(KEY));
    setReady(true);
  }, []);

  const setToken = (t: string | null) => {
    if (t) sessionStorage.setItem(KEY, t);
    else sessionStorage.removeItem(KEY);
    setTokenState(t);
  };

  return { token, setToken, ready };
}
