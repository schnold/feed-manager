import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import db from "../db.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const feedId = params.feedId;
  if (!feedId) {
    return new Response("Feed ID missing", { status: 400 });
  }

  // Optional token check via query (?token=...)
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  const feed = await db.feed.findUnique({ where: { id: feedId } });
  if (!feed) {
    return new Response("Not found", { status: 404 });
  }

  if (feed.token && token !== feed.token) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!feed.publicUrl) {
    return new Response("Feed not generated", { status: 409 });
  }

  // Redirect to S3/CDN URL so it can be fetched directly
  return redirect(feed.publicUrl, { status: 302 });
}


