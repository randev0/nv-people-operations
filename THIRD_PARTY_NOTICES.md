# Third-party notices

## shadcn/ui

UI primitives in `src/components/ui/` derive from shadcn/ui (via the ERACare donor repository, see `docs/REUSE_MANIFEST.md`).

MIT License — Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Other dependencies are listed with their licences in `package-lock.json` / `node_modules/*/LICENSE`.

## Fonts and map data (added 2026-11-09)

- **Poppins** (Indian Type Foundry) and **Martian Mono** (Evil Martians), via `@fontsource/poppins@5.3.0` and `@fontsource/martian-mono@5.3.0`. Licensed under the SIL Open Font License 1.1.
- **dotted-map@3.1.0** (MIT). Used once at development time to generate the static dot coordinates in `src/components/dashboard/world-dots.ts`; not a runtime dependency.
