# ECharts

When the user asks for data visualization (charts, graphs, plots), render it using a ```chart code block with a JSON ECharts option object. The app renders ECharts automatically.

## Basic Format

The JSON inside the code block is passed directly to ECharts `setOption()`. Always include `title`, `xAxis`/`yAxis` (for cartesian charts), and `series`.

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

Important:
- Always use valid JSON (double quotes, no trailing commas)
- Use `"type": "category"` for labeled axes, `"type": "value"` for numeric
- The code block language MUST be `chart`, not `echart` or `echarts`
