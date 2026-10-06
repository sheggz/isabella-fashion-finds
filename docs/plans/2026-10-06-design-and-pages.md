# Plan: design system, landing/shop/about pages, owner dashboard

Added 2026-10-06 at the owner's request, **before** the mobile app (Block 5), so the app reuses the same tokens and page structure. The Figma template (a fashion storefront) is used for **layout inspiration only**: its logo, photos and copy belong to someone else and are not copied; ours are placeholders the owner replaces.

## Decisions (agreed)
- Do it now, before the mobile app. Placeholders for photos/text, kept in one editable content file. A simple About page. Extra fundamental pages added from the navigation review.
- **Re-themeable brand kit:** colours, fonts and radius live in ONE file (`packages/core/src/theme.js`). The website turns it into CSS variables; the mobile app will read the same values. Rebranding = editing that file. A validator in the tests rejects typos.
- Hosting: Netlify (website) and Render (API) redeploy automatically on every merge to `main` (Netlify watches GitHub; Render `autoDeploy: true`). Vercel is not used.

## Blocks
| Block | Content | Status |
|---|---|---|
| D1 | Brand tokens in core, web theme glue, fonts, no hard-coded colours | **Done 2026-10-06** |
| D2 | Site shell: announcement strip, new header (nav, cart icon), rich footer, mobile menu | **Done 2026-10-06** |
| D3 | Landing page `/` (hero, best sellers from the real catalogue, collection tiles, values banner, newsletter-style CTA) and Shop page `/shop` (grid, later filters) | **Done 2026-10-06** |
| D4 | About page and info pages: Shipping & Returns, FAQ, Contact, Privacy, Terms (text from one content file; Privacy and Terms are also required by Google and Paystack) | **Done 2026-10-06** |
| D5 | Admin restyle with a sidebar layout (Products, Discounts, later Orders, Dashboard) | **Done 2026-10-06** |
| D6 | Owner dashboard (backend + UI): stock levels and low-stock list, sales totals by day/week, best sellers, recent orders. Needs paid orders, so full numbers arrive after Paystack (Block 10); stock part works now | **Done 2026-10-06** (no DB change needed: orders already snapshot items; low-stock threshold is a query setting) |

## Navigation (proposed)
Header: Shop, New in, About, (Sign in / account). Footer: About, Shipping & Returns, FAQ, Contact, Privacy, Terms. Items from the template not adopted now: Plus Size and Sustainability (need real product categories and brand copy), wishlist (later), search (later, once the catalogue is bigger).
