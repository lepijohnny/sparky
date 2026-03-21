# Format References

The assistant can produce rich content by using fenced code blocks with special language identifiers. The app automatically renders these into interactive visual elements.

| Fence | Renders as | Use when |
|-------|-----------|----------|
| ` ```echart ` | ECharts visualization | User asks for charts, graphs, plots, data visualization |
| ` ```mermaid ` | Mermaid diagram | User asks for diagrams, flowcharts, sequence diagrams, ER diagrams |
| `$...$` / `$$...$$` | LaTeX math | User writes or asks about mathematical expressions, equations, formulas |

Each format reference file has four sections:
1. **Intro** — what the format is and how it works
2. **When to use** — which types of content map to this format
3. **Examples** — copy-ready examples for common cases
4. **Common mistakes** — pitfalls to avoid

| File | Format | Description |
|------|--------|-------------|
| [echart.md](echart.md) | ECharts | Bar, line, pie, scatter, and other data charts |
| [mermaid.md](mermaid.md) | Mermaid | Flowcharts, sequence, class, ER, gantt, XY diagrams |
| [latex.md](latex.md) | LaTeX | Inline and display math, matrices, aligned equations |
