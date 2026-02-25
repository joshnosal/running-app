import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import AppShell from "./AppShell";
import type { UserPreferences } from "@/types/preferences";
import { DEFAULT_PREFERENCES } from "@/types/preferences";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      units: true,
      theme: true,
      maxHeartRate: true,
      hrZoneMode: true,
      hrZoneBoundaries: true,
      paceZoneBoundaries: true,
      cadenceZoneBoundaries: true,
    },
  });

  const preferences: UserPreferences = {
    units: (user?.units as UserPreferences["units"]) ?? DEFAULT_PREFERENCES.units,
    theme: (user?.theme as UserPreferences["theme"]) ?? DEFAULT_PREFERENCES.theme,
    maxHeartRate: user?.maxHeartRate ?? DEFAULT_PREFERENCES.maxHeartRate,
    hrZoneMode:
      (user?.hrZoneMode as UserPreferences["hrZoneMode"]) ?? DEFAULT_PREFERENCES.hrZoneMode,
    hrZoneBoundaries: Array.isArray(user?.hrZoneBoundaries)
      ? (user.hrZoneBoundaries as number[])
      : null,
    paceZoneBoundaries: Array.isArray(user?.paceZoneBoundaries) && user.paceZoneBoundaries.length === 2
      ? (user.paceZoneBoundaries as [number, number])
      : DEFAULT_PREFERENCES.paceZoneBoundaries,
    cadenceZoneBoundaries: Array.isArray(user?.cadenceZoneBoundaries) && user.cadenceZoneBoundaries.length === 2
      ? (user.cadenceZoneBoundaries as [number, number])
      : DEFAULT_PREFERENCES.cadenceZoneBoundaries,
  };

  return <AppShell initialPreferences={preferences}>{children}</AppShell>;
}
