import { NavMenu } from "@shopify/app-bridge-react";
import { useLocation } from "@remix-run/react";

export function AppNavigation() {
  const location = useLocation();
  
  // Determine which menu item should be active based on the current path
  // Only one should be active at a time: feeds, create feed, or plan
  const isFeedsActive = location.pathname === '/app/feeds' || location.pathname === '/app/feeds/';
  const isCreateFeedActive = location.pathname === '/app/feeds/new';
  const isPlanActive = location.pathname.startsWith('/app/choose-plan');
  const isHomeActive = location.pathname === '/app' || location.pathname === '/app/';

  return (
    <NavMenu>
      <a 
        href="/app" 
        rel="home"
        className={isHomeActive ? 'active' : ''}
      >
        Home
      </a>
      <a 
        href="/app/feeds"
        className={isFeedsActive ? 'active' : ''}
      >
        Feeds
      </a>
      <a 
        href="/app/feeds/new"
        className={isCreateFeedActive ? 'active' : ''}
      >
        Create Feed
      </a>
      <a 
        href="/app/choose-plan"
        className={isPlanActive ? 'active' : ''}
      >
        Plan
      </a>
    </NavMenu>
  );
}
