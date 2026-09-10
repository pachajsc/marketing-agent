import type { QuestionFieldDef } from "@/lib/questionnaire-schema";

interface QuestionFieldProps {
  field: QuestionFieldDef;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

const inputClasses =
  "w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-base text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white";

export function QuestionField({ field, label, value, error, onChange }: QuestionFieldProps) {
  return (
    <div className="flex flex-col gap-2 text-left">
      <label className="text-base font-medium text-zinc-800 dark:text-zinc-200">{label}</label>

      {field.type === "text" && (
        <input
          type="text"
          className={inputClasses}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "textarea" && (
        <textarea
          rows={3}
          className={inputClasses}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.type === "choice" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {field.options?.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={`rounded-lg border px-4 py-2 text-left text-sm transition-colors sm:text-center ${
                  selected
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
