"use client";

import { type ChangeEvent, useState } from "react";

import { Icon } from "./icon";

/**
 * A file input in Arabic. The browser's own control speaks the browser's
 * language ("Choose File · No file chosen"); this keeps the native input for
 * keyboard and screen readers, hides it, and shows the choice in Arabic.
 */
export function FilePicker({
  id,
  accept,
  onChange,
}: {
  id: string;
  accept: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const [name, setName] = useState<string | null>(null);
  return (
    <div className="file-picker">
      <input
        id={id}
        type="file"
        className="file-picker__input"
        accept={accept}
        onChange={(event) => {
          setName(event.target.files?.[0]?.name ?? null);
          onChange(event);
        }}
      />
      <label htmlFor={id} className="btn btn--ghost btn--small file-picker__button">
        <Icon name="layers" /> اختر ملفًا
      </label>
      <bdi className={name ? "file-picker__name" : "file-picker__name muted"}>
        {name ?? "لم تختر ملفًا بعد"}
      </bdi>
    </div>
  );
}
