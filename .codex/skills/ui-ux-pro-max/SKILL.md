---
name: ui-ux-pro-max
description: UI/UX design intelligence for generating implementation-ready design systems from a local searchable dataset of styles, colors, typography, landing patterns, UX rules, and stack guidance. Use when designing, redesigning, reviewing, or implementing web/mobile interfaces, including requests for visual direction, accessibility fixes, landing page structure, dashboard UX, or frontend stack-specific UI patterns.
---

# UI UX Pro Max

## Overview

Translate product and UI requirements into a concrete design system, then query targeted guidance for implementation details by domain and frontend stack.

## Workflow

1. Extract requirements from the request.
- Capture product type, audience, industry, visual tone, required pages, and target stack.
- If the stack is not specified, default to `html-tailwind`.

2. Generate a complete design system first.
```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -p "<Project Name>"
```
- Use this as the baseline before writing or reviewing UI code.

3. Persist the design system when work spans multiple pages or sessions.
```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "<Project Name>" [--page "<page-name>"]
```
- Read `design-system/<project-slug>/MASTER.md` first.
- If `design-system/<project-slug>/pages/<page-name>.md` exists, prioritize those overrides.

4. Query focused guidance for details.
```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n 5]
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack <stack> [-n 5]
```

5. Implement with a quality gate.
- Enforce clear hierarchy, responsive layout, accessible contrast, visible focus states, and consistent motion.
- Use SVG icon sets (Heroicons, Lucide, Simple Icons); avoid emoji icons.

## Domains

Use `--domain` with:
- `product`, `style`, `color`, `typography`, `landing`, `chart`, `ux`, `icons`, `react`, `web`

## Stacks

Use `--stack` with:
- `html-tailwind`, `react`, `nextjs`, `astro`, `vue`, `nuxtjs`, `nuxt-ui`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`

## Output Modes

Generate design-system output as:
```bash
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -f ascii
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -f markdown
```

## Resource Layout

- `scripts/search.py`: CLI entrypoint for domain, stack, and design-system generation
- `scripts/core.py`: BM25 search engine and dataset configuration
- `scripts/design_system.py`: multi-domain aggregation and reasoning rules
- `data/*.csv`: style system knowledge base and stack playbooks
