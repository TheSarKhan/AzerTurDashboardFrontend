import { useSyncExternalStore } from "react";

/**
 * Every page has its own address, kept in the hash so no server setup is needed:
 *   #/overview                           İcmal
 *   #/requests                           Sorğular (list)
 *   #/requests/<id>                      one request, review
 *   #/requests/<id>/offer                one request, offer composer
 *   #/customer-requests                  Müştəri sorğuları
 *   #/customer-requests/<id>/amendment   change proposal
 *   #/customer-requests/<id>/cancellation cancellation review
 * Only the modules below can be entered for now; anything else opens the overview.
 */
export type Route = { view: string; id?: string; sub?: string };

const SLUGS: Record<string, string> = {
  Overview: "overview",
  Bookings: "requests",
  Requests: "customer-requests",
};
const BY_SLUG = Object.fromEntries(
  Object.entries(SLUGS).map(([view, slug]) => [slug, view]),
);
export const OPEN_VIEWS = Object.keys(SLUGS);

const UUID = /^[0-9a-f-]{8,40}$/i;
const SUBS: Record<string, string[]> = {
  Bookings: ["offer"],
  Requests: ["amendment", "cancellation"],
};

export function parse(hash: string): Route {
  const raw = decodeURIComponent(hash.replace(/^#\/?/, ""));
  // Older bookmarks used the module name: #Bookings
  if (OPEN_VIEWS.includes(raw)) return { view: raw };
  const [slug, id, sub] = raw.split("/");
  const view = BY_SLUG[slug];
  if (!view) return { view: "Overview" };
  if (!id) return { view };
  if (!UUID.test(id)) return { view };
  return sub && SUBS[view]?.includes(sub) ? { view, id, sub } : { view, id };
}

export function href(route: Route) {
  const parts = [SLUGS[route.view] ?? "overview"];
  if (route.id) parts.push(route.id);
  if (route.id && route.sub) parts.push(route.sub);
  return "#/" + parts.join("/");
}

const EVENT = "aztrip:route";
const subscribe = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  window.addEventListener(EVENT, notify);
  return () => {
    window.removeEventListener("hashchange", notify);
    window.removeEventListener(EVENT, notify);
  };
};

/** Opens a page. A normal navigation adds a history entry, so the browser's back button works. */
export function navigate(route: Route, options: { replace?: boolean } = {}) {
  const next = href(route);
  if (window.location.hash === next) return;
  if (options.replace) {
    window.history.replaceState(null, "", next);
    window.dispatchEvent(new Event(EVENT));
  } else {
    window.location.hash = next;
  }
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  return parse(hash);
}
