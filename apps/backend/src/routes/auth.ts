import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { requireDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { loginSchema, registerSchema } from "@journaledge/shared-types";

function signToken(user: { id: string; email: string }): string {
  const secret = process.env.JWT_SECRET ?? "dev_secret_change_me";
  return jwt.sign({ email: user.email }, secret, { subject: user.id, expiresIn: "7d" });
}

export const authRouter = router({
  register: publicProcedure.input(registerSchema).mutation(async ({ input }) => {
    const db = requireDb();
    const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (existing.length > 0) throw new Error("Email already registered");
    const passwordHash = await bcrypt.hash(input.password, 10);
    const [row] = await db.insert(users).values({ email: input.email, passwordHash }).returning();
    return { token: signToken({ id: row.id, email: row.email }), user: { id: row.id, email: row.email } };
  }),

  login: publicProcedure.input(loginSchema).mutation(async ({ input }) => {
    const db = requireDb();
    const found = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    const row = found[0];
    if (!row) throw new Error("Invalid email or password");
    const ok = await bcrypt.compare(input.password, row.passwordHash);
    if (!ok) throw new Error("Invalid email or password");
    return { token: signToken({ id: row.id, email: row.email }), user: { id: row.id, email: row.email } };
  }),

  me: publicProcedure.query(({ ctx }) => ctx.user ?? null),
});
