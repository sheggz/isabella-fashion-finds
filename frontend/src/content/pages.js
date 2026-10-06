// Text of the informational pages. EVERYTHING here is PLACEHOLDER copy to be replaced by the
// owner; the legal pages in particular must be reviewed before real customers use the shop.
// Shape: { title, sections: [{ heading, body: [paragraph, ...] }] }. Plain text only.

export const pages = {
  about: {
    title: 'Our story',
    sections: [
      { heading: 'Who we are', body: ['Placeholder: a few sentences about Isabella Fashion Finds, who runs it and why it exists.'] },
      { heading: 'What we believe', body: ['Placeholder: the values behind the pieces you choose (quality, fit, fair prices).'] },
      { heading: 'How we choose our pieces', body: ['Placeholder: where the pieces come from and how each one is checked before it is listed.'] },
    ],
  },
  'shipping-returns': {
    title: 'Shipping & returns',
    sections: [
      { heading: 'Delivery', body: ['Placeholder: delivery areas, how long it takes and what it costs.'] },
      { heading: 'Returns and exchanges', body: ['Placeholder: how many days customers have, the condition pieces must be in and how to start a return.'] },
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    sections: [
      { heading: 'How do I find my size?', body: ['Each piece lists its measurements on its page. Compare them with a garment that fits you well.'] },
      { heading: 'Can I change my order after paying?', body: ['Placeholder: explain the rule here.'] },
      { heading: 'How do I pay?', body: ['Placeholder: payment methods will be described when online payment is switched on.'] },
    ],
  },
  contact: {
    title: 'Contact us',
    sections: [
      { heading: 'Get in touch', body: ['Placeholder: the shop email address, phone or WhatsApp number and opening hours.'] },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    sections: [
      { heading: 'What we collect', body: ['When you sign in with Google we receive your name and email address. We store your cart and orders so the shop can work.'] },
      { heading: 'How we use it', body: ['To show your orders, process payments and send messages about your purchases. We do not sell your data.'] },
      { heading: 'Your choices', body: ['Placeholder: how to ask for your data to be corrected or deleted. Have this page reviewed before launch.'] },
    ],
  },
  terms: {
    title: 'Terms & conditions',
    sections: [
      { heading: 'Using the shop', body: ['Placeholder: the rules for buying from this shop. Have this page reviewed before launch.'] },
      { heading: 'Prices and availability', body: ['Prices are in naira and are confirmed at checkout. Stock is only held once an order is paid.'] },
    ],
  },
};
