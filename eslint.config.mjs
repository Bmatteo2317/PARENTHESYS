import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const root = dirname(fileURLToPath(import.meta.url));
const eslintConfig = tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", `${root}/.next/**`] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);

export default eslintConfig;
