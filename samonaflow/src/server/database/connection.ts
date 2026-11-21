// Server-only: database connection concerns. Do not import from client components.
import { prisma } from "@/lib/prisma";

export { prisma };

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
