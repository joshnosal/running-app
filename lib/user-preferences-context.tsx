"use client";

import { createContext, useContext, useState, useMemo, useCallback } from "react";
import type { UserPreferences } from "@/types/preferences";
import { DEFAULT_PREFERENCES } from "@/types/preferences";

interface UserPreferencesContextValue {
  preferences: UserPreferences;
  updatePreferences: (update: Partial<UserPreferences>) => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue>({
  preferences: DEFAULT_PREFERENCES,
  updatePreferences: () => {},
});

export function UserPreferencesProvider({
  children,
  initialValue,
}: {
  children: React.ReactNode;
  initialValue: UserPreferences;
}) {
  const [preferences, setPreferences] = useState<UserPreferences>(initialValue);

  const updatePreferences = useCallback((update: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...update }));
  }, []);

  const contextValue = useMemo(
    () => ({ preferences, updatePreferences }),
    [preferences, updatePreferences]
  );

  return (
    <UserPreferencesContext.Provider value={contextValue}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferencesContextValue {
  return useContext(UserPreferencesContext);
}
