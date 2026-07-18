export function SpinningDots({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle className="spinner_nOfF" cx="4" cy="12" r="3" />
      <circle className="spinner_nOfF spinner_fVhf" cx="4" cy="12" r="3" />
      <circle className="spinner_nOfF spinner_piVe" cx="4" cy="12" r="3" />
      <circle className="spinner_nOfF spinner_MSNs" cx="4" cy="12" r="3" />
    </svg>
  );
}

export function PageLoading() {
  return (
    <div
      aria-label="Cargando"
      className="grid min-h-[60vh] place-content-center gap-4 px-4 text-center"
      role="status"
    >
      <SpinningDots className="mx-auto h-12 w-12 fill-primary" />
    </div>
  );
}
