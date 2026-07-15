import { createFormHook } from "@tanstack/react-form";
import dynamic from "next/dynamic";

import { fieldContext, formContext } from "@/components/forms/form-context";
import { MediaField } from "@/components/forms/media-field";
import { MultiSelectField } from "@/components/forms/multi-select-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";

const BlockNoteField = dynamic(
  async () => {
    const { BlockNoteField: Field } =
      await import("@/components/forms/blocknote-field");
    return Field;
  },
  { ssr: false }
);

export const { useAppForm, useTypedAppFormContext, withForm } = createFormHook({
  fieldComponents: {
    BlockNoteField,
    MediaField,
    MultiSelectField,
    SelectField,
    TextField,
    TextareaField,
  },
  fieldContext,
  formComponents: {
    SubmitButton,
  },
  formContext,
});
