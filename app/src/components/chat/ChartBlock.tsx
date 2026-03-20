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

const ChartBlock = memo(function ChartBlock({ code, onError }: { code: string; onError?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let option: Record<string, unknown>;
    try {
      const parsed = JSON.parse(code);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        onError?.();
        return;
      }
      option = parsed;
    } catch {
      onError?.();
      return;
    }

    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();

    const theme = getThemeOverrides();
    const merged = deepMerge(theme, option);
    merged.backgroundColor = "transparent";
    delete merged.toolbox;
    delete merged.dataZoom;
    if (merged.tooltip && typeof (merged.tooltip as any).formatter === "string") {
      delete (merged.tooltip as any).formatter;
    }

    if (typeof merged.title === "string") {
      merged.title = { text: merged.title };
    }
    if (typeof merged.subtitle === "string") {
      merged.title = { ...(merged.title as any ?? {}), subtext: merged.subtitle };
      delete merged.subtitle;
    }
    if (typeof merged.legend === "string") {
      merged.legend = { data: [merged.legend] };
    }
    if (Array.isArray(merged.legend)) {
      merged.legend = { data: merged.legend };
    }
    if (typeof merged.xAxis === "string") {
      merged.xAxis = { type: merged.xAxis };
    }
    if (typeof merged.yAxis === "string") {
      merged.yAxis = { type: merged.yAxis };
    }

    for (const key of ["series", "xAxis", "yAxis", "grid", "visualMap", "dataZoom", "geo", "parallel", "radar", "tooltip", "title", "legend"] as const) {
      const val = merged[key];
      if (val == null) continue;
      if (Array.isArray(val)) {
        merged[key] = val.filter((v: any) => v && typeof v === "object" && !Array.isArray(v));
      }
    }
    if (merged.series && !Array.isArray(merged.series)) {
      merged.series = [merged.series];
    }

    const hasHeatmap = Array.isArray(merged.series) && (merged.series as any[]).some((s: any) => s.type === "heatmap");
    if (hasHeatmap && merged.visualMap) {
      const vm = merged.visualMap as Record<string, any>;
      vm.orient = "vertical";
      vm.left = 0;
      vm.top = "middle";
      delete vm.bottom;
    }

    let disposed = false;
    const raf = requestAnimationFrame(() => {
      if (disposed) return;

      const chart = echarts.init(el, undefined, { renderer: "canvas" });
      chartRef.current = chart;

      try {
        chart.setOption(merged);
      } catch (err) {
        console.warn("ECharts setOption failed:", err);
        chart.dispose();
        chartRef.current = null;
        onError?.();
        return;
      }

      ro.observe(el);
    });

    const ro = new ResizeObserver(() => chartRef.current?.resize());

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [code]);

  return <div ref={containerRef} className={styles.chart} />;
});

export default ChartBlock;
