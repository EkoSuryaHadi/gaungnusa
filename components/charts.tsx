"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// Recharts v3 requires browser APIs — must disable SSR
export const BarChart = dynamic(
  () => import("recharts").then((m) => m.BarChart),
  { ssr: false }
) as ComponentType<any>;

export const Bar = dynamic(
  () => import("recharts").then((m) => m.Bar),
  { ssr: false }
) as ComponentType<any>;

export const PieChart = dynamic(
  () => import("recharts").then((m) => m.PieChart),
  { ssr: false }
) as ComponentType<any>;

export const Pie = dynamic(
  () => import("recharts").then((m) => m.Pie),
  { ssr: false }
) as ComponentType<any>;

export const LineChart = dynamic(
  () => import("recharts").then((m) => m.LineChart),
  { ssr: false }
) as ComponentType<any>;

export const Line = dynamic(
  () => import("recharts").then((m) => m.Line),
  { ssr: false }
) as ComponentType<any>;

export const AreaChart = dynamic(
  () => import("recharts").then((m) => m.AreaChart),
  { ssr: false }
) as ComponentType<any>;

export const Area = dynamic(
  () => import("recharts").then((m) => m.Area),
  { ssr: false }
) as ComponentType<any>;

export const XAxis = dynamic(
  () => import("recharts").then((m) => m.XAxis),
  { ssr: false }
) as ComponentType<any>;

export const YAxis = dynamic(
  () => import("recharts").then((m) => m.YAxis),
  { ssr: false }
) as ComponentType<any>;

export const CartesianGrid = dynamic(
  () => import("recharts").then((m) => m.CartesianGrid),
  { ssr: false }
) as ComponentType<any>;

export const Tooltip = dynamic(
  () => import("recharts").then((m) => m.Tooltip),
  { ssr: false }
) as ComponentType<any>;

export const Legend = dynamic(
  () => import("recharts").then((m) => m.Legend),
  { ssr: false }
) as ComponentType<any>;

export const Cell = dynamic(
  () => import("recharts").then((m) => m.Cell),
  { ssr: false }
) as ComponentType<any>;

export const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false }
) as ComponentType<any>;
