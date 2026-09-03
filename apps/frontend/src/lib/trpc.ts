import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../backend/src/routes/index";

export const trpc = createTRPCReact<AppRouter>();
