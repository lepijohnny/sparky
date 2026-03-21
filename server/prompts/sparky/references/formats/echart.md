# ECharts

## Intro

Render data visualizations using a ` ```chart ` fenced code block containing a JSON ECharts option object. The JSON is passed directly to ECharts `setOption()`. The app renders the chart automatically.

## When to Use

| User request | Chart type | Key properties |
|-------------|-----------|----------------|
| Bar chart, comparison across categories | `bar` | `xAxis.type: "category"`, `series.type: "bar"` |
| Line chart, trends over time | `line` | `xAxis.type: "category"`, `series.type: "line"` |
| Pie chart, proportions, shares | `pie` | `series.type: "pie"`, `series.radius` |
| Scatter plot, correlation, distribution | `scatter` | `xAxis.type: "value"`, `series.type: "scatter"` |
| Area chart, cumulative data | `line` | `series.type: "line"`, `series.areaStyle: {}` |
| Radar chart, multi-axis comparison | `radar` | `radar.indicator`, `series.type: "radar"` |
| Heatmap, density | `heatmap` | `series.type: "heatmap"`, `visualMap` |

## Examples

### Bar Chart
```chart
{
  "title": { "text": "Monthly Sales" },
  "xAxis": { "type": "category", "data": ["Jan", "Feb", "Mar", "Apr", "May"] },
  "yAxis": { "type": "value" },
  "series": [{ "type": "bar", "data": [120, 200, 150, 80, 70] }]
}
```

### Line Chart
```chart
{
  "title": { "text": "Temperature Trend" },
  "xAxis": { "type": "category", "data": ["Mon", "Tue", "Wed", "Thu", "Fri"] },
  "yAxis": { "type": "value", "name": "°C" },
  "series": [
    { "type": "line", "name": "High", "data": [22, 25, 28, 24, 20], "smooth": true },
    { "type": "line", "name": "Low", "data": [12, 15, 18, 14, 10], "smooth": true }
  ],
  "legend": { "data": ["High", "Low"] }
}
```

### Pie Chart
```chart
{
  "title": { "text": "Browser Share" },
  "series": [{
    "type": "pie",
    "radius": "60%",
    "data": [
      { "name": "Chrome", "value": 65 },
      { "name": "Firefox", "value": 15 },
      { "name": "Safari", "value": 12 },
      { "name": "Other", "value": 8 }
    ]
  }]
}
```

### Scatter Plot
```chart
{
  "title": { "text": "Height vs Weight" },
  "xAxis": { "type": "value", "name": "Height (cm)" },
  "yAxis": { "type": "value", "name": "Weight (kg)" },
  "series": [{
    "type": "scatter",
    "data": [[165, 60], [170, 70], [175, 75], [180, 85], [160, 55]]
  }]
}
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using ` ```echart ` or ` ```echarts ` | Use ` ```chart ` — the fence language must be `chart` |
| Trailing commas in JSON | Remove them — JSON does not allow trailing commas |
| Single quotes in JSON | Use double quotes only |
| `"title": "Monthly Sales"` (string) | Use object: `"title": { "text": "Monthly Sales" }` |
| `"legend": "High"` (string) | Use object: `"legend": { "data": ["High", "Low"] }` |
| Missing `xAxis.type` | Always set `"type": "category"` or `"type": "value"` |
| Single series object instead of array | Wrap in array: `"series": [{ ... }]` |
| Using Chart.js format (`labels`, `datasets`, `backgroundColor`) | This is **ECharts**, not Chart.js. Use `series`, `xAxis`, `yAxis`. See examples above. |
