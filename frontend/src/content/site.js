// ALL the words and links of the public site that are not product data, in one place.
// The owner edits this file (or asks for changes) to replace the placeholder copy. Plain data,
// no logic, so editing it cannot break anything except what you can see.

import { brandContent } from '@isabella/core';

export const site = {
  brandName: brandContent.brandName,
  topbar: 'Free delivery on orders over ₦50,000 (placeholder offer)',
  // Main navigation (header). `to` is an in-app path.
  nav: [
    { to: '/shop', label: 'Shop' },
    { to: '/about', label: 'About' },
  ],
  footerColumns: [
    {
      title: 'About',
      links: [
        { to: '/about', label: 'Our story' },
        { to: '/shop', label: 'Shop all' },
      ],
    },
    {
      title: 'Help',
      links: [
        { to: '/shipping-returns', label: 'Shipping & returns' },
        { to: '/faq', label: 'FAQ' },
        { to: '/contact', label: 'Contact us' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { to: '/privacy', label: 'Privacy policy' },
        { to: '/terms', label: 'Terms & conditions' },
      ],
    },
  ],
  // Landing page.
  // The hero text and photo are shared with the phone app: edit them in packages/core/src/content.js.
  hero: brandContent.hero,
  // Tiles under "Collection". Until real categories exist they all open the shop.
  tiles: [
    { label: 'Dresses', to: '/shop', image: 'https://picsum.photos/seed/tile-dresses/600/700' },
    { label: 'Tops', to: '/shop', image: 'https://picsum.photos/seed/tile-tops/600/700' },
    { label: 'Trousers', to: '/shop', image: 'https://picsum.photos/seed/tile-trousers/600/700' },
    { label: 'Accessories', to: '/shop', image: 'https://picsum.photos/seed/tile-accessories/600/700' },
  ],
  banner: {
    title: 'Quality you can feel, fits you can trust',
    text: 'Every piece is checked by hand before it is listed, and every listing shows real measurements so you can order with confidence.',
    cta: 'Read our story',
    to: '/about',
  },
  copyright: 'Isabella Fashion Finds. All rights reserved.',
};
