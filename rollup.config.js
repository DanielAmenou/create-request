import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import cleaner from "rollup-plugin-cleaner";
import pkg from "./package.json";

export default [
  // UMD build
  {
    input: "src/index.ts",
    output: {
      name: "createRequest",
      file: pkg.main,
      format: "umd",
      exports: "named",
    },
    plugins: [
      cleaner({
        targets: ["./dist/library"],
      }),
      resolve(),
      commonjs(),
      typescript({ tsconfig: "./tsconfig.json" }),
    ],
  },
  // ESM build
  {
    input: "src/index.ts",
    output: {
      file: pkg.module,
      format: "es",
      exports: "named",
    },
    plugins: [typescript({ tsconfig: "./tsconfig.json" })],
  },
];
