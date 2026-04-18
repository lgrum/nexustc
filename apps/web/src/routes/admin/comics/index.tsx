import { createFileRoute } from "@tanstack/react-router";

import { columns } from "@/components/admin/comics/columns";
import { DataTable } from "@/components/admin/posts/data-table";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/admin/comics/")({
  component: RouteComponent,
  gcTime: 0,
  loader: () => orpcClient.comic.admin.getDashboardList(),
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="font-bold text-3xl">Cómics</h1>
      <DataTable columns={columns} contentType="comics" data={data} />
    </div>
  );
}
