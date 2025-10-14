// @ts-check

import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { configs, parser } from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import pluginPromise from 'eslint-plugin-promise'

import { includeIgnoreFile } from '@eslint/compat';
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, ".gitignore");

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  {
    ignores: [
      'bin',
      'node_modules/**/*',
    ],
  },
  eslint.configs.recommended,
  ...configs.strict,
  ...configs.stylistic,
  // @ts-expect-error 型定義が修正されるまで
  pluginPromise.configs['flat/recommended'],
  {
    files: ['**/*.ts'],
    extends: [
      importPlugin.flatConfigs.recommended,
      importPlugin.flatConfigs.typescript,
    ],
    languageOptions: {
      parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: 'tsconfig-test.json'
      }
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/quotes': ['error', 'single'],
    },
  },
);
