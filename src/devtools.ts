/**
 * Developer tools (skip 10 years, kill the main character) can destroy real progress,
 * so they exist only in builds made with an explicit flag:
 *
 *   VITE_ENABLE_DEV_TOOLS=true npm run dev
 *   VITE_ENABLE_DEV_TOOLS=true npm run build
 *
 * The default is OFF everywhere, including local development. The value is baked in at
 * build time; nothing at runtime (query string, storage, console) can turn it on.
 */
export const DEV_TOOLS: boolean = import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true';
