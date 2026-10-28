---
id: react-hook-form-zod
name: React Hook Form + Zod
category: library
version: 1.0.0
order: 40
description: One Zod schema for field types, resolver errors, and server parsing.
scope: auto
globs:
  - "{{src}}**/forms/**/*.ts"
  - "{{src}}**/forms/**/*.tsx"
  - "{{src}}**/*.form.ts"
  - "{{src}}**/*.form.tsx"
detect:
  packages: ["react-hook-form", "zod", "@hookform/resolvers"]
appliesTo:
  react-hook-form: ">=7"
  zod: ">=4"
compatibleWith:
  - nextjs-app-router
  - nextjs-pages-router
  - react-vite
sources:
  - https://react-hook-form.com/integrations/zod
  - https://react-hook-form.com/faqs
  - https://react-hook-form.com/advanced-usage
  - https://react-hook-form.com/docs/usecontroller/controller
  - https://zod.dev/basics
  - https://zod.dev/v4
verifiedAt: 2026-10-28
---

## Boundary
One Zod object is the form's rules. `z.infer` is that schema's output type. `zodResolver` copies Zod issues into `formState.errors`. `register` attaches a native input and leaves it uncontrolled. `Controller` attaches a component that takes `value` and `onChange`. Server code parses untrusted input with the same schema's `safeParse` or `parse`.

## Directives
- **ALWAYS** put each rule on the schema and pass that schema to `zodResolver`. **NEVER** copy a schema rule into `register` options.
- **ALWAYS** take submitted values from `z.infer`. When the schema uses `.default()` or `.transform()`, input and output differ: pass `z.input`, `unknown`, and `z.output` to `useForm`.
- **ALWAYS** `register` a native input. **ALWAYS** use `Controller` for a component that takes `value` and `onChange`, and spread `field` only. **NEVER** spread `register` and `field` onto the same element.
- **ALWAYS** set `defaultValues`. A controlled `value` that is `undefined` on the first render starts the input uncontrolled.
- **ALWAYS** convert a numeric HTML input with `{ valueAsNumber: true }` or with `z.coerce.number()` in the schema. **NEVER** pass the raw input string to `z.number()`.
- **ALWAYS** point the label at the input with `htmlFor`, set `aria-invalid` from that field's error, and render `error.message` in an element with `role="alert"` whose `id` is the input's `aria-describedby`.
- **ALWAYS** run this schema's `safeParse` or `parse` on untrusted server input. **NEVER** accept a client payload because the form already validated it.

## Contract
```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";

export const profileSchema = z.object({
  name: z.string().min(1, { error: "Enter your name" }),
});

type ProfileValues = z.infer<typeof profileSchema>;

export function parseProfile(input: unknown) {
  return profileSchema.safeParse(input);
}

export function ProfileForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "" },
  });
  const onSubmit: SubmitHandler<ProfileValues> = (values) => {
    console.log(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <label htmlFor="name">Name</label>
      <input
        id="name"
        aria-invalid={errors.name ? "true" : "false"}
        aria-describedby={errors.name ? "name-error" : undefined}
        {...register("name")}
      />
      {errors.name && (
        <p id="name-error" role="alert">
          {errors.name.message}
        </p>
      )}
    </form>
  );
}

// ❌ Anti-pattern: the schema rule is copied into register, and the error is silent
<input {...register("name", { required: "Enter your name" })} />
```
