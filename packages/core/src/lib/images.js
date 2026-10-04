// Instant feedback for photo uploads. The server re-checks everything (it even inspects the
// file's bytes), so these checks are about saving the owner a round trip, not about security.

const mb = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * @param {{type: string, size: number} | null} file  a File, or anything with type and size
 * @param {{max_bytes: number, types: string[]} | null} rules  from /catalogue/options
 * @returns {string | null} a message for the owner, or null when the file looks fine
 */
export const validateImageFile = (file, rules) => {
  if (!file) return 'Choose a photo first.';
  if (file.size === 0) return 'That file is empty.';
  // If the rules could not be loaded, let the server decide rather than blocking the owner.
  if (!rules) return null;
  if (!rules.types.includes(file.type)) return 'Use a JPEG, PNG or WebP photo.';
  if (file.size > rules.max_bytes) return `Photos can be at most ${mb(rules.max_bytes)}.`;
  return null;
};

/** How many more photos this piece can take (never negative). */
export const remainingSlots = (count, rules) => (rules ? Math.max(0, rules.max_per_product - count) : Infinity);
