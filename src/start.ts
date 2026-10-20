import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

// Server functions write decisions into the store, so a page on another site must never reach them.
const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });

export const startInstance = createStart(() => ({ defaultSsr: false, requestMiddleware: [csrfMiddleware] }));
