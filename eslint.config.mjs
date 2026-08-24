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
    rules: {
      // `const { idempotencyKey: _drop, ...rest } = input` is how the schema
      // tests build an invalid payload. The underscore is the signal that the
      // binding exists only to be discarded.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // These four render images that `next/image` cannot handle: an inline
    // `data:` URI generated in the browser (the QR code), sponsor and crest
    // artwork uploaded to Supabase storage at arbitrary unknown dimensions,
    // and player cut-outs whose whole point is a hand-placed `object-position`
    // focal point with no resizing. A plain `<img>` is the correct element in
    // each case, so the LCP advice does not apply.
    files: [
      "src/components/brand/EventMark.tsx",
      "src/components/brand/EventQr.tsx",
      "src/components/brand/SponsorLogo.tsx",
      "src/components/player/PlayerPhoto.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
