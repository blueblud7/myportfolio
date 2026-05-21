"use client";

import { useState, useEffect } from "react";

export function useSession(): boolean | null {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then(r => setLoggedIn(r.ok))
      .catch(() => setLoggedIn(false));
  }, []);
  return loggedIn;
}
