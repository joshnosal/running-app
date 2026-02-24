"use client";

import { useState, useMemo } from "react";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import AppBarComponent from "@/components/layout/AppBar";
import Sidebar, { DRAWER_WIDTH } from "@/components/layout/Sidebar";
import {
  UserPreferencesProvider,
  useUserPreferences,
} from "@/lib/user-preferences-context";
import type { UserPreferences } from "@/types/preferences";

function ThemedShell({ children }: { children: React.ReactNode }) {
  const { preferences } = useUserPreferences();
  const [mobileOpen, setMobileOpen] = useState(false);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");

  const isDark =
    preferences.theme === "dark" ||
    (preferences.theme === "system" && prefersDark);

  const theme = useMemo(
    () => createTheme({ palette: { mode: isDark ? "dark" : "light" } }),
    [isDark]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex" }}>
        <AppBarComponent onMenuClick={() => setMobileOpen((o) => !o)} />
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
            ml: { sm: `${DRAWER_WIDTH}px` },
          }}
        >
          <Toolbar />
          {children}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default function AppShell({
  children,
  initialPreferences,
}: {
  children: React.ReactNode;
  initialPreferences: UserPreferences;
}) {
  return (
    <UserPreferencesProvider initialValue={initialPreferences}>
      <ThemedShell>{children}</ThemedShell>
    </UserPreferencesProvider>
  );
}
