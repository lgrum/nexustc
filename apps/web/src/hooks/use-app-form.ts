import { createFormHook } from "@tanstack/react-form";

import { fieldContext, formContext } from "@/components/forms/form-context";
import { MultiSelectField } from "@/components/forms/multi-select-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";

export const { useAppForm, useTypedAppFormContext, withForm } = createFormHook({
  fieldComponents: {
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
