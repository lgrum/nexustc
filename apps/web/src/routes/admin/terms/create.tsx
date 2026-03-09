import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type TAXONOMIES, TAXONOMY_DATA } from "@repo/shared/constants";
import { termCreateSchema } from "@repo/shared/schemas";
import { useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { TermBadge } from "@/components/term-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ColorPickerField } from "@/components/ui/color-picker-field";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc } from "@/lib/orpc";

export const Route = createFileRoute("/admin/terms/create")({
  component: RouteComponent,
});

function RouteComponent() {
  const [useCustomColors, setUseCustomColors] = useState(false);
  const mutation = useMutation(orpc.term.create.mutationOptions());
  const form = useAppForm({
    validators: {
      onSubmit: termCreateSchema,
    },
    defaultValues: {
      name: "",
      color1: "",
      color2: "",
      textColor: "",
      taxonomy: "" as (typeof TAXONOMIES)[number],
    },
    onSubmit: async ({
      value: { name, color1, color2, textColor, taxonomy },
    }) => {
      let finalColor = "";

      // Only build color string if custom colors are enabled
      if (useCustomColors) {
        const colors: string[] = [];

        if (color1) {
          colors.push(color1);
        }
        if (color2) {
          colors.push(color2);
        }
        if (textColor) {
          colors.push(`@${textColor}`);
        }

        finalColor = colors.join(",");
      }

      try {
        toast.loading("Creando...", { id: "submitting" });
        await mutation.mutateAsync({ name, color: finalColor, taxonomy });
        toast.dismiss("submitting");
        toast.success("Creado!");
        form.resetField("name");
      } catch (error) {
        toast.error(`Error al crear: ${error}`);
      } finally {
        toast.dismiss("submitting");
      }
    },
  });

  const values = useStore(form.store, (state) => ({
    name: state.values.name,
    color1: state.values.color1,
    color2: state.values.color2,
    textColor: state.values.textColor,
  }));

  // Generate preview color string for TermBadge
  const previewColor = useCustomColors
    ? (() => {
        const colors: string[] = [];
        if (values.color1) {
          colors.push(values.color1);
        }
        if (values.color2) {
          colors.push(values.color2);
        }
        if (values.textColor) {
          colors.push(`@${values.textColor}`);
        }
        return colors.join(",");
      })()
    : "";

  return (
    <form
      className="flex h-full items-center justify-center"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Crear Término</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name Field */}
          <form.AppField name="name">
            {(field) => (
              <field.TextField label="Nombre" placeholder="Nombre" required />
            )}
          </form.AppField>

          {/* Taxonomy Field */}
          <form.AppField name="taxonomy">
            {(field) => (
              <field.SelectField
                label="Taxonomía"
                options={Object.entries(TAXONOMY_DATA).map(([key, value]) => ({
                  value: key,
                  label: value.label,
                }))}
                required
              />
            )}
          </form.AppField>

          {/* Custom Colors Switch */}
          <Field className="flex flex-row items-center justify-between">
            <Label htmlFor="use-custom-colors">
              Usar colores personalizados
            </Label>
            <Switch
              checked={useCustomColors}
              id="use-custom-colors"
              onCheckedChange={(checked) => {
                setUseCustomColors(checked);
                // Clear color fields when disabling custom colors
                if (!checked) {
                  form.setFieldValue("color1", "");
                  form.setFieldValue("color2", "");
                  form.setFieldValue("textColor", "");
                }
              }}
            />
          </Field>

          {/* Color Pickers - Only shown when custom colors are enabled */}
          {useCustomColors && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <form.AppField name="color1">
                  {(field) => (
                    <ColorPickerField
                      id="term-color-1"
                      label="Color 1 (Inicio)"
                      onChange={(value) => field.handleChange(value)}
                      value={field.state.value || "#ffffff"}
                    />
                  )}
                </form.AppField>
                <form.AppField name="color2">
                  {(field) => (
                    <ColorPickerField
                      id="term-color-2"
                      label="Color 2 (Fin)"
                      onChange={(value) => field.handleChange(value)}
                      value={field.state.value || "#ffffff"}
                    />
                  )}
                </form.AppField>
                <form.AppField name="textColor">
                  {(field) => (
                    <ColorPickerField
                      id="term-text-color"
                      label="Color de texto"
                      onChange={(value) => field.handleChange(value)}
                      value={field.state.value || "#ffffff"}
                    />
                  )}
                </form.AppField>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  form.setFieldValue("color1", "");
                  form.setFieldValue("color2", "");
                  form.setFieldValue("textColor", "");
                }}
                type="button"
                variant="outline"
              >
                <HugeiconsIcon icon={Cancel01Icon} />
                Limpiar colores
              </Button>
            </div>
          )}

          {/* Preview using actual TermBadge component */}
          <Field className="gap-3">
            <Label>Vista previa</Label>
            <div>
              <TermBadge
                tag={{
                  name: values.name || "Vista previa",
                  color: previewColor,
                }}
              />
            </div>
          </Field>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <form.AppForm>
            <form.SubmitButton className="w-full">Crear</form.SubmitButton>
          </form.AppForm>
        </CardFooter>
      </Card>
    </form>
  );
}
