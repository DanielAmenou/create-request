/**
 * Custom ESM loader that redirects imports from ../src/* to ../dist/library/index.esm.js
 * This allows running the same test files against the compiled library.
 * Since the compiled library bundles everything into index.esm.js, all imports
 * from ../src/* are redirected to the main bundle.
 */

const SOURCE_PATTERN = /^\.\.\/src\//;
const COMPILED_ENTRY = '../dist/library/index.esm.js';

export async function resolve(specifier, context, nextResolve) {
  // Redirect all ../src/* imports to the compiled bundle
  // The compiled library exports everything from index.esm.js
  if (SOURCE_PATTERN.test(specifier)) {
    // Redirect to the main compiled bundle
    // All exports are available from index.esm.js
    return await nextResolve(COMPILED_ENTRY, context);
  }
  
  // For all other imports, use the default resolver
  return nextResolve(specifier, context);
}

