// ALL the words and links of the public site that are not product data, in one place.
// The owner edits this file (or asks for changes) to replace the placeholder copy. Plain data,
// no logic, so editing it cannot break anything except what you can see.

export const site = {
  brandName: 'Isabella Fashion Finds',
  topbar: 'Placeholder: free delivery on orders over ₦50,000',
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
  // Landing page. `image: null` shows a colour gradient; set a path/URL to use a photo.
  hero: {
    title: 'Placeholder: a line that says who you are',
    subtitle: 'Placeholder: one friendly sentence about the pieces you sell.',
    cta: 'Shop now',
    image: null,
  },
  // Tiles under "Collection". Until real categories exist they all open the shop.
  tiles: [
    { label: 'Dresses', to: '/shop', image: null },
    { label: 'Tops', to: '/shop', image: null },
    { label: 'Trousers', to: '/shop', image: null },
    { label: 'Accessories', to: '/shop', image: null },
  ],
  banner: {
    title: 'Placeholder: what makes your pieces special',
    text: 'Placeholder: two sentences about quality, sourcing or your story.',
    cta: 'Read our story',
    to: '/about',
  },
  copyright: 'Isabella Fashion Finds. All rights reserved.',
};
