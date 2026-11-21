// Registers the ESM resolve hook used by `npm test` (node:test).
import { register } from "node:module";

register(new URL("./alias-hooks.mjs", import.meta.url));
