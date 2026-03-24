import type React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const Icon = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "absolute size-6 border-zinc-700 dark:border-zinc-200",
      className
    )}
    {...props}
  />
);

const Icons = () => (
  <>
    <Icon className="-top-0.5 -left-0.5 rounded-tl-lg border-t-2 border-l-2" />
    <Icon className="-top-0.5 -right-0.5 rounded-tr-lg border-t-2 border-r-2" />
    <Icon className="-bottom-0.5 -left-0.5 rounded-bl-lg border-b-2 border-l-2" />
    <Icon className="-right-0.5 -bottom-0.5 rounded-br-lg border-r-2 border-b-2" />
  </>
);

export const Card_5 = ({
  title,
  content,
}: {
  title: React.ReactNode;
  content: React.ReactNode;
}) => (
  <Card className="relative rounded-md bg-muted/20">
    <Icons />
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent>{content}</CardContent>
  </Card>
);
