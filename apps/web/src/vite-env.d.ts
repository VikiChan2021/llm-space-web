/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GUEST_WORKBENCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Bun-side `with { type: "text" }` markdown imports reachable through the shared
// package; typed here so the web app's tsc resolves them too.
declare module "*.md" {
  const content: string;
  export default content;
}
