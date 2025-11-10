import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import {
  createReadableStreamFromReadable,
  type EntryContext,
} from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  try {
    addDocumentResponseHeaders(request, responseHeaders);
  } catch (error) {
    console.error("[entry.server] Error adding document response headers:", error);
    // Continue anyway - this shouldn't be fatal
  }

  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    let isResolved = false;
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      const { pipe, abort } = renderToPipeableStream(
        <RemixServer
          context={remixContext}
          url={request.url}
        />,
        {
          [callbackName]: () => {
            if (isResolved) return;
            isResolved = true;

            // Clear timeout if response is ready
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }

            try {
              const body = new PassThrough();
              const stream = createReadableStreamFromReadable(body);

              responseHeaders.set("Content-Type", "text/html");
              resolve(
                new Response(stream, {
                  headers: responseHeaders,
                  status: responseStatusCode,
                })
              );
              pipe(body);
            } catch (error) {
              console.error("[entry.server] Error creating response stream:", error);
              reject(error);
            }
          },
          onShellError(error) {
            if (isResolved) return;
            isResolved = true;

            // Clear timeout on error
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }

            console.error("[entry.server] Shell error:", error);
            reject(error);
          },
          onError(error) {
            responseStatusCode = 500;
            console.error("[entry.server] Render error:", error);
            if (error instanceof Error) {
              console.error("[entry.server] Error stack:", error.stack);
            }
          },
        }
      );

      // Automatically timeout the React renderer after 6 seconds, which ensures
      // React has enough time to flush down the rejected boundary contents
      // Only set timeout if we're not in a serverless environment where cleanup might be problematic
      timeoutId = setTimeout(() => {
        if (!isResolved && typeof abort === 'function') {
          try {
            abort();
          } catch (error) {
            // Ignore abort errors in serverless environments
            // The response may have already been resolved or the context cleaned up
            console.warn('[entry.server] Abort function error (safe to ignore in serverless):', error);
          }
        }
      }, streamTimeout + 1000);
    } catch (error) {
      console.error("[entry.server] Fatal error in renderToPipeableStream:", error);
      if (error instanceof Error) {
        console.error("[entry.server] Error stack:", error.stack);
      }
      reject(error);
    }
  });
}
