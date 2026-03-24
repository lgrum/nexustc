import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";

import { authMiddleware } from "./auth";

export const adminMiddleware = createMiddleware()
  .middleware([authMiddleware])
  .server(async ({ context, next }) => {
    if (context.user.role === "user") {
      throw redirect({ replace: true, to: "/" });
    }

    return await next();
  });
