import {
  engagementPromptListFromTextarea,
  engagementPromptListToTextarea,
} from "@repo/shared/engagement-prompts";

import { FieldDescription, FieldError } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ManualEngagementQuestionsFieldProps = {
  value: string[];
  onChange: (value: string[]) => void;
  errors?: ({ message?: string } | undefined)[];
};

export function ManualEngagementQuestionsField({
  value,
  onChange,
  errors,
}: ManualEngagementQuestionsFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="manual-engagement-questions">Preguntas manuales</Label>
      <FieldDescription>
        Una por línea. Deben provocar postura, tensión o contradicción sin caer
        en descripciones gráficas.
      </FieldDescription>
      <Textarea
        className="min-h-36"
        id="manual-engagement-questions"
        onChange={(event) => {
          onChange(engagementPromptListFromTextarea(event.target.value));
        }}
        placeholder={[
          "Seamos honestos... qué pesa más acá: el diseno o la fantasia de poder?",
          "Nadie lo dice, pero... este protagonista suma tension o la arruina?",
        ].join("\n")}
        value={engagementPromptListToTextarea(value)}
      />
      <FieldDescription>
        Máximo 2 preguntas y 220 caracteres por línea. Si repites una pregunta,
        se deduplica al guardar.
      </FieldDescription>
      <FieldError errors={errors} />
    </div>
  );
}
