import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { IncomingHttpHeaders } from "http";
import jwt from "jsonwebtoken";

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Minimal structural context options — intentionally NOT using
 * CreateExpressContextOptions so the inferred router types stay portable
 * under pnpm (avoids TS2742 via hidden .pnpm @types paths) and so the
 * frontend can `import type { AppRouter }` without pulling Express types.
 */
export interface ContextOptions {
  req: { headers: IncomingHttpHeaders };
}

export async function createContext({ req }: ContextOptions) {
  let user: AuthUser | null = null;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    try {
      const secret = process.env.JWT_SECRET ?? "dev_secret_change_me";
      const payload = jwt.verify(token, secret) as { sub: string; email: string };
      user = { id: payload.sub, email: payload.email };
    } catch {
      user = null;
    }
  }
  return { req, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({ ctx: { ...ctx, user: ctx.user as AuthUser } });
});
