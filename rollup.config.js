import { visualizer } from "rollup-plugin-visualizer";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import cleaner from "rollup-plugin-cleaner";
import terser from "@rollup/plugin-terser";
import pkg from "./package.json";
import fs from "node:fs";

// Environment configuration
const isDev = process.env.ROLLUP_WATCH === "true" || process.env.BUILD_ENV === "development";
const isVisualize = process.env.ANALYZE === "true";

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

export default [
  // CommonJS build
  {
    input: "src/index.ts",
    output: {
      file: pkg.main,
      format: "cjs",
      exports: "named",
      sourcemap: true,
      compact: true,
      interop: "auto",
    },
    plugins: [
      cleaner({
        targets: ["./dist/library"],
      }),
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
      ...(!isDev ? [terser(umdTerserConfig)] : []),
      ...getVisualizerPlugin("cjs-bundle-analysis.html"),
    ],
    treeshake: treeShakeOptions,
  },
  // ESM build
  {
    input: "src/index.ts",
    output: {
      file: pkg.module,
      format: "es",
      exports: "auto",
      sourcemap: true,
      compact: true,
    },
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        declaration: false,
        declarationDir: undefined,
      }),
      ...(!isDev ? [terser(esmTerserConfig)] : []),
      ...getVisualizerPlugin("esm-bundle-analysis.html"),
    ],
    treeshake: treeShakeOptions,
  },
];
