'use client';

/** 위험 작업용 — confirm 후 submit */
export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
  title,
  disabled,
}: {
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      title={title}
      disabled={disabled}
      className={className}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
