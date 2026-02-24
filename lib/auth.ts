import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/lib/db";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      maxHeartRate: {
        type: "number",
        defaultValue: 185,
        fieldName: "maxHeartRate",
      },
      hrZoneMode: {
        type: "string",
        defaultValue: "formula",
        fieldName: "hrZoneMode",
      },
      hrZoneBoundaries: {
        type: "string",
        defaultValue: null,
        fieldName: "hrZoneBoundaries",
      },
      units: {
        type: "string",
        defaultValue: "metric",
        fieldName: "units",
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
