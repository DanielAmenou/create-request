import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2022",
  outDir: "dist",
  dts: true,
  sourcemap: false,
  minify: false,
  clean: true,
  publint: true,
  attw: { profile: "node16" },
  exports: false,
  outputOptions: {
    exports: "named",
    // JSDoc lives in the .d.ts files (that is what IDEs read); keep the JS lean.
    comments: { jsdoc: false, legal: false, annotation: true },
  },
});
