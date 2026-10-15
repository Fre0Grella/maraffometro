/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module "vue-router" {
  interface RouteMeta {
    /** Needs a signed-in player. */
    auth?: boolean;
  }
}

export {};
