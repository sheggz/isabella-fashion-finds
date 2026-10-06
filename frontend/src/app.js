// Wires the pieces together: session -> header, router -> pages.
import { loading } from './components/states.js';
import { renderHeader } from './components/header.js';
import { renderAdminDiscounts } from './pages/admin/discounts.js';
import { renderAdminEdit } from './pages/admin/edit.js';
import { renderAdminList } from './pages/admin/list.js';
import { renderCart } from './pages/cart.js';
import { renderHome } from './pages/home.js';
import { renderOrders } from './pages/orders.js';
import { renderProduct } from './pages/product.js';
import { createRouter } from './router.js';
import { keepFresh } from './live.js';
import { cart, loadCart, refreshCart, resetCart } from './state/cart.js';
import { loadSession, session, signOut } from './state/session.js';

// Pages are added here as milestones land. `requires` makes the router keep a page closed
// to anyone without the right role (the server still enforces it too; this is only UX).
export const routes = [
  { name: 'home', pattern: '/', render: renderHome },
  { name: 'product', pattern: '/products/:id', render: renderProduct },
  { name: 'cart', pattern: '/cart', requires: 'user', render: renderCart },
  { name: 'orders', pattern: '/orders', requires: 'user', render: renderOrders },
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
      cartCount: cart.get().data?.item_count ?? 0,
      onSignOut: async () => {
        await signOut();
        router.navigate('/');
      },
    });

  drawHeader(session.get());
  cart.subscribe(() => drawHeader(session.get())); // the header shows how many items are in the cart
  session.subscribe((state) => {
    // The cart belongs to whoever is signed in: fetch it on sign-in, forget it on sign-out.
    if (state.user) loadCart();
    else resetCart();
    drawHeader(state);
    router.refresh(); // access rules may have changed (signed in or out)
  });

  // Keep the cart in step with other devices (the phone app). Only while signed in.
  keepFresh(async () => {
    // If the first check failed because the server was asleep, keep trying to find out who is
    // signed in (an `error` on the session means "unknown", not "signed out").
    if (session.get().error) await loadSession({ attempts: 1 });
    else if (session.get().user) await refreshCart();
  });

  // Find out who is signed in BEFORE the first page renders, so an owner-only page is not
  // wrongly shown as "forbidden" for a moment on a hard refresh.
  // The first request after idle can take a minute (free hosting wakes up): say so, don't show a blank page.
  main.replaceChildren(loading());
  await loadSession();
  router.start();
  return router;
};
