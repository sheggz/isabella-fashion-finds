// Wires the pieces together: session -> header, router -> pages.
import { renderHeader } from './components/header.js';
import { renderAdminDiscounts } from './pages/admin/discounts.js';
import { renderAdminEdit } from './pages/admin/edit.js';
import { renderAdminList } from './pages/admin/list.js';
import { renderHome } from './pages/home.js';
import { renderProduct } from './pages/product.js';
import { createRouter } from './router.js';
import { loadSession, session, signOut } from './state/session.js';

// Pages are added here as milestones land. `requires` makes the router keep a page closed
// to anyone without the right role (the server still enforces it too; this is only UX).
export const routes = [
  { name: 'home', pattern: '/', render: renderHome },
  { name: 'product', pattern: '/products/:id', render: renderProduct },
  { name: 'admin', pattern: '/admin', requires: 'owner', render: renderAdminList },
  { name: 'adminDiscounts', pattern: '/admin/discounts', requires: 'owner', render: renderAdminDiscounts },
  // 'new' must come BEFORE ':id', otherwise the router would read "new" as a product id.
  { name: 'adminNew', pattern: '/admin/products/new', requires: 'owner', render: renderAdminEdit },
  { name: 'adminEdit', pattern: '/admin/products/:id', requires: 'owner', render: renderAdminEdit },
];

export const startApp = async ({ header, main }) => {
  const router = createRouter({ routes, container: main, getUser: () => session.get().user });

  const drawHeader = (state) =>
    renderHeader(header, state, {
      onSignOut: async () => {
        await signOut();
        router.navigate('/');
      },
    });

  drawHeader(session.get());
  session.subscribe((state) => {
    drawHeader(state);
    router.refresh(); // access rules may have changed (signed in or out)
  });

  // Find out who is signed in BEFORE the first page renders, so an owner-only page is not
  // wrongly shown as "forbidden" for a moment on a hard refresh.
  await loadSession();
  router.start();
  return router;
};
