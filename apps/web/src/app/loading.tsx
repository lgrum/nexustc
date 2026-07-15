import { LoadingSpinner } from "@/components/loading-spinner";

export default function Loading() {
  return (
    <div className="grid min-h-[40vh] place-content-center">
      <LoadingSpinner className="size-8" />
    </div>
  );
}
