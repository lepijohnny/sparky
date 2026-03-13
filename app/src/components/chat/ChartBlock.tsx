import { memo, useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart, RadarChart, GaugeChart, FunnelChart, HeatmapChart, TreemapChart, SankeyChart, GraphChart, CandlestickChart } from "echarts/charts";
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import styles from "./ChartBlock.module.css";

echarts.use([
  BarChart, LineChart, PieChart, ScatterChart, RadarChart, GaugeChart,
  FunnelChart, HeatmapChart, TreemapChart, SankeyChart, GraphChart, CandlestickChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

function deepMerge(base: Record<string, any>, override: Record<string, any>): Record<string, any> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const bv = base[key];
    const ov = override[key];
    if (bv && ov && typeof bv === "object" && typeof ov === "object" && !Array.isArray(bv) && !Array.isArray(ov)) {
      result[key] = deepMerge(bv, ov);
    } else {
      result[key] = ov;
    }
  }
  return result;
}

function getThemeOverrides(): Record<string, unknown> {
  const cs = getComputedStyle(document.documentElement);
  const fg = cs.getPropertyValue("--fg").trim() || "#e0e0e0";
  const bg = cs.getPropertyValue("--bg").trim() || "#1a1a2e";
  const surface = cs.getPropertyValue("--bg-surface").trim() || "#2a2a4a";
  const muted = cs.getPropertyValue("--fg-muted").trim() || "#888";
  const subtle = cs.getPropertyValue("--fg-subtle").trim() || "#555";
  const accent = cs.getPropertyValue("--accent").trim() || "#7575d0";
  const border = cs.getPropertyValue("--border").trim() || "#3a3a5c";

  return {
    textStyle: { color: fg, fontFamily: "inherit" },
    title: { textStyle: { color: fg, fontSize: 14, fontWeight: 500 }, left: "center" },
    legend: { textStyle: { color: muted, fontSize: 11 } },
    tooltip: {
      backgroundColor: surface,
      borderColor: border,
      textStyle: { color: fg, fontSize: 11 },
      trigger: "axis",
    },
    xAxis: {
      axisLine: { lineStyle: { color: border } },
      axisLabel: { color: muted, fontSize: 10 },
      splitLine: { lineStyle: { color: border, opacity: 0.3 } },
      axisTick: { lineStyle: { color: border } },
    },
    yAxis: {
      axisLine: { lineStyle: { color: border } },
      axisLabel: { color: muted, fontSize: 10 },
      splitLine: { lineStyle: { color: border, opacity: 0.3 } },
      axisTick: { lineStyle: { color: border } },
    },
    color: [
      accent,
      "#34c759",
      "#f5a623",
      "#ef4444",
      "#a855f7",
      "#06b6d4",
      "#ec4899",
      "#84cc16",
    ],

    grid: {
      left: "15%",
      right: "8%",
      bottom: "12%",
      top: "15%",
      containLabel: true,
    },
    visualMap: {
      textStyle: { color: muted, fontSize: 10 },
      inRange: { color: [bg, accent] },
      top: "middle",
    },
  };
}

const ChartBlock = memo(function ChartBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let option: Record<string, unknown>;
    try {
      option = JSON.parse(code);
    } catch {
      el.textContent = "Invalid chart JSON";
      return;
    }

    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const theme = getThemeOverrides();
    const merged = deepMerge(theme, option);
    merged.backgroundColor = "transparent";
    delete merged.toolbox;
    delete merged.dataZoom;
    if (merged.tooltip && typeof (merged.tooltip as any).formatter === "string") {
      delete (merged.tooltip as any).formatter;
    }

    const hasHeatmap = Array.isArray(merged.series) && (merged.series as any[]).some((s: any) => s.type === "heatmap");
    if (hasHeatmap && merged.visualMap) {
      const vm = merged.visualMap as Record<string, any>;
      vm.orient = "vertical";
      vm.left = 0;
      vm.top = "middle";
      delete vm.bottom;
    }

    chart.setOption(merged);

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [code]);

  return <div ref={containerRef} className={styles.chart} />;
});

export default ChartBlock;
