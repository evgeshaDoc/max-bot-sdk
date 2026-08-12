/** Result returned by MAX action endpoints, including typed business failures. */
export type ActionResponse =
  | { readonly success: true; readonly message?: string }
  | { readonly success: false; readonly message?: string };
