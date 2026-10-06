// Text of the informational pages. EVERYTHING here is PLACEHOLDER copy to be replaced by the
// owner; the legal pages in particular must be reviewed before real customers use the shop.
// Shape: { title, sections: [{ heading, body: [paragraph, ...] }] }. Plain text only.

export const pages = {
  about: {
    title: 'Our story',
    sections: [
      { heading: 'Who we are', body: ['Isabella Fashion Finds began with a simple idea: good clothes should be easy to find and easy to fit. We pick pieces we would wear ourselves and describe them honestly. (Filler text: replace with your own story.)'] },
      { heading: 'What we believe', body: ['Quality over quantity, accurate measurements, and fair prices. We would rather sell fewer pieces that customers love than many that come back.'] },
      { heading: 'How we choose our pieces', body: ['Each piece is inspected, measured and photographed before it goes on the shop. If something is not right, it does not get listed.'] },
    ],
  },
  'shipping-returns': {
    title: 'Shipping & returns',
    sections: [
      { heading: 'Delivery', body: ['We deliver across Nigeria. Orders are packed within two working days; delivery usually takes three to seven working days depending on your location. (Filler text: confirm the real terms.)'] },
      { heading: 'Returns and exchanges', body: ['If a piece does not fit, contact us within seven days of delivery. Items must be unworn with the tags attached. (Filler text: confirm the real terms.)'] },
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    sections: [
      { heading: 'How do I find my size?', body: ['Each piece lists its measurements on its page. Compare them with a garment that fits you well.'] },
      { heading: 'Can I change my order after paying?', body: ['Contact us as soon as possible. If your order has not been packed yet we will gladly change it.'] },
      { heading: 'How do I pay?', body: ['Online payment by card and bank transfer will be available soon.'] },
    ],
  },
  contact: {
    title: 'Contact us',
    sections: [
      { heading: 'Get in touch', body: ['Email, phone and WhatsApp details will appear here. We reply within one working day. (Filler text: add the real contact details.)'] },
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
