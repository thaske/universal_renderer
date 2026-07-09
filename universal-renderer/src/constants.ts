/**
 * SSR marker constants used for template placeholders.
 * These markers are replaced during the rendering process.
 */
export enum SSR_MARKERS {
  /** Placeholder for injecting SSR head content: `<!-- SSR_HEAD -->` */
  HEAD = "<!-- SSR_HEAD -->",
  /** Placeholder for injecting SSR body content: `<!-- SSR_BODY -->` */
  BODY = "<!-- SSR_BODY -->",
}
