import { el, link } from './dom.js';

const SECTIONS = [
  { to: '/admin', label: 'Dashboard', routes: ['admin'] },
  { to: '/admin/products', label: 'Products', routes: ['adminProducts', 'adminNew', 'adminEdit'] },
  { to: '/admin/discounts', label: 'Discounts', routes: ['adminDiscounts'] },
];

/**
 * The frame around every owner page: a sidebar (a top strip on phones) and a content area.
 * `activeRouteName` marks the current section with aria-current, which both styles it and tells
 * screen readers where they are. Add a new owner section by adding one line to SECTIONS.
 * @returns {{root: HTMLElement, content: HTMLElement}}
 */
export const adminShell = (activeRouteName) => {
  const nav = el(
    'nav',
    { className: 'admin-nav', attrs: { 'aria-label': 'Owner sections' } },
    ...SECTIONS.map((section) => {
      const a = link(section.to, section.label);
      if (section.routes.includes(activeRouteName)) a.setAttribute('aria-current', 'page');
      return a;
    }),
  );
  const content = el('div', { className: 'admin-content' });
  return { root: el('div', { className: 'admin-layout' }, nav, content), content };
};
