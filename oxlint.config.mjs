import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: ["routeTree.gen.ts"],
  rules: {
    "no-promise-executor-return": "off",
    "no-use-before-define": "off",

    "eslint/complexity": "off",
    "eslint/func-style": "off",
    "eslint/no-inline-comments": "off",
    "eslint/no-nested-ternary": "off",
    "eslint/no-param-reassign": "off",
    "eslint/no-unmodified-loop-condition": "off",
    "eslint/no-warning-comments": "warn",
    "eslint/sort-keys": "off",
    "eslint/func-name-matching": "off",

    "import/no-named-as-default": "off",

    "promise/avoid-new": "off",
    "promise/no-multiple-resolved": "off",
    "promise/prefer-await-to-callbacks": "off",

    "react/iframe-missing-sandbox": "off",
    "react-hooks/exhaustive-deps": "off",

    "react-perf/jsx-no-new-function-as-prop": "off",

    "typescript/ban-types": "off",
    "typescript/consistent-type-definitions": "off",
    "typescript/no-explicit-any": "off",
    "typescript/no-non-null-assertion": "off",

    "unicorn/no-abusive-eslint-disable": "warn",
    "unicorn/no-document-cookie": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/prefer-native-coercion-functions": "off",
  },
});
