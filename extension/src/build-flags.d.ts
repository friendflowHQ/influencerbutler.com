// Build-time flags injected by esbuild's `define` (see esbuild.mjs).
//
// IB_IG_ENABLED gates the Instagram Goldmine feature. It is `false` in the
// default/public Web Store build so every Instagram code path, the popup
// launcher, and the goldmine/instagram entry points dead-code-eliminate out,
// leaving the published extension's permissions and behavior unchanged. The
// self-hosted build defines it `true`.
declare const IB_IG_ENABLED: boolean;
