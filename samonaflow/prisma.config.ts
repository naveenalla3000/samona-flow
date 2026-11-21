import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI configuration (migrations, introspection, studio).
// The CLI connects through DIRECT_URL (direct or session connection), never
// through the transaction pooler. The runtime client uses DATABASE_URL via the
// driver adapter in src/lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
