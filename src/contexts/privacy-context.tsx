"use client";

import { createContext, useContext, useState, useEffect } from "react";

interface PrivacyContextValue {
  isPrivate: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({
  isPrivate: false,
  toggle: () => {},
});

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("privacy-mode");
    if (saved === "true") setIsPrivate(true);
  }, []);

  const toggle = () => {
    setIsPrivate((prev) => {
      const next = !prev;
      localStorage.setItem("privacy-mode", String(next));
      return next;
    });
  };

  return (
    <PrivacyContext.Provider value={{ isPrivate, toggle }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
