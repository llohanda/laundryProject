// Hash routing (GDD 3.1): works under the GitHub Pages sub-path with no server rewrites.
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'boot' }
  | { name: 'levels' }
  | { name: 'settings' }
  | { name: 'level'; id: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '');
  if (path === '/levels') return { name: 'levels' };
  if (path === '/settings') return { name: 'settings' };
  const level = /^\/level\/([1-9]-[1-9])$/.exec(path);
  if (level) return { name: 'level', id: level[1]! };
  return { name: 'boot' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'boot': return '#/';
    case 'levels': return '#/levels';
    case 'settings': return '#/settings';
    case 'level': return `#/level/${route.id}`;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
