import { useState } from "react";

import { cn } from "@/lib/utils";

type StarRatingInputProps = {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
};

export function StarRatingInput({
  value,
  onChange,
  max = 10,
  size = "md",
  disabled = false,
  className,
}: StarRatingInputProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const displayValue = hoverValue ?? value;

  const sizeClasses = {
    lg: "size-6 sm:size-8",
    md: "size-5 sm:size-6",
    sm: "size-4",
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent) => {
    if (disabled) {
      return;
    }

    switch (event.key) {
      case "ArrowLeft": {
        event.preventDefault();
        if (value > 1) {
          onChange(value - 1);
        }
        break;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (value < max) {
          onChange(value + 1);
        }
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        onChange(index + 1);
        break;
      }
      default: {
        break;
      }
    }
  };

  return (
    <div
      aria-label="Rating"
      className={cn(
        "flex max-w-full flex-wrap items-center justify-center gap-0.5 sm:gap-1",
        className
      )}
      onMouseLeave={() => setHoverValue(null)}
      role="radiogroup"
    >
      {Array.from({ length: max }, (_, i) => {
        const starValue = i + 1;
        const isFilled = starValue <= displayValue;

        return (
          <button
            aria-checked={starValue === value}
            aria-label={`${starValue} star${starValue === 1 ? "" : "s"}`}
            className={cn(
              "transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              !disabled && "cursor-pointer hover:scale-110",
              disabled && "cursor-not-allowed opacity-50"
            )}
            disabled={disabled}
            key={`star-${starValue}`}
            onClick={() => {
              if (!disabled) {
                onChange(starValue);
              }
            }}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onMouseEnter={() => {
              if (!disabled) {
                setHoverValue(starValue);
              }
            }}
            role="radio"
            type="button"
          >
            <svg
              aria-hidden="true"
              className={cn(
                sizeClasses[size],
                "transition-colors",
                isFilled
                  ? "fill-amber-400 text-amber-400"
                  : "fill-none text-gray-400"
              )}
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
