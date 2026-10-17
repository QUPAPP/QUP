"use client";

import { type InputHTMLAttributes, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Icon } from "./icon";

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
  const [visible, setVisible] = useState(false);
  const id = `field-${registration.name}`;
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={type === "password" ? "password-field" : undefined}>
        <input
          id={id}
          className="field__input"
          type={type === "password" && visible ? "text" : type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          dir={ltr ? "ltr" : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...registration}
        />
        {type === "password" ? (
          <button
            type="button"
            className="password-toggle"
            aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            aria-pressed={visible}
            aria-controls={id}
            onClick={() => setVisible((value) => !value)}
          >
            <Icon name={visible ? "eye-off" : "eye"} />
          </button>
        ) : null}
      </div>
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
