# 0008. Fixed size list with per-product, per-size measurements

Status: Accepted · Date: 2026-10-01

## Context
Customers need to judge fit, and a size label alone ("M") means different things on different pieces. The owner wanted a fixed set of sizes and the ability to describe body-part lengths for each size.

## Decision
- Sizes come from one fixed list: `XS, S, M, L, XL, XXL, ONE_SIZE`, defined once in `app/domain/sizing.py`. Input is normalised ("one size" -> `ONE_SIZE`), anything else is rejected.
- **Measurements belong to each product's size** (the variant), not to a global size chart, because the same label is cut differently on different pieces.
- Allowed body parts are also a fixed vocabulary: bust, waist, hips, shoulder, sleeve, length, inseam. Values are centimetres, positive, at most 300, rounded to one decimal. All optional.
- Stored as JSON (JSONB on Postgres) in `product_variants.measurements`.
- Rules are enforced in the schema (HTTP boundary) and by a database check on `size`. The frontend reads sizes and body parts from `GET /catalogue/options` instead of duplicating them.

## Alternatives considered
- **Global size chart (one table of M = bust 92 ...):** simple, but wrong for garments cut differently; owner can't state real garment dimensions per piece.
- **Free-form sizes:** flexible but inconsistent ("m", "Medium", "M "), hard to sort, filter and display.
- **Separate `variant_measurements` table:** fully relational and queryable per body part, but more joins and code for data we only display. Can be migrated to later if we need to filter by measurement.
- **Free-form body-part keys:** more flexible, but unvalidated keys lead to typos and an inconsistent UI.

## Consequences
- (+) Consistent sizes everywhere; the owner gives real garment dimensions; one source of truth feeds backend, database and UI.
- (-) Adding a size or body part is a code change and, for sizes, a migration (the DB check lists them). Measurements cannot be queried efficiently by individual part without extra indexes. Units are centimetres only (no inch toggle yet).
