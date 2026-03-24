import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  count: {
    color: "#2563eb",
    label: "Cantidad",
  },
} satisfies ChartConfig;

function generateLast7DaysHours() {
  const now = new Date();
  const hours: string[] = [];
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // oxlint-disable-next-line no-unmodified-loop-condition: it literally is being modified
  for (const d = new Date(start); d <= now; d.setHours(d.getHours() + 1)) {
    const iso = d.toISOString().slice(0, 13); // e.g., '2025-05-14T13'
    hours.push(`${iso.replace("T", " ")}:00:00`); // '2025-05-14 13:00:00'
  }

  return hours;
}

function generateAllTimeDays(start: Date) {
  const now = new Date();
  const days: string[] = [];

  // oxlint-disable-next-line no-unmodified-loop-condition: see above
  for (const d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10); // e.g., '2025-05-14'
    days.push(iso); // '2025-05-14'
  }

  return days;
}

function mergeUserCounts(
  fullHours: string[],
  data: { time: string; count: number }[]
) {
  const map = new Map(data.map((d) => [d.time, d.count]));

  return fullHours.map((time) => ({
    count: map.get(time) ?? 0,
    time,
  }));
}

export function UsersChart({
  chart,
  type,
}: {
  chart: { time: string; count: number }[];
  type: "last7days" | "alltime";
}) {
  const fullHours =
    type === "last7days"
      ? generateLast7DaysHours()
      : generateAllTimeDays(new Date(chart[0]?.time));
  const chartData = mergeUserCounts(fullHours, chart);

  return (
    <ChartContainer className="min-h-50 w-full" config={chartConfig}>
      <BarChart accessibilityLayer data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="time"
          tickFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString("es-AR", {
              day: "2-digit",
              hour: "numeric",
              month: "2-digit",
              timeZone: "UTC",
            });
          }}
          tickLine={false}
          tickMargin={10}
        />
        <YAxis
          axisLine={false}
          dataKey="count"
          tickLine={false}
          tickMargin={10}
        />
        <Bar dataKey="count" fill="var(--color-count)" />
        <ChartTooltip content={<ChartTooltipContent />} />
      </BarChart>
    </ChartContainer>
  );
}
