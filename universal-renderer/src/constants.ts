/**
 * SSR marker constants used for template placeholders.
 * These markers are replaced during the rendering process.
 */
export const SSR_MARKERS = Object.freeze({
  /** Placeholder for injecting SSR head content: `<!-- SSR_HEAD -->` */
  HEAD: "<!-- SSR_HEAD -->",
  /** Placeholder for injecting SSR body content: `<!-- SSR_BODY -->` */
  BODY: "<!-- SSR_BODY -->",
} as const);
