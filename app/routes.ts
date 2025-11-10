import { type RouteConfig, index, route, layout } from "@remix-run/route-config";

export default [
  index("routes/_index/route.tsx"),
  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
    route("additional", "routes/app.additional.tsx"),
    route("choose-plan", "routes/app.choose-plan.tsx"),
    layout("routes/app.feeds.tsx", [
      index("routes/app.feeds._index.tsx"),
      route("new", "routes/app.feeds.new.tsx"),
      route(":feedId", "routes/app.feeds.$feedId.tsx"),
    ]),
  ]),
  route("auth/login", "routes/auth.login/route.tsx"),
  route("feeds/:feedId.xml", "routes/feeds.$feedId.xml.ts"),
  route("api/feeds/:feedId/delete", "routes/api/feeds.$feedId.delete.ts"),
  route("api/feeds/:feedId/generate", "routes/api/feeds.$feedId.generate.ts"),
  route("webhooks/app/uninstalled", "routes/webhooks.app.uninstalled.tsx"),
  route("webhooks/app/scopes_update", "routes/webhooks.app.scopes_update.tsx"),
  route("webhooks/products/create", "routes/webhooks.products.create.tsx"),
  route("webhooks/products/delete", "routes/webhooks.products.delete.tsx"),
  route("webhooks/products/update", "routes/webhooks.products.update.tsx"),
] satisfies RouteConfig;
