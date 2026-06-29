"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { columns } from "@/components/admin/comics/columns";
import { DataTable } from "@/components/admin/posts/data-table";
import { orpc } from "@/lib/orpc";

export function ClientPage() {
  const { data } = useSuspenseQuery(
    orpc.comic.admin.getDashboardList.queryOptions()
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="font-bold text-3xl">CÃ³mics</h1>
      <DataTable columns={columns} contentType="comics" data={data} />
    </div>
  );
}
