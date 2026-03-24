import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { orpcClient } from "@/lib/orpc";

const LazyUsersChart = lazy(async () => {
  const module = await import("@/components/admin/users-chart");

  return { default: module.UsersChart };
});

export const Route = createFileRoute("/admin/users/")({
  component: RouteComponent,
  loader: () => orpcClient.user.getDashboard(),
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-bold text-2xl">Usuarios</h1>
      <div className="flex flex-col gap-4">
        <SummaryCards
          activeLastDay={data.activeLastDay}
          activeLastWeek={data.activeLastWeek}
          activePatronsCount={data.activePatronsCount}
          bannedUsersCount={data.bannedUsersCount}
          newThisWeekCount={data.newThisWeekCount}
          newTodayCount={data.newTodayCount}
          userCount={data.userCount}
          verifiedEmailsCount={data.verifiedEmailsCount}
        />
        <div className="grid grid-cols-2 gap-4">
          <RoleDistribution usersByRole={data.usersByRole} />
          <PatronTiers patronsByTier={data.patronsByTier} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Últimos 7 días</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<ChartFallback />}>
                <LazyUsersChart
                  chart={data.registeredLastWeek}
                  type="last7days"
                />
              </Suspense>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Todo el tiempo</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<ChartFallback />}>
                <LazyUsersChart chart={data.registeredAllTime} type="alltime" />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ChartFallback() {
  return (
    <div className="min-h-50 w-full animate-pulse rounded-md bg-muted/50" />
  );
}

function SummaryCards({
  userCount,
  newTodayCount,
  newThisWeekCount,
  activePatronsCount,
  verifiedEmailsCount,
  bannedUsersCount,
  activeLastDay,
  activeLastWeek,
}: {
  userCount: number;
  newTodayCount: number;
  newThisWeekCount: number;
  activePatronsCount: number;
  verifiedEmailsCount: number;
  bannedUsersCount: number;
  activeLastDay: number;
  activeLastWeek: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Usuarios" value={userCount} />
        <StatCard title="Nuevos Hoy" value={newTodayCount} />
        <StatCard title="Nuevos Esta Semana" value={newThisWeekCount} />
        <StatCard title="Patrons Activos" value={activePatronsCount} />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Emails Verificados" value={verifiedEmailsCount} />
        <StatCard title="Usuarios Baneados" value={bannedUsersCount} />
        <StatCard title="Activos (24h)" value={activeLastDay} />
        <StatCard title="Activos (7d)" value={activeLastWeek} />
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-bold text-4xl">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

function RoleDistribution({
  usersByRole,
}: {
  usersByRole: { role: string; count: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuarios por Rol</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {usersByRole.map((item) => (
            <li className="flex justify-between" key={item.role}>
              <span className="capitalize">{item.role}</span>
              <span className="font-semibold">
                {item.count.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PatronTiers({
  patronsByTier,
}: {
  patronsByTier: { tier: string; count: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Patrons por Tier</CardTitle>
      </CardHeader>
      <CardContent>
        {patronsByTier.length === 0 ? (
          <p className="text-muted-foreground">No hay patrons activos</p>
        ) : (
          <ul className="space-y-2">
            {patronsByTier.map((item) => (
              <li className="flex justify-between" key={item.tier}>
                <span className="capitalize">{item.tier}</span>
                <span className="font-semibold">
                  {item.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
