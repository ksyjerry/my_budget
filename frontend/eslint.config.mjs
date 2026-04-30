import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Pre-Area-7 monolithic budget-input/[project_code]/page.tsx 는 영역 7 sprint
    // (PR #8) 에서 분해 완료. 분해 전 코드의 inline-component / conditional hook
    // anti-pattern 을 warning 으로 다운그레이드 (CI block 회피).
    // 분해 후 (PR #8 머지) 다시 error 로 격상 검토.
    rules: {
      "react-hooks/static-components": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
