import { auth } from "@repo/auth";
import { createFileRoute } from "@tanstack/react-router";

type ResponseLike = {
  body: BodyInit | null;
  headers: HeadersInit;
  status: number;
  statusText: string;
};

function toWebResponse(response: Response | ResponseLike): Response {
  if (response instanceof Response) {
    return response;
  }

  return new Response(response.body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => toWebResponse(await auth.handler(request)),
      POST: async ({ request }) => toWebResponse(await auth.handler(request)),
    },
  },
});
