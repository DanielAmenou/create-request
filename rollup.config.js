import { visualizer } from "rollup-plugin-visualizer";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import cleaner from "rollup-plugin-cleaner";
import terser from "@rollup/plugin-terser";
import pkg from "./package.json" with { type: "json" };
import fs from "node:fs";

// Environment configuration
const isDev = process.env.ROLLUP_WATCH === "true" || process.env.BUILD_ENV === "development";
const isVisualize = process.env.ANALYZE === "true";
const shouldMinify = process.env.MINIFY === "true";

// Create bundle analysis directory if visualizing
if (isVisualize) {
  const bundleAnalysisDir = "dist/bundle-analysis";
  if (!fs.existsSync(bundleAnalysisDir)) {
    fs.mkdirSync(bundleAnalysisDir, { recursive: true });
  }
}

// Minification config for ESM builds
const esmTerserConfig = {
  compress: {
    pure_getters: true,
    passes: 3,
    unsafe: true,
    unsafe_comps: true,
    unsafe_math: true,
    unsafe_methods: true,
    drop_console: true,
    drop_debugger: true,
  },
  format: {
    comments: /^\s*(\/\*\*|\*\/|@|license|copyright)/i,
    ecma: 2018,
  },
  module: true,
};

// Minification config for UMD builds
const umdTerserConfig = {
  compress: {
    pure_getters: true,
    passes: 3,
    unsafe: true,
    unsafe_comps: true,
    unsafe_math: true,
    unsafe_methods: true,
    drop_console: false,
    drop_debugger: true,
    global_defs: {
      "process.env.NODE_ENV": "production",
    },
  },
  mangle: {
    properties: {
      regex: /^_/, // Only mangle properties starting with underscore
    },
  },
  format: {
    comments: /^\s*(\/\*\*|\*\/|@|license|copyright)/i,
    ecma: 2018,
  },
};

// Create visualizer plugin based on env flag
const getVisualizerPlugin = (filename = "analysis.html") =>
  isVisualize
    ? [
        visualizer({
          filename: "dist/bundle-analysis/" + filename,
          open: true,
          gzipSize: true,
          brotliSize: true,
          template: "treemap",
          sourcemap: true,
        }),
      ]
    : [];

// Tree-shaking options
const treeShakeOptions = {
  moduleSideEffects: false,
  propertyReadSideEffects: false,
  tryCatchDeoptimization: false,
};

// Base configuration for CommonJS
const cjsBaseConfig = {
  input: "src/index.ts",
  output: {
    format: "cjs",
    exports: "named",
    sourcemap: true,
    compact: shouldMinify,
    interop: "auto",
    esModule: false,
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      sourceMap: true,
      declaration: true,
    }),
  ],
  treeshake: treeShakeOptions,
};

// Base configuration for ESM
const esmBaseConfig = {
  input: "src/index.ts",
  output: {
    format: "es",
    exports: "named",
    sourcemap: true,
    compact: shouldMinify,
    esModule: true,
    interop: "auto",
  },
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
      sourceMap: true,
      declaration: false,
      declarationDir: undefined,
    }),
  ],
  treeshake: treeShakeOptions,
};

// Generate configurations
const configs = [];

// Add non-minified CJS
configs.push({
  ...cjsBaseConfig,
  output: {
    ...cjsBaseConfig.output,
    file: pkg.main.replace(".js", ".cjs"),
  },
  plugins: [
    cleaner({
      targets: ["./dist/library"],
    }),
    ...cjsBaseConfig.plugins,
    ...getVisualizerPlugin("cjs-bundle-analysis.html"),
  ],
});

// Add non-minified ESM
configs.push({
  ...esmBaseConfig,
  output: {
    ...esmBaseConfig.output,
    file: pkg.module,
  },
  plugins: [...esmBaseConfig.plugins, ...getVisualizerPlugin("esm-bundle-analysis.html")],
});

// Add minified versions if requested
if (shouldMinify || !isDev) {
  // Add minified CJS
  configs.push({
    ...cjsBaseConfig,
    output: {
      ...cjsBaseConfig.output,
      file: pkg.main.replace(".cjs", ".min.cjs"),
      compact: true,
    },
    plugins: [...cjsBaseConfig.plugins, terser(umdTerserConfig), ...getVisualizerPlugin("cjs-min-bundle-analysis.html")],
  });

  // Add minified ESM
  configs.push({
    ...esmBaseConfig,
    output: {
      ...esmBaseConfig.output,
      file: pkg.module.replace(".esm.js", ".esm.min.js"),
      compact: true,
    },
    plugins: [...esmBaseConfig.plugins, terser(esmTerserConfig), ...getVisualizerPlugin("esm-min-bundle-analysis.html")],
  });
}

export default configs;
