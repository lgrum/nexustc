import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

export function TutorialCard({
  tutorial,
}: {
  tutorial: { title: string; description: string; embedUrl: string };
}) {
  return (
    <Card key={tutorial.title}>
      {(tutorial.title || tutorial.description) && (
        <CardHeader>
          {tutorial.title && <CardTitle>{tutorial.title}</CardTitle>}
          {tutorial.description && (
            <CardDescription>{tutorial.description}</CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className="mt-auto">
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="aspect-video w-full"
          referrerPolicy="strict-origin-when-cross-origin"
          src={tutorial.embedUrl}
          title="YouTube video player"
        />
      </CardContent>
    </Card>
  );
}
