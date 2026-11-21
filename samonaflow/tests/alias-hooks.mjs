// Minimal Node ESM resolve hook so the built-in node:test runner can resolve
// the project's TypeScript files and `@/` path aliases without new packages.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function firstExistingFile(base) {
  const candidates = [
    base,
    ...extensions.map((extension) => `${base}${extension}`),
    ...extensions.map((extension) => path.join(base, `index${extension}`)),
  ];

  return candidates.find((candidate) => {
    try {
      return existsSync(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function resolvedUrl(specifier, parentURL) {
  if (specifier.startsWith("@/")) {
    return firstExistingFile(path.join(sourceRoot, specifier.slice(2)));
  }

  if (specifier.startsWith(".") && !path.extname(specifier)) {
    const parentPath = fileURLToPath(parentURL);
    return firstExistingFile(path.resolve(path.dirname(parentPath), specifier));
  }

  return undefined;
}

export async function resolve(specifier, context, nextResolve) {
  const resolved = resolvedUrl(specifier, context.parentURL ?? pathToFileURL(process.cwd()));
  if (resolved) {
    return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
