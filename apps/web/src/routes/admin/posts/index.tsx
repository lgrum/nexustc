import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { columns } from "@/components/admin/posts/columns";
import { DataTable } from "@/components/admin/posts/data-table";
import { orpc } from "@/lib/orpc";

export const Route = createFileRoute("/admin/posts/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { data } = useSuspenseQuery(
    orpc.post.admin.getDashboardList.queryOptions()
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="font-bold text-3xl">Posts</h1>
      <DataTable columns={columns} contentType="posts" data={data} />
    </div>
  );
}
