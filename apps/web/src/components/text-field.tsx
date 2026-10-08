import type { InputHTMLAttributes } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

interface TextFieldProps {
  label: string;
  hint?: string;
  error?: string | undefined;
  registration: UseFormRegisterReturn;
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
  autoComplete?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  /** Emails, phone numbers and passwords read left-to-right even on an RTL page. */
  ltr?: boolean;
}

export function TextField({
  label,
  hint,
  error,
  registration,
  type = "text",
  autoComplete,
  inputMode,
  ltr = false,
}: TextFieldProps) {
  const id = `field-${registration.name}`;
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field__input"
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        dir={ltr ? "ltr" : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...registration}
      />
      {hint ? (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
